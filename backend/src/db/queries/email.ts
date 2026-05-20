import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { EmailType } from '../../types/email'
import type { EmailLogRow, EmailPreferencesRow } from '../../types/db'

export async function queueEmail(
  db: D1Database,
  opts: {
    recipientEmail: string
    emailType: EmailType
    templateData: Record<string, unknown>
    scheduledFor?: Date
    maxRetries?: number
  }
): Promise<void> {
  const id = nanoid()
  const scheduledFor = opts.scheduledFor ?? new Date()
  const maxRetries = opts.maxRetries ?? 3

  await db
    .prepare(
      `INSERT INTO email_queue (id, recipient_email, email_type, template_data, scheduled_for, max_retries)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      opts.recipientEmail,
      opts.emailType,
      JSON.stringify(opts.templateData),
      scheduledFor.toISOString(),
      maxRetries
    )
    .run()
}

export async function logEmail(
  db: D1Database,
  opts: {
    recipientEmail: string
    emailType: string
    subject: string | null
    resendMessageId: string | null
    status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'
    errorMessage: string | null
    companyId?: string
  }
): Promise<string> {
  const id = nanoid()
  const sentAt = opts.status === 'sent' ? "datetime('now')" : null

  if (sentAt) {
    await db
      .prepare(
        `INSERT INTO email_logs (id, company_id, recipient_email, email_type, resend_message_id, subject, status, error_message, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(
        id,
        opts.companyId ?? null,
        opts.recipientEmail,
        opts.emailType,
        opts.resendMessageId,
        opts.subject,
        opts.status,
        opts.errorMessage
      )
      .run()
  } else {
    await db
      .prepare(
        `INSERT INTO email_logs (id, company_id, recipient_email, email_type, resend_message_id, subject, status, error_message, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))`
      )
      .bind(
        id,
        opts.companyId ?? null,
        opts.recipientEmail,
        opts.emailType,
        opts.resendMessageId,
        opts.subject,
        opts.status,
        opts.errorMessage
      )
      .run()
  }

  return id
}

export async function updateEmailLogStatus(
  db: D1Database,
  resendMessageId: string,
  updates: {
    status: string
    delivered_at?: string
    bounced_at?: string
    complained_at?: string
  }
): Promise<void> {
  const { status, delivered_at, bounced_at, complained_at } = updates

  if (delivered_at) {
    await db
      .prepare('UPDATE email_logs SET status=?, delivered_at=? WHERE resend_message_id=?')
      .bind(status, delivered_at, resendMessageId)
      .run()
  } else if (bounced_at) {
    await db
      .prepare('UPDATE email_logs SET status=?, bounced_at=? WHERE resend_message_id=?')
      .bind(status, bounced_at, resendMessageId)
      .run()
  } else if (complained_at) {
    await db
      .prepare('UPDATE email_logs SET status=?, complained_at=? WHERE resend_message_id=?')
      .bind(status, complained_at, resendMessageId)
      .run()
  } else {
    await db
      .prepare('UPDATE email_logs SET status=? WHERE resend_message_id=?')
      .bind(status, resendMessageId)
      .run()
  }
}

export async function listEmailLogs(
  db: D1Database,
  companyId: string,
  opts: { type?: string; status?: string; page: number; limit: number }
): Promise<{ items: EmailLogRow[]; total: number }> {
  const { type, status, page, limit } = opts
  const offset = (page - 1) * limit

  const conditions: string[] = ['company_id = ?']
  const params: (string | number)[] = [companyId]

  if (type) {
    conditions.push('email_type = ?')
    params.push(type)
  }
  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  const where = conditions.join(' AND ')

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM email_logs WHERE ${where}`)
    .bind(...params)
    .first<{ total: number }>()

  const items = await db
    .prepare(`SELECT * FROM email_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<EmailLogRow>()

  return {
    items: items.results,
    total: countResult?.total ?? 0,
  }
}

export async function getUserEmailPreferences(
  db: D1Database,
  userId: string
): Promise<EmailPreferencesRow | null> {
  return db
    .prepare('SELECT * FROM email_preferences WHERE user_id = ?')
    .bind(userId)
    .first<EmailPreferencesRow>()
}

export async function updateUserEmailPreferences(
  db: D1Database,
  userId: string,
  updates: Partial<{
    resume_notifications: boolean
    interview_notifications: boolean
    feedback_notifications: boolean
    reminder_notifications: boolean
  }>
): Promise<EmailPreferencesRow | null> {
  const setClauses: string[] = []
  const params: (number | string)[] = []

  if (updates.resume_notifications !== undefined) {
    setClauses.push('resume_notifications = ?')
    params.push(updates.resume_notifications ? 1 : 0)
  }
  if (updates.interview_notifications !== undefined) {
    setClauses.push('interview_notifications = ?')
    params.push(updates.interview_notifications ? 1 : 0)
  }
  if (updates.feedback_notifications !== undefined) {
    setClauses.push('feedback_notifications = ?')
    params.push(updates.feedback_notifications ? 1 : 0)
  }
  if (updates.reminder_notifications !== undefined) {
    setClauses.push('reminder_notifications = ?')
    params.push(updates.reminder_notifications ? 1 : 0)
  }

  if (setClauses.length === 0) {
    return getUserEmailPreferences(db, userId)
  }

  params.push(userId)
  await db
    .prepare(`UPDATE email_preferences SET ${setClauses.join(', ')} WHERE user_id = ?`)
    .bind(...params)
    .run()

  return getUserEmailPreferences(db, userId)
}
