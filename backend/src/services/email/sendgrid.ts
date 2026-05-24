import type { Env } from '../../types/bindings'
import type { EmailType } from '../../types/email'
import { logEmail } from '../../db/queries/email'

interface SendGridResponse {
  errors?: { message: string }[]
}

export async function sendEmailViaSendGrid(
  env: Env,
  opts: {
    to: string
    subject: string
    html: string
    emailType: EmailType
    companyId?: string
  }
): Promise<void> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: {
        email: env.SENDGRID_FROM_EMAIL ?? env.RESEND_FROM_EMAIL,
        name: env.RESEND_FROM_NAME,
      },
      subject: opts.subject,
      content: [{ type: 'text/html', value: opts.html }],
    }),
  })

  if (!response.ok) {
    let errorMessage = `SendGrid API error: ${response.status}`
    try {
      const data = (await response.json()) as SendGridResponse
      errorMessage = data.errors?.[0]?.message ?? errorMessage
    } catch {}

    await logEmail(env.DB, {
      recipientEmail: opts.to,
      emailType: opts.emailType,
      subject: opts.subject,
      resendMessageId: null,
      status: 'failed',
      errorMessage,
      companyId: opts.companyId,
    })
    throw new Error(errorMessage)
  }

  await logEmail(env.DB, {
    recipientEmail: opts.to,
    emailType: opts.emailType,
    subject: opts.subject,
    resendMessageId: null,
    status: 'sent',
    errorMessage: null,
    companyId: opts.companyId,
  })
}
