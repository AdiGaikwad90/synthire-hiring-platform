import type { InterviewScheduledTemplateData } from '../../../types/email'
import { escapeHtml, safeHref } from '../../../utils/html'
import { formatInterviewTime } from '../../../utils/dates'

/** What the name column holds when the resume gave no name. */
const NO_NAME = new Set(['', 'processing...', 'not provided', 'unknown candidate'])

/** Sent when the recruiter wrote no message of their own. The schedule form
 *  opens on the same wording (`frontend/lib/invitation.ts`). */
export function standardInvitationMessage(candidateName: string): string {
  const name = String(candidateName ?? '').trim()
  const firstName = NO_NAME.has(name.toLowerCase()) ? 'there' : name.split(/\s+/)[0]
  return `Hi ${firstName},

We look forward to meeting you! The details of your interview are below.

Please join a few minutes early so we can start on time. If you have any questions or need to reschedule, feel free to reach out.`
}

export function renderInterviewScheduled(data: InterviewScheduledTemplateData): { subject: string; html: string } {
  // The job, as the schedule form's preview shows it; the company is in the body.
  const subject = `Interview Confirmed — ${data.jobTitle}`
  // SYN-009: the recruiter's wording is plain text — escaped, line breaks kept.
  // The facts below it stay server-rendered so they cannot be edited wrong.
  const message = data.candidateMessage?.trim() || standardInvitationMessage(data.candidateName)
  const messageHtml = escapeHtml(message).replace(/\r?\n/g, '<br>')
  const unsubscribeUrl = `${safeHref(data.frontendUrl)}/unsubscribe`

  const calendarSubject = encodeURIComponent(`Interview with ${data.companyName} — ${data.jobTitle}`)
  const calendarBody = encodeURIComponent(
    `Interview scheduled for ${formatInterviewTime(data.scheduledAt, data.timeZone)}\nDuration: ${data.durationMinutes} minutes${data.videoLink ? `\nVideo Link: ${data.videoLink}` : ''}`
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
    <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${messageHtml}</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Company:</strong> ${escapeHtml(data.companyName)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${escapeHtml(data.jobTitle)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Date &amp; Time:</strong> ${escapeHtml(formatInterviewTime(data.scheduledAt, data.timeZone))}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Duration:</strong> ${escapeHtml(data.durationMinutes)} minutes</p>
      ${videoSection}
    </div>

    <a href="${calendarHref}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">Add to Calendar</a>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
