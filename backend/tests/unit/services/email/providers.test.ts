import { describe, it, expect, afterEach, vi } from 'vitest'
import { sendViaBrevo } from '../../../../src/services/email/brevo'
import { sendViaResend } from '../../../../src/services/email/resend'
import { EmailSendError } from '../../../../src/services/email/http'
import { resolveEmailProviders, isReservedTestAddress } from '../../../../src/services/email/send'
import type { Env } from '../../../../src/types/bindings'

/**
 * SYN-004. The previous provider's free allowance ended and nothing was sent.
 * Brevo replaces it; Resend stays selectable by config. These cover the two HTTP connectors
 * and the settings that choose between them. fetch is stubbed throughout — a
 * test must never send real email.
 */

const env = (over: Partial<Env> = {}) => ({
  BREVO_API_KEY: 'brevo-key',
  BREVO_FROM_EMAIL: 'sender@synthire.dev',
  RESEND_API_KEY: 're_key',
  RESEND_FROM_EMAIL: 'hello@synthire.dev',
  EMAIL_FROM_NAME: 'Synthire',
  ...over,
}) as Env

const msg = { to: 'dana@candidate.dev', subject: 'Interview', html: '<p>Hi</p>' }
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })
const stubFetch = (res: Response | Error) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => res instanceof Error ? Promise.reject(res) : Promise.resolve(res))
const sentBody = (spy: ReturnType<typeof stubFetch>) => JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
const sentHeaders = (spy: ReturnType<typeof stubFetch>) => (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
const failure = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(EmailSendError)
  return err as EmailSendError
}

afterEach(() => vi.restoreAllMocks())

describe('sendViaBrevo — happy path', () => {
  it('posts the message to Brevo with the api-key header and returns the message id', async () => {
    const spy = stubFetch(json({ messageId: '<abc@smtp-relay.mailin.fr>' }, 201))
    await expect(sendViaBrevo(env(), msg)).resolves.toBe('<abc@smtp-relay.mailin.fr>')
    expect(spy.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email')
    expect(sentHeaders(spy)['api-key']).toBe('brevo-key')
    expect(sentBody(spy)).toEqual({
      sender: { name: 'Synthire', email: 'sender@synthire.dev' },
      // Brevo rewrites a free-mail From address, so replies must be steered back.
      replyTo: { name: 'Synthire', email: 'sender@synthire.dev' },
      to: [{ email: 'dana@candidate.dev' }],
      subject: 'Interview',
      htmlContent: '<p>Hi</p>',
    })
  })
})

describe('sendViaBrevo — positive variants', () => {
  it('returns null when Brevo accepts the email without a message id', async () => {
    stubFetch(json({}, 201))
    await expect(sendViaBrevo(env(), msg)).resolves.toBeNull()
  })
})

describe('sendViaBrevo — error contract', () => {
  it.each([
    ['daily credits used up', 402, { code: 'not_enough_credits', message: 'Not enough credits' }, 'limit'],
    ['rate limited', 429, { code: 'too_many_requests', message: 'Slow down' }, 'limit'],
    ['rejected key', 401, { code: 'unauthorized', message: 'Key not found' }, 'other'],
    ['unverified sender', 400, { code: 'invalid_parameter', message: 'sender is not valid' }, 'other'],
    ['server error', 500, { message: 'boom' }, 'other'],
  ] as const)('%s → EmailSendError kind "%4$s" naming the provider', async (_n, status, body, kind) => {
    stubFetch(json(body, status))
    const err = await failure(sendViaBrevo(env(), msg))
    expect(err.kind).toBe(kind)
    expect(err.message).toBe(`brevo: ${body.message}`)
  })

  it('reports the HTTP status when the error body is not JSON', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
    expect((await failure(sendViaBrevo(env(), msg))).message).toBe('brevo: HTTP 502')
  })

  it('turns a network failure or timeout into an EmailSendError', async () => {
    stubFetch(new Error('The operation was aborted due to timeout'))
    const err = await failure(sendViaBrevo(env(), msg))
    expect(err.kind).toBe('other')
    expect(err.message).toBe('brevo: no response (The operation was aborted due to timeout)')
  })
})

