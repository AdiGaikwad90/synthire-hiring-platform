/**
 * Shared transport for the email providers. Native fetch on purpose — the
 * providers' npm packages pull in Node.js dependencies.
 */

/** `limit`: quota or rate limit, worth waiting out. `recipient`: the address can never work. */
export type EmailFailureKind = 'limit' | 'recipient' | 'other'

export class EmailSendError extends Error {
  constructor(message: string, readonly kind: EmailFailureKind = 'other') {
    super(message)
    this.name = 'EmailSendError'
  }
}

export interface OutboundEmail {
  to: string
  subject: string
  html: string
}

const TIMEOUT_MS = 10_000

/** A setting the provider cannot work without; missing fails before any network call. */
export function requireSetting(provider: string, name: string, value: string | undefined): string {
  if (!value) throw new EmailSendError(`${provider}: ${name} is not set`)
  return value
}

/** POSTs JSON; any refusal, timeout or network failure becomes an EmailSendError named after the provider. */
export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new EmailSendError(`${provider}: no response (${err instanceof Error ? err.message : String(err)})`)
  }
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const detail = typeof data.message === 'string' ? data.message : `HTTP ${res.status}`
    // 429 = rate or quota (both providers); 402 / not_enough_credits = Brevo's daily allowance.
    const limit = res.status === 429 || res.status === 402 || data.code === 'not_enough_credits'
    throw new EmailSendError(`${provider}: ${detail}`, limit ? 'limit' : 'other')
  }
  return data
}
