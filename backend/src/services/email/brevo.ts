import type { Env } from '../../types/bindings'
import { postJson, requireSetting, type OutboundEmail } from './http'

/** Sends through Brevo's transactional API; returns Brevo's message id. */
export async function sendViaBrevo(env: Env, msg: OutboundEmail): Promise<string | null> {
  const key = requireSetting('brevo', 'BREVO_API_KEY', env.BREVO_API_KEY)
  const sender = {
    name: env.EMAIL_FROM_NAME || 'Synthire',
    email: requireSetting('brevo', 'BREVO_FROM_EMAIL', env.BREVO_FROM_EMAIL),
  }
  const data = await postJson('brevo', 'https://api.brevo.com/v3/smtp/email', { 'api-key': key }, {
    sender,
    // Brevo rewrites a free-mail (Gmail) From address; Reply-To keeps replies reaching the sender.
    replyTo: sender,
    to: [{ email: msg.to }],
    subject: msg.subject,
    htmlContent: msg.html,
  })
  return typeof data.messageId === 'string' ? data.messageId : null
}
