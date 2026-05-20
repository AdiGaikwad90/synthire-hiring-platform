export type EmailType =
  | 'magic_link'
  | 'resume_uploaded'
  | 'interview_scheduled'
  | 'feedback_reminder'
  | 'interview_reminder'

export interface MagicLinkTemplateData {
  interviewId: string
  interviewerName: string
  candidateName: string
  jobTitle: string
  scheduledAt: string
  durationMinutes: number
  videoLink?: string
  overallScore?: number
  recruiterNotes?: string
  frontendUrl: string
}

export interface ResumeUploadedTemplateData {
  candidateId: string
  candidateName: string
  jobTitle: string
  jobId: string
  overallScore: number
  skillsScore: number
  experienceScore: number
  educationScore: number
  achievementsScore: number
  location?: string
  frontendUrl: string
}

export interface InterviewScheduledTemplateData {
  candidateName: string
  companyName: string
  jobTitle: string
  scheduledAt: string
  durationMinutes: number
  videoLink?: string
  interviewId: string
  frontendUrl: string
}

export interface FeedbackReminderTemplateData {
  interviewId: string
  interviewerName: string
  candidateName: string
  jobTitle: string
  scheduledAt: string
  frontendUrl: string
}

export interface InterviewReminderTemplateData {
  interviewId: string
  recipientRole: 'interviewer' | 'candidate'
  recipientName: string
  candidateName: string
  companyName: string
  jobTitle: string
  scheduledAt: string
  durationMinutes: number
  videoLink?: string
  frontendUrl: string
}

export type TemplateData =
  | MagicLinkTemplateData
  | ResumeUploadedTemplateData
  | InterviewScheduledTemplateData
  | FeedbackReminderTemplateData
  | InterviewReminderTemplateData
