import type {
  EmailType,
  TemplateData,
  MagicLinkTemplateData,
  ResumeUploadedTemplateData,
  InterviewScheduledTemplateData,
  FeedbackReminderTemplateData,
  InterviewReminderTemplateData,
} from '../../../types/email'
import { renderMagicLink } from './magic-link'
import { renderResumeUploaded } from './resume-uploaded'
import { renderInterviewScheduled } from './interview-scheduled'
import { renderFeedbackReminder } from './feedback-reminder'
import { renderInterviewReminder } from './interview-reminder'

export { renderMagicLink } from './magic-link'
export { renderResumeUploaded } from './resume-uploaded'
export { renderInterviewScheduled } from './interview-scheduled'
export { renderFeedbackReminder } from './feedback-reminder'
export { renderInterviewReminder } from './interview-reminder'

export function renderTemplate(
  emailType: EmailType,
  templateData: TemplateData
): { subject: string; html: string } {
  switch (emailType) {
    case 'magic_link': return renderMagicLink(templateData as MagicLinkTemplateData)
    case 'resume_uploaded': return renderResumeUploaded(templateData as ResumeUploadedTemplateData)
    case 'interview_scheduled': return renderInterviewScheduled(templateData as InterviewScheduledTemplateData)
    case 'feedback_reminder': return renderFeedbackReminder(templateData as FeedbackReminderTemplateData)
    case 'interview_reminder': return renderInterviewReminder(templateData as InterviewReminderTemplateData)
    default: {
      const _exhaustive: never = emailType
      throw new Error(`Unknown email type: ${_exhaustive}`)
    }
  }
}
