import type { FeedbackReminderTemplateData } from '../../../types/email'

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function renderFeedbackReminder(data: FeedbackReminderTemplateData): { subject: string; html: string } {
  const subject = `Feedback Pending: ${data.candidateName}`
  const feedbackUrl = `${data.frontendUrl}/interviews/${data.interviewId}`
  const unsubscribeUrl = `${data.frontendUrl}/unsubscribe`

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">Feedback Awaited</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Hi ${data.interviewerName}, your feedback is needed for a recently completed interview.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Candidate:</strong> ${data.candidateName}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${data.jobTitle}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Interview Date:</strong> ${formatDateTime(data.scheduledAt)}</p>
    </div>

    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
      <p style="color: #92400E; font-size: 14px; margin: 0;">
        Your timely feedback helps the hiring team make informed decisions. Please submit your evaluation at your earliest convenience.
      </p>
    </div>

    <a href="${feedbackUrl}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">Submit Feedback</a>

    <p style="color: #9CA3AF; font-size: 13px; margin: 24px 0 0;">If the button doesn't work, copy and paste this link: <a href="${feedbackUrl}" style="color: #6366F1;">${feedbackUrl}</a></p>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
