import type { Env } from '../../types/bindings'
import type { EmailType } from '../../types/email'
import { logEmail } from '../../db/queries/email'

interface ResendResponse {
  id?: string
  statusCode?: number
  message?: string
}

export async function sendEmail(
  env: Env,
  opts: {
    to: string
    subject: string
    html: string
    emailType: EmailType
    companyId?: string
  }
): Promise<string | null> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  })

  const data = (await response.json()) as ResendResponse

  if (!response.ok) {
    await logEmail(env.DB, {
      recipientEmail: opts.to,
      emailType: opts.emailType,
      subject: opts.subject,
      resendMessageId: null,
      status: 'failed',
      errorMessage: data.message ?? `HTTP ${response.status}`,
      companyId: opts.companyId,
    })
    throw new Error(data.message ?? `Resend API error: ${response.status}`)
  }

  // Success path
  await logEmail(env.DB, {
    recipientEmail: opts.to,
    emailType: opts.emailType,
    subject: opts.subject,
    resendMessageId: data.id ?? null,
    status: 'sent',
    errorMessage: null,
    companyId: opts.companyId,
  })
  return data.id ?? null
}
