import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { EmailType } from '../../types/email'

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
