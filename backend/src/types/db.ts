// Row types matching D1 schema — all JSON fields are TEXT in SQLite

export interface CompanyRow {
  id: string
  name: string
  plan: string
  created_at: string
}

export interface UserRow {
  id: string
  company_id: string
  email: string
  password_hash: string
  name: string
  role: string
  created_at: string
}

export interface JobRow {
  id: string
  company_id: string
  recruiter_id: string
  title: string
  description: string | null
  department: string | null
  location: string | null
  employment_type: string
  experience_level: string
  salary_range: string | null
  status: string
  scoring_weights: string  // JSON TEXT
  required_skills: string  // JSON TEXT
  nice_to_have_skills: string  // JSON TEXT
  min_years_experience: number
  education_requirement: string | null
  jd_url: string | null
  created_at: string
  updated_at: string
}

export interface CandidateRow {
  id: string
  job_id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  location: string | null
  resume_url: string | null
  parsed_resume: string | null  // JSON TEXT
  technical_skills: string      // JSON TEXT
  professional_experience: string  // JSON TEXT
  education_details: string     // JSON TEXT
  certifications: string        // JSON TEXT
  achievements: string          // JSON TEXT
  overall_score: number | null
  semantic_score: number | null
  skills_score: number | null
  experience_score: number | null
  education_score: number | null
  achievements_score: number | null
  ai_analysis: string | null    // JSON TEXT
  status: string
  parsing_quality: number | null
  model_used: string | null
  processing_status: string
  processing_error: string | null
  created_at: string
  updated_at: string
}

export interface InterviewTypeRow {
  id: string
  company_id: string
  name: string
  duration_minutes: number
  description: string | null
  required: number  // SQLite BOOLEAN (0/1)
  position: number
  created_at: string
}

export interface InterviewRow {
  id: string
  candidate_id: string
  job_id: string
  company_id: string
  interviewer_id: string
  interview_type_id: string | null
  scheduled_at: string
  duration_minutes: number
  video_link: string | null
  meeting_notes: string | null
  status: string
  email_sent_at: string | null
  reminder_sent_at: string | null
  created_at: string
}

export interface InterviewFeedbackRow {
  id: string
  interview_id: string
  interviewer_id: string
  technical_score: number | null
  communication_score: number | null
  problem_solving_score: number | null
  culture_score: number | null
  strengths: string | null
  weaknesses: string | null
  notes: string | null
  recommendation: string
  ai_summary: string | null
  created_at: string
}

export interface EmailLogRow {
  id: string
  company_id: string | null
  recipient_email: string
  email_type: string
  resend_message_id: string | null
  subject: string | null
  sent_at: string | null
  delivered_at: string | null
  bounced_at: string | null
  complained_at: string | null
  status: string
  error_message: string | null
  created_at: string
}

export interface EmailPreferencesRow {
  user_id: string
  resume_notifications: number      // BOOLEAN
  interview_notifications: number
  feedback_notifications: number
  reminder_notifications: number
  unsubscribe_token: string
  unsubscribed_at: string | null
  created_at: string
}

export interface EmailQueueRow {
  id: string
  recipient_email: string
  email_type: string
  template_data: string  // JSON TEXT
  scheduled_for: string
  sent_at: string | null
  failed_at: string | null
  retry_count: number
  max_retries: number
  last_error: string | null
  created_at: string
  claimed_at?: number | null
  status?: string
}
