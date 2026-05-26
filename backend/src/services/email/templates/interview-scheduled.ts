import type { InterviewScheduledTemplateData } from '../../../types/email'
import { escapeHtml, safeHref } from '../../../utils/html'

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

export function renderInterviewScheduled(data: InterviewScheduledTemplateData): { subject: string; html: string } {
  const subject = `Interview Confirmed — ${data.companyName}`
  const unsubscribeUrl = `${safeHref(data.frontendUrl)}/unsubscribe`

  const calendarSubject = encodeURIComponent(`Interview with ${data.companyName} — ${data.jobTitle}`)
  const calendarBody = encodeURIComponent(
    `Interview scheduled for ${formatDateTime(data.scheduledAt)}\nDuration: ${data.durationMinutes} minutes${data.videoLink ? `\nVideo Link: ${data.videoLink}` : ''}`
  )
  const calendarHref = `mailto:?subject=${calendarSubject}&body=${calendarBody}`

  const videoSection = data.videoLink
    ? `<p style="color: #374151; margin: 8px 0;"><strong>Video Link:</strong> <a href="${safeHref(data.videoLink)}" style="color: #6366F1;">${escapeHtml(data.videoLink)}</a></p>`
    : ''

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">Your Interview is Confirmed</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Hi ${escapeHtml(data.candidateName)}, we look forward to meeting you! Here are the details for your upcoming interview.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Company:</strong> ${escapeHtml(data.companyName)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${escapeHtml(data.jobTitle)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Date &amp; Time:</strong> ${escapeHtml(formatDateTime(data.scheduledAt))}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Duration:</strong> ${escapeHtml(data.durationMinutes)} minutes</p>
      ${videoSection}
    </div>

    <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 16px 0;">
      Please make sure to join a few minutes early so we can get started on time. If you have any questions or need to reschedule, feel free to reach out.
    </p>

    <a href="${calendarHref}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">Add to Calendar</a>

    <p style="color: #374151; font-size: 14px; margin: 16px 0;">We look forward to speaking with you!</p>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
