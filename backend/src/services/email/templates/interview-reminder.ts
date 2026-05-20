import type { InterviewReminderTemplateData } from '../../../types/email'

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

export function renderInterviewReminder(data: InterviewReminderTemplateData): { subject: string; html: string } {
  const unsubscribeUrl = `${data.frontendUrl}/unsubscribe`
  const interviewUrl = `${data.frontendUrl}/interviews/${data.interviewId}`

  if (data.recipientRole === 'interviewer') {
    const subject = `Interview Tomorrow: ${data.candidateName}`

    const videoSection = data.videoLink
      ? `<p style="color: #374151; margin: 8px 0;"><strong>Video Link:</strong> <a href="${data.videoLink}" style="color: #6366F1;">${data.videoLink}</a></p>`
      : ''

    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">Interview Reminder</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Hi ${data.recipientName}, you have an interview scheduled for tomorrow.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Candidate:</strong> ${data.candidateName}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${data.jobTitle}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Date &amp; Time:</strong> ${formatDateTime(data.scheduledAt)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Duration:</strong> ${data.durationMinutes} minutes</p>
      ${videoSection}
    </div>

    <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 16px 0;">
      Review the candidate's resume and scoring data before the interview to make the most of your time together.
    </p>

    <a href="${interviewUrl}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">Start Interview</a>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

    return { subject, html }
  }

  // Candidate role
  const subject = `Interview Tomorrow — ${data.companyName}`

  const videoSection = data.videoLink
    ? `<div style="background: #EEF2FF; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <p style="color: #4338CA; margin: 0; font-size: 14px;"><strong>Join via:</strong> <a href="${data.videoLink}" style="color: #6366F1;">${data.videoLink}</a></p>
      </div>`
    : '<p style="color: #374151; font-size: 14px; margin: 8px 0;">Your interviewer will share the meeting link with you.</p>'

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">Your Interview is Tomorrow!</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Hi ${data.recipientName}, just a friendly reminder about your upcoming interview.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${data.jobTitle}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Date &amp; Time:</strong> ${formatDateTime(data.scheduledAt)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Duration:</strong> ${data.durationMinutes} minutes</p>
    </div>

    ${videoSection}

    <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 16px 0;">
      Please join a few minutes early and ensure your audio and video are working. Good luck — we're rooting for you!
    </p>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
