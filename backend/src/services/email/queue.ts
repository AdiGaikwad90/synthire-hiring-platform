import type { Env } from '../../types/bindings'
import type { EmailQueueRow } from '../../types/db'
import type { EmailType, TemplateData } from '../../types/email'
import { renderTemplate } from './templates'
import { sendEmail } from './resend'
import { sendEmailViaSendGrid } from './sendgrid'

export async function processEmailQueue(env: Env): Promise<void> {
  const now = new Date().toISOString()
  const batchSize = parseInt(env.EMAIL_QUEUE_BATCH_SIZE ?? '10', 10)
  const backoffSeconds = parseInt(env.EMAIL_RETRY_BACKOFF_SECONDS ?? '60', 10)

  // Recover emails claimed more than 2 minutes ago that were never completed
  // (handles cron worker crashes mid-processing)
  await env.DB.prepare(
    `UPDATE email_queue SET status = 'pending', claimed_at = NULL
     WHERE status = 'claimed' AND claimed_at < unixepoch() - 120`
  ).run()

  // Atomically claim a batch — single UPDATE...RETURNING ensures no two cron
  // invocations can pick up the same row even if they run concurrently.
  const { results } = await env.DB.prepare(
    `UPDATE email_queue
     SET status = 'claimed', claimed_at = unixepoch()
     WHERE id IN (
       SELECT id FROM email_queue
       WHERE status = 'pending'
         AND scheduled_for <= datetime('now')
         AND retry_count < max_retries
         AND sent_at IS NULL
         AND failed_at IS NULL
       ORDER BY scheduled_for ASC
       LIMIT ?
     )
     RETURNING *`
  ).bind(batchSize).all<EmailQueueRow>()

  const emails = results ?? []

  if (emails.length === 0) return

  for (const item of emails) {
    try {
      let templateData: Record<string, unknown>
      try {
        templateData = JSON.parse(item.template_data) as Record<string, unknown>
      } catch {
        console.error(`[email-queue] Corrupt template_data for queue item ${item.id}, skipping`)
        await env.DB.prepare("UPDATE email_queue SET failed_at=?, last_error=?, status='failed' WHERE id=?")
          .bind(now, 'Corrupt template_data JSON', item.id).run()
        continue
      }
      const { subject, html } = renderTemplate(item.email_type as EmailType, templateData as unknown as TemplateData)
      const provider = (env.EMAIL_PROVIDER ?? 'resend').toLowerCase()
      if (provider === 'sendgrid') {
        await sendEmailViaSendGrid(env, {
          to: item.recipient_email,
          subject,
          html,
          emailType: item.email_type as EmailType,
        })
      } else {
        await sendEmail(env, {
          to: item.recipient_email,
          subject,
          html,
          emailType: item.email_type as EmailType,
        })
      }
      await env.DB.prepare("UPDATE email_queue SET sent_at=?, last_error=NULL, status='sent' WHERE id=?")
        .bind(now, item.id).run()
    } catch (err) {
      const retries = item.retry_count + 1
      const backoffMs = Math.pow(2, item.retry_count) * backoffSeconds * 1000
      if (retries >= item.max_retries) {
        await env.DB.prepare("UPDATE email_queue SET failed_at=?, last_error=?, status='failed' WHERE id=?")
          .bind(now, String(err instanceof Error ? err.message : err), item.id).run()
      } else {
        const retryAt = new Date(Date.now() + backoffMs).toISOString()
        await env.DB.prepare("UPDATE email_queue SET retry_count=?, scheduled_for=?, last_error=?, status='pending' WHERE id=?")
          .bind(retries, retryAt, String(err instanceof Error ? err.message : err), item.id).run()
      }
    }
  }
}
