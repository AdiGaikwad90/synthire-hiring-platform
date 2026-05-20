import type { Env } from '../../types/bindings'
import type { EmailQueueRow } from '../../types/db'
import type { EmailType, TemplateData } from '../../types/email'
import { renderTemplate } from './templates'
import { sendEmail } from './resend'

export async function processEmailQueue(env: Env): Promise<void> {
  const now = new Date().toISOString()

  const pending = await env.DB.prepare(`
    SELECT * FROM email_queue
    WHERE sent_at IS NULL
      AND failed_at IS NULL
      AND scheduled_for <= ?
      AND retry_count < max_retries
    ORDER BY scheduled_for ASC
    LIMIT 10
  `).bind(now).all<EmailQueueRow>()

  for (const item of pending.results) {
    try {
      const templateData = JSON.parse(item.template_data) as Record<string, unknown>
      const { subject, html } = renderTemplate(item.email_type as EmailType, templateData as unknown as TemplateData)
      await sendEmail(env, {
        to: item.recipient_email,
        subject,
        html,
        emailType: item.email_type as EmailType,
      })
      await env.DB.prepare('UPDATE email_queue SET sent_at=? WHERE id=?')
        .bind(now, item.id).run()
    } catch (err) {
      const retries = item.retry_count + 1
      const backoffMs = Math.pow(2, item.retry_count) * 60 * 1000
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
