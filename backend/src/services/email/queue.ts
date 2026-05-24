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

  const pending = await env.DB.prepare(`
    SELECT * FROM email_queue
    WHERE sent_at IS NULL
      AND failed_at IS NULL
      AND (last_error IS NULL OR last_error != 'claimed')
      AND scheduled_for <= ?
      AND retry_count < max_retries
    ORDER BY scheduled_for ASC
    LIMIT ?
  `).bind(now, batchSize).all<EmailQueueRow>()

  if (pending.results.length === 0) return

  // Claim all selected items atomically before processing to prevent duplicate sends
  // under concurrent cron invocations. A second cron run will skip rows with last_error='claimed'.
  const ids = pending.results.map(r => r.id)
  const placeholders = ids.map(() => '?').join(', ')
  await env.DB.prepare(
    `UPDATE email_queue SET last_error = 'claimed' WHERE id IN (${placeholders}) AND sent_at IS NULL AND failed_at IS NULL`
  ).bind(...ids).run()

  for (const item of pending.results) {
    try {
      let templateData: Record<string, unknown>
      try {
        templateData = JSON.parse(item.template_data) as Record<string, unknown>
      } catch {
        console.error(`[email-queue] Corrupt template_data for queue item ${item.id}, skipping`)
        await env.DB.prepare('UPDATE email_queue SET failed_at=?, last_error=? WHERE id=?')
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
      await env.DB.prepare('UPDATE email_queue SET sent_at=?, last_error=NULL WHERE id=?')
        .bind(now, item.id).run()
    } catch (err) {
      const retries = item.retry_count + 1
      const backoffMs = Math.pow(2, item.retry_count) * backoffSeconds * 1000
      if (retries >= item.max_retries) {
        await env.DB.prepare('UPDATE email_queue SET failed_at=?, last_error=? WHERE id=?')
          .bind(now, String(err instanceof Error ? err.message : err), item.id).run()
      } else {
        const retryAt = new Date(Date.now() + backoffMs).toISOString()
        await env.DB.prepare('UPDATE email_queue SET retry_count=?, scheduled_for=?, last_error=? WHERE id=?')
          .bind(retries, retryAt, String(err instanceof Error ? err.message : err), item.id).run()
      }
    }
  }
}
