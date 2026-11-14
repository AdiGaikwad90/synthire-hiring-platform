import type { Env } from '../../types/bindings'
import { postJson, requireSetting, type OutboundEmail } from './http'

/**
 * Sends through Resend; returns Resend's email id. Without a verified domain
 * Resend only delivers to the account owner and answers 403 for anyone else.
 */
export async function sendViaResend(env: Env, msg: OutboundEmail): Promise<string | null> {
  const key = requireSetting('resend', 'RESEND_API_KEY', env.RESEND_API_KEY)
  const from = requireSetting('resend', 'RESEND_FROM_EMAIL', env.RESEND_FROM_EMAIL)
  const data = await postJson('resend', 'https://api.resend.com/emails', { Authorization: `Bearer ${key}` }, {
    from: `${env.EMAIL_FROM_NAME || 'Synthire'} <${from}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  })
  return typeof data.id === 'string' ? data.id : null
}
