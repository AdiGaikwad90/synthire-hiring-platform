import { z } from 'zod'
import type { Env } from '../../types/bindings'
import type { EmailType } from '../../types/email'
import { logEmail } from '../../db/queries/email'
import { EmailSendError, type OutboundEmail } from './http'
import { sendViaBrevo } from './brevo'
import { sendViaResend } from './resend'

const PROVIDERS = ['brevo', 'resend'] as const
export type EmailProvider = (typeof PROVIDERS)[number]

const SENDERS: Record<EmailProvider, (env: Env, msg: OutboundEmail) => Promise<string | null>> = {
  brevo: sendViaBrevo,
  resend: sendViaResend,
}

function parseProvider(setting: string, value: string | undefined): EmailProvider | null {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return null
  const match = PROVIDERS.find((p) => p === v)
  if (!match) throw new Error(`${setting} is "${v}" — expected one of: ${PROVIDERS.join(', ')}`)
  return match
}

/**
 * The providers to try, in order: EMAIL_PROVIDER, then EMAIL_FALLBACK_PROVIDER
 * if set. Throws on anything unrecognised — the old router quietly sent every
 * unknown value to Resend.
 */
export function resolveEmailProviders(env: Env): EmailProvider[] {
  const primary = parseProvider('EMAIL_PROVIDER', env.EMAIL_PROVIDER)
  if (!primary) throw new Error(`EMAIL_PROVIDER is not set — expected one of: ${PROVIDERS.join(', ')}`)
  const fallback = parseProvider('EMAIL_FALLBACK_PROVIDER', env.EMAIL_FALLBACK_PROVIDER)
  if (fallback === primary) throw new Error('EMAIL_FALLBACK_PROVIDER must differ from EMAIL_PROVIDER')
  return fallback ? [primary, fallback] : [primary]
}

// Domains reserved for testing and documentation (RFC 2606 / 6761): mail to them can only bounce.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|test|example|invalid|localhost)$/i

/** True for an address that can never receive mail, e.g. the fake ones in sample resumes. */
export function isReservedTestAddress(address: string): boolean {
  const at = address.lastIndexOf('@')
  return at > 0 && RESERVED_DOMAIN.test(address.slice(at + 1).trim())
}

const validAddress = z.string().email()

/**
 * Sends one email: EMAIL_PROVIDER first, then EMAIL_FALLBACK_PROVIDER if it
 * fails for any reason. Every attempt is written to email_logs with its
 * provider. Returns the provider that delivered, or null for a reserved test
 * address, which is never sent.
 *
 * Throws EmailSendError: `recipient` for an address no provider is asked to
 * try, `limit` when every provider was at its sending limit, else `other`.
 *
 * Known edge: a provider that times out after accepting the email is followed
 * by the fallback, so the recipient can get it twice. A duplicate was chosen
 * over a missing interview invitation.
 */
export async function sendEmail(
  env: Env,
  opts: OutboundEmail & { emailType: EmailType; companyId?: string },
): Promise<EmailProvider | null> {
  const providers = resolveEmailProviders(env)
  const msg = { ...opts, to: opts.to.trim() }
  // Best effort: a logging failure must never change whether an email counts as sent.
  const log = (status: 'sent' | 'failed' | 'skipped', provider: EmailProvider | null, messageId: string | null, errorMessage: string | null) =>
    logEmail(env.DB, {
      recipientEmail: msg.to, emailType: msg.emailType, subject: msg.subject, companyId: msg.companyId,
      resendMessageId: messageId, status, errorMessage, provider,
    }).catch((err) => console.error('[email] could not write email_logs', err))

  if (isReservedTestAddress(msg.to)) {
    await log('skipped', null, null, 'Reserved test address — not sent')
    return null
  }
  if (!validAddress.safeParse(msg.to).success) {
    const reason = `Not a valid email address: ${JSON.stringify(msg.to.slice(0, 100))}`
    await log('failed', null, null, reason)
    throw new EmailSendError(reason, 'recipient')
  }

  const failures: EmailSendError[] = []
  for (const provider of providers) {
    let messageId: string | null
    try {
      messageId = await SENDERS[provider](env, msg)
    } catch (err) {
      const failure = err instanceof EmailSendError
        ? err
        : new EmailSendError(`${provider}: ${err instanceof Error ? err.message : String(err)}`)
      failures.push(failure)
      await log('failed', provider, null, failure.message)
      continue
    }
    await log('sent', provider, messageId, null)
    return provider
  }
  throw new EmailSendError(
    failures.map((f) => f.message).join('; '),
    failures.every((f) => f.kind === 'limit') ? 'limit' : 'other',
  )
}