describe('sendViaBrevo — empty settings', () => {
  it.each([['BREVO_API_KEY'], ['BREVO_FROM_EMAIL']] as const)('fails without calling Brevo when %s is not set', async (name) => {
    const spy = stubFetch(json({}, 201))
    const err = await failure(sendViaBrevo(env({ [name]: '' }), msg))
    expect(err.message).toBe(`brevo: ${name} is not set`)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('sendViaResend — happy path', () => {
  it('posts the message to Resend with a bearer key and returns the id', async () => {
    const spy = stubFetch(json({ id: 're_123' }, 200))
    await expect(sendViaResend(env(), msg)).resolves.toBe('re_123')
    expect(spy.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    expect(sentHeaders(spy).Authorization).toBe('Bearer re_key')
    expect(sentBody(spy)).toEqual({
      from: 'Synthire <hello@synthire.dev>', to: 'dana@candidate.dev', subject: 'Interview', html: '<p>Hi</p>',
    })
  })
})

describe('sendViaResend — error contract', () => {
  it('classifies a quota answer as a limit', async () => {
    stubFetch(json({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota' }, 429))
    expect((await failure(sendViaResend(env(), msg))).kind).toBe('limit')
  })

  // The real answer Resend gives without a verified domain — the reason Brevo is the provider today.
  it('reports the no-domain refusal as an ordinary failure, so the fallback takes over', async () => {
    stubFetch(json({ name: 'validation_error', message: 'You can only send testing emails to your own email address' }, 403))
    const err = await failure(sendViaResend(env(), msg))
    expect(err.kind).toBe('other')
    expect(err.message).toBe('resend: You can only send testing emails to your own email address')
  })

  it('fails without calling Resend when RESEND_API_KEY is not set', async () => {
    const spy = stubFetch(json({}, 200))
    expect((await failure(sendViaResend(env({ RESEND_API_KEY: '' }), msg))).message).toBe('resend: RESEND_API_KEY is not set')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('resolveEmailProviders — happy path and variants', () => {
  it.each([
    ['brevo', '', ['brevo']],
    ['brevo', undefined, ['brevo']],
    ['resend', 'brevo', ['resend', 'brevo']],
    ['brevo', 'resend', ['brevo', 'resend']],
    [' Brevo ', ' RESEND ', ['brevo', 'resend']],
  ] as const)('EMAIL_PROVIDER=%j EMAIL_FALLBACK_PROVIDER=%j', (primary, fallback, expected) => {
    expect(resolveEmailProviders(env({ EMAIL_PROVIDER: primary, EMAIL_FALLBACK_PROVIDER: fallback }))).toEqual(expected)
  })
})

describe('resolveEmailProviders — invalid and empty settings', () => {
  // The old router sent every unrecognised value to Resend without a word.
  it.each([
    ['mailgun', '', /EMAIL_PROVIDER.*"mailgun"/],
    ['', '', /EMAIL_PROVIDER/],
    [undefined, 'brevo', /EMAIL_PROVIDER/],
    ['brevo', 'smtp', /EMAIL_FALLBACK_PROVIDER.*"smtp"/],
    ['brevo', 'brevo', /must differ/],
  ] as const)('EMAIL_PROVIDER=%j EMAIL_FALLBACK_PROVIDER=%j throws', (primary, fallback, message) => {
    expect(() => resolveEmailProviders(env({ EMAIL_PROVIDER: primary, EMAIL_FALLBACK_PROVIDER: fallback }))).toThrow(message)
  })
})

describe('isReservedTestAddress', () => {
  it('recognises the domains reserved for testing, which can never receive mail', () => {
    for (const a of ['a@example.com', 'a@EXAMPLE.org', 'a@mail.example.net', 'a@synthire.test', 'a@x.invalid', 'a@corp.example', 'a@localhost']) {
      expect(isReservedTestAddress(a), a).toBe(true)
    }
  })

  it('leaves real-looking addresses alone, including ones that only resemble a reserved name', () => {
    for (const a of ['a@gmail.com', 'a@example.com.evil.io', 'a@myexample.com', 'a@contest.dev', 'a@test.local', 'not-an-address']) {
      expect(isReservedTestAddress(a), a).toBe(false)
    }
  })
})
