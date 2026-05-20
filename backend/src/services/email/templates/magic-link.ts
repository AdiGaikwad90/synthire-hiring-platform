import type { MagicLinkTemplateData } from '../../../types/email'

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

export function renderMagicLink(data: MagicLinkTemplateData): { subject: string; html: string } {
  const subject = `Interview Scheduled: ${data.candidateName} for ${data.jobTitle}`
  const interviewUrl = `${data.frontendUrl}/interviews/${data.interviewId}`
  const unsubscribeUrl = `${data.frontendUrl}/unsubscribe`

  const scoreSection = data.overallScore !== undefined
    ? `<div style="background: #EEF2FF; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <span style="color: #4338CA; font-weight: 600; font-size: 14px;">Candidate Score: ${data.overallScore}%</span>
      </div>`
    : ''

  const videoSection = data.videoLink
    ? `<p style="color: #374151; margin: 8px 0;"><strong>Video Link:</strong> <a href="${data.videoLink}" style="color: #6366F1;">${data.videoLink}</a></p>`
    : ''

  const notesSection = data.recruiterNotes
    ? `<div style="background: #FEF9C3; border-left: 4px solid #EAB308; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #713F12; font-size: 14px; margin: 0;"><strong>Recruiter Notes:</strong> ${data.recruiterNotes}</p>
      </div>`
    : ''

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">Interview Scheduled</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Hi ${data.interviewerName}, an interview has been scheduled for your review.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Candidate:</strong> ${data.candidateName}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${data.jobTitle}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Date &amp; Time:</strong> ${formatDateTime(data.scheduledAt)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Duration:</strong> ${data.durationMinutes} minutes</p>
      ${videoSection}
    </div>

    ${scoreSection}
    ${notesSection}

    <a href="${interviewUrl}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">Start Interview</a>

    <p style="color: #9CA3AF; font-size: 13px; margin: 24px 0 0;">If the button doesn't work, copy and paste this link: <a href="${interviewUrl}" style="color: #6366F1;">${interviewUrl}</a></p>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
