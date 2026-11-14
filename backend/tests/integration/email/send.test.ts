import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { sendEmail } from '../../../src/services/email/send'
import { processEmailQueue } from '../../../src/services/email/queue'
import { EmailSendError } from '../../../src/services/email/http'
import { insertQueuedEmail } from '../../setup/factories'
import type { Env } from '../../../src/types/bindings'

/**
 * SYN-004 — one sending function: EMAIL_PROVIDER first, EMAIL_FALLBACK_PROVIDER
 * if it fails, and email_logs records who handled each attempt.
 *
 * Before: the app was wired to one provider whose free allowance had ended, so
 * every email failed three times and was dropped; there was no second provider.
 *
 * Both providers are stand-ins here — a test must never send real email.
 */

type Answer = { status: number; body: unknown } | Error
const ok = { brevo: { status: 201, body: { messageId: '<b-1@brevo>' } }, resend: { status: 200, body: { id: 're_1' } } }
const limit: Answer = { status: 429, body: { message: 'daily quota reached' } }
const down: Answer = { status: 500, body: { message: 'server exploded' } }

let fetchSpy: ReturnType<typeof vi.spyOn>
let calls: string[]

/** Routes each outbound call to the stand-in for that provider and records the order. */
function providers(answers: { brevo?: Answer; resend?: Answer }) {
  calls = []
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const provider = String(input).includes('brevo.com') ? 'brevo' : 'resend'
    calls.push(provider)
    const answer = answers[provider]
    if (!answer) throw new Error(`unexpected call to ${provider}`)
    if (answer instanceof Error) return Promise.reject(answer)
    return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status }))
  })
}

const testEnv = (over: Partial<Env> = {}) => ({ ...(env as unknown as Env), ...over })
const both = { EMAIL_PROVIDER: 'resend', EMAIL_FALLBACK_PROVIDER: 'brevo' }
const message = (to = 'dana@candidate.dev') => ({ to, subject: 'Interview', html: '<p>Hi</p>', emailType: 'interview_scheduled' as const })

const logs = () =>
  env.DB.prepare('SELECT recipient_email, status, provider, resend_message_id, error_message FROM email_logs ORDER BY rowid')
    .all<{ recipient_email: string; status: string; provider: string | null; resend_message_id: string | null; error_message: string | null }>()
    .then((r) => r.results)
const queueRow = (id: string) =>
  env.DB.prepare('SELECT status, sent_at, failed_at, retry_count, limit_deferrals, scheduled_for, last_error FROM email_queue WHERE id = ?').bind(id)
    .first<{ status: string; sent_at: string | null; failed_at: string | null; retry_count: number; limit_deferrals: number; scheduled_for: string; last_error: string | null }>()
const failure = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(EmailSendError)
  return err as EmailSendError
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM email_queue'), env.DB.prepare('DELETE FROM email_logs')])
})
afterEach(() => fetchSpy?.mockRestore())

describe('sendEmail — happy path', () => {
  it('sends through EMAIL_PROVIDER and logs the provider with its message id', async () => {
    providers({ brevo: ok.brevo })
    await expect(sendEmail(testEnv(), message())).resolves.toBe('brevo')
    expect(calls).toEqual(['brevo'])
    expect(await logs()).toEqual([
      { recipient_email: 'dana@candidate.dev', status: 'sent', provider: 'brevo', resend_message_id: '<b-1@brevo>', error_message: null },
    ])
  })
})

describe('sendEmail — positive variants (switching is a config change)', () => {
  it('uses Resend first when EMAIL_PROVIDER says so, and leaves the fallback alone on success', async () => {
    providers({ resend: ok.resend })
    await expect(sendEmail(testEnv(both), message())).resolves.toBe('resend')
    expect(calls).toEqual(['resend'])
  })

  it('trims stray whitespace around the recipient', async () => {
    providers({ brevo: ok.brevo })
    await sendEmail(testEnv(), message('  dana@candidate.dev\n'))
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).to).toEqual([{ email: 'dana@candidate.dev' }])
  })
})

describe('sendEmail — fallback', () => {
  it.each([
    ['a server error', down],
    ['a sending limit', limit],
    ['a rejected key', { status: 401, body: { message: 'API key is invalid' } }],
    // What Resend really answers without a verified domain.
    ['the no-domain refusal', { status: 403, body: { message: 'You can only send testing emails to your own email address' } }],
    ['no response at all', new Error('The operation was aborted due to timeout')],
  ] as [string, Answer][])('delivers through the fallback after %s, and logs both attempts', async (_name, answer) => {
    providers({ resend: answer, brevo: ok.brevo })
    await expect(sendEmail(testEnv(both), message())).resolves.toBe('brevo')
    expect(calls).toEqual(['resend', 'brevo'])
    const rows = await logs()
    expect(rows.map((r) => [r.provider, r.status])).toEqual([['resend', 'failed'], ['brevo', 'sent']])
    expect(rows[0].error_message).toMatch(/^resend: /)
  })

  it('does not try a fallback when none is configured', async () => {
    providers({ brevo: down })
    const err = await failure(sendEmail(testEnv(), message()))
    expect(calls).toEqual(['brevo'])
    expect(err.message).toBe('brevo: server exploded')
  })
})

