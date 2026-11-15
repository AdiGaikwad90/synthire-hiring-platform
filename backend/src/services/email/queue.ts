import type { Env } from '../../types/bindings'
import type { EmailQueueRow } from '../../types/db'
import type { EmailType, TemplateData } from '../../types/email'
import { renderTemplate } from './templates'
import { sendEmail, resolveEmailProviders } from './send'
import { EmailSendError } from './http'

/** An email held back by a sending limit waits this long, at most this many times (24 h), before using retries. */
const LIMIT_WAIT_MS = 60 * 60 * 1000
const MAX_LIMIT_DEFERRALS = 24

export async function processEmailQueue(env: Env): Promise<void> {
  // Before claiming anything: a mistyped provider must stop the drain loudly
  // and leave every email pending, not burn each one's retries.
  resolveEmailProviders(env)

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
         -- datetime() is REQUIRED on both sides. scheduled_for holds a JS
         -- toISOString() value ("2026-09-06T21:18:28.110Z") while
         -- datetime('now') returns "2026-09-06 21:19:28". Comparing them as
         -- raw strings puts 'T' (0x54) after ' ' (0x20), so a row scheduled a
         -- minute ago compares as GREATER than now and is never claimed --
         -- emails only became eligible once the UTC date rolled over.
         AND datetime(scheduled_for) <= datetime('now')
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
      const sentBy = await sendEmail(env, {
        to: item.recipient_email,
        subject,
        html,
        emailType: item.email_type as EmailType,
      })
      if (sentBy === null) {
        // Reserved test address: closed without a send, so it is neither "sent" nor a failure.
        await env.DB.prepare("UPDATE email_queue SET last_error=?, status='skipped' WHERE id=?")
          .bind('Reserved test address — not sent', item.id).run()
        continue
      }
      await env.DB.prepare("UPDATE email_queue SET sent_at=?, last_error=NULL, status='sent' WHERE id=?")
        .bind(now, item.id).run()
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err)
      const kind = err instanceof EmailSendError ? err.kind : 'other'
      const retries = item.retry_count + 1
      const backoffMs = Math.pow(2, item.retry_count) * backoffSeconds * 1000
      if (kind === 'limit' && item.limit_deferrals < MAX_LIMIT_DEFERRALS) {
        // Every provider is at its limit: wait it out without spending a retry.
        await env.DB.prepare("UPDATE email_queue SET limit_deferrals=limit_deferrals+1, scheduled_for=?, last_error=?, status='pending' WHERE id=?")
          .bind(new Date(Date.now() + LIMIT_WAIT_MS).toISOString(), reason, item.id).run()
      } else if (kind === 'recipient' || retries >= item.max_retries) {
        // A bad address fails the same way every time — retrying it is pointless.
        await env.DB.prepare("UPDATE email_queue SET failed_at=?, last_error=?, status='failed' WHERE id=?")
          .bind(now, reason, item.id).run()
      } else {
        const retryAt = new Date(Date.now() + backoffMs).toISOString()
        await env.DB.prepare("UPDATE email_queue SET retry_count=?, scheduled_for=?, last_error=?, status='pending' WHERE id=?")
          .bind(retries, retryAt, reason, item.id).run()
      }
    }
  }
}