describe('sendEmail — error contract when every provider fails', () => {
  it('reports both providers\' errors', async () => {
    providers({ resend: down, brevo: { status: 401, body: { message: 'Key not found' } } })
    const err = await failure(sendEmail(testEnv(both), message()))
    expect(err.kind).toBe('other')
    expect(err.message).toBe('resend: server exploded; brevo: Key not found')
    expect((await logs()).map((r) => [r.provider, r.status])).toEqual([['resend', 'failed'], ['brevo', 'failed']])
  })

  it('is a "limit" failure only when every provider was at its limit', async () => {
    providers({ resend: limit, brevo: limit })
    expect((await failure(sendEmail(testEnv(both), message()))).kind).toBe('limit')
    providers({ resend: limit, brevo: down })
    expect((await failure(sendEmail(testEnv(both), message()))).kind).toBe('other')
  })
})

describe('sendEmail — invalid recipient (no provider is asked)', () => {
  // Includes a hostile case: a header-injection attempt must never reach a provider.
  it.each([[''], ['not-an-address'], ['dana@'], ['dana@candidate.dev\nBcc: thief@evil.io'], ['a@b.co, c@d.co']])('%j fails as "recipient"', async (to) => {
    providers({})
    const err = await failure(sendEmail(testEnv(both), message(to)))
    expect(err.kind).toBe('recipient')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await logs()).map((r) => [r.status, r.provider])).toEqual([['failed', null]])
  })
})

describe('sendEmail — reserved test addresses', () => {
  it('skips an address that can only bounce, without spending any provider\'s allowance', async () => {
    providers({})
    await expect(sendEmail(testEnv(both), message('marcus.lee@example.com'))).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await logs()).map((r) => [r.status, r.provider])).toEqual([['skipped', null]])
  })
})

describe('sendEmail — misconfiguration', () => {
  it('throws on an unknown provider instead of quietly picking one', async () => {
    providers({})
    await expect(sendEmail(testEnv({ EMAIL_PROVIDER: 'mailgun' }), message())).rejects.toThrow(/EMAIL_PROVIDER.*"mailgun"/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('processEmailQueue — provider outcomes', () => {
  it('marks the row sent when the fallback delivered', async () => {
    providers({ resend: down, brevo: ok.brevo })
    const id = await insertQueuedEmail(env.DB)
    await processEmailQueue(testEnv(both))
    expect(await queueRow(id)).toMatchObject({ status: 'sent', retry_count: 0, last_error: null })
    expect((await queueRow(id))!.sent_at).not.toBeNull()
  })

  it('closes a reserved test address as skipped: not sent, not failed, never retried', async () => {
    providers({})
    const id = await insertQueuedEmail(env.DB, { recipient_email: 'priya@example.com' })
    await processEmailQueue(testEnv())
    await processEmailQueue(testEnv())
    expect(await queueRow(id)).toMatchObject({ status: 'skipped', sent_at: null, failed_at: null, retry_count: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails an invalid recipient at once, without retrying', async () => {
    providers({})
    const id = await insertQueuedEmail(env.DB, { recipient_email: 'not-an-address' })
    await processEmailQueue(testEnv())
    const row = await queueRow(id)
    expect(row).toMatchObject({ status: 'failed', retry_count: 0 })
    expect(row!.failed_at).not.toBeNull()
    expect(row!.last_error).toContain('not-an-address')
  })
})

describe('processEmailQueue — sending limits (boundaries)', () => {
  it('waits an hour without using up a retry when the provider is at its limit', async () => {
    providers({ brevo: limit })
    const id = await insertQueuedEmail(env.DB, { max_retries: 1 })
    const before = Date.now()
    await processEmailQueue(testEnv())
    const row = (await queueRow(id))!
    expect(row).toMatchObject({ status: 'pending', retry_count: 0, limit_deferrals: 1, failed_at: null })
    expect(row.last_error).toBe('brevo: daily quota reached')
    const wait = new Date(row.scheduled_for).getTime() - before
    expect(wait).toBeGreaterThanOrEqual(3_600_000)
    expect(wait).toBeLessThan(3_660_000)
  })

  it('still defers on the 24th wait, then goes back to ordinary retries', async () => {
    providers({ brevo: limit })
    const id = await insertQueuedEmail(env.DB, { max_retries: 3 })
    const drainWith = async (deferrals: number) => {
      await env.DB.prepare("UPDATE email_queue SET limit_deferrals = ?, scheduled_for = datetime('now', '-1 minute') WHERE id = ?")
        .bind(deferrals, id).run()
      await processEmailQueue(testEnv())
      return (await queueRow(id))!
    }
    expect(await drainWith(23)).toMatchObject({ limit_deferrals: 24, retry_count: 0 })
    expect(await drainWith(24)).toMatchObject({ limit_deferrals: 24, retry_count: 1, status: 'pending' })
  })
})

describe('processEmailQueue — misconfiguration', () => {
  it('refuses to run and leaves the queue untouched when EMAIL_PROVIDER is not recognised', async () => {
    providers({})
    const id = await insertQueuedEmail(env.DB)
    await expect(processEmailQueue(testEnv({ EMAIL_PROVIDER: 'mailgun' }))).rejects.toThrow(/EMAIL_PROVIDER/)
    expect(await queueRow(id)).toMatchObject({ status: 'pending', retry_count: 0, last_error: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
