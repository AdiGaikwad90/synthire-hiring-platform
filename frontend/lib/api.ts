import type { StoredUser } from './auth'

export interface PaginatedData<T> {
  items: T[]
  pagination: { total: number; page: number; limit: number; pages: number; has_more: boolean }
}

export interface DimensionConfig {
  importance: number
  sub_dimensions: Record<string, number>
}

export interface ScoringDimensions {
  skills: DimensionConfig
  experience: DimensionConfig
  education: DimensionConfig
  achievements: DimensionConfig
}

export interface ApiJob {
  id: string; company_id: string; recruiter_id: string; title: string
  description: string | null; department: string | null; location: string | null
  employment_type: string; experience_level: string; salary_range: string | null
  status: string; scoring_dimensions: ScoringDimensions; scoring_weights: Record<string, number> | null
  required_skills: string[]; nice_to_have_skills: string[]; min_years_experience: number
  education_requirement: string | null; jd_url: string | null; created_at: string; updated_at: string
  candidate_count?: number
}

export interface ApiCandidate {
  id: string; job_id: string; company_id: string; name: string; email: string | null
  phone: string | null; location: string | null; resume_url: string | null
  technical_skills: string[]; professional_experience: unknown[]; education_details: unknown[]
  certifications: string[]; achievements: string[]; overall_score: number | null
  semantic_score: number | null; skills_score: number | null; experience_score: number | null
  education_score: number | null; achievements_score: number | null; ai_analysis: string | null
  status: string; processing_status: string; created_at: string; updated_at: string
}

export interface ApiInterview {
  id: string; candidate_id: string; job_id: string; company_id: string
  interviewer_id: string; interview_type_id: string | null; scheduled_at: string
  duration_minutes: number; video_link: string | null; meeting_notes: string | null
  status: string; created_at: string; candidate_name?: string | null
}

export interface ApiInterviewFeedback {
  id: string; interview_id: string; interviewer_id: string
  technical_score: number | null; communication_score: number | null
  problem_solving_score: number | null; culture_score: number | null
  strengths: string | null; weaknesses: string | null; notes: string | null
  recommendation: string; ai_summary: string | null; created_at: string
}

export interface ApiInterviewType {
  id: string; company_id: string; name: string; duration_minutes: number
  description: string | null; required: number; position: number; created_at: string
}

export interface AnalyticsSummary {
  total_candidates: number; total_interviews: number; total_hired: number
  avg_score: number; avg_time_to_hire_days: number; active_jobs: number
}

export interface ActivityItem {
  candidateId: string; candidateName: string; status: string; jobTitle: string; updatedAt: string
}

export interface EmailStats {
  total: number; sent: number; delivered: number; bounced: number; failed: number
}

export interface ApiEmailLog {
  id: string; recipient_email: string; email_type: string; status: string
  subject: string | null; sent_at: string | null; created_at: string
}

export interface ApiEmailPreferences {
  resume_notifications: number; interview_notifications: number
  feedback_notifications: number; reminder_notifications: number
  unsubscribed_at: string | null
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export class ApiError extends Error {
  constructor(public message: string, public status: number, public data?: unknown) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { getToken, removeToken } = await import('./auth')
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  const json = await res.json() as { success: boolean; data: T; error: string | null }

  if (res.status === 401) {
    // Only redirect to login when a token existed (expired session), not on auth endpoints
    if (token) {
      removeToken()
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
    throw new ApiError(json.error ?? 'Invalid email or password', 401)
  }

  if (!res.ok || !json.success) {
    throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status, json)
  }
  return json.data
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const { getToken, removeToken } = await import('./auth')
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData })
  if (res.status === 401) {
    removeToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError('Unauthorized', 401)
  }
  const json = await res.json() as { success: boolean; data: T; error: string | null }
  if (!res.ok || !json.success) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json.data
}

// Group: Auth
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: StoredUser }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    }),
  signup: (email: string, password: string, name: string, company_name: string) =>
    apiFetch<{ token: string; user: StoredUser; company: { id: string; name: string } }>('/api/auth/signup', {
      method: 'POST', body: JSON.stringify({ email, password, name, company_name })
    }),
  me: () => apiFetch<StoredUser>('/api/auth/me'),
}

// Group: Jobs
export const jobsApi = {
  list: (params?: Record<string, string>) =>
    apiFetch<PaginatedData<ApiJob>>(`/api/jobs?${new URLSearchParams(params ?? {})}`),
  get: (id: string) => apiFetch<ApiJob>(`/api/jobs/${id}`),
  create: (data: unknown) => apiFetch<ApiJob>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => apiFetch<ApiJob>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<{ deleted: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
}

// Group: Candidates
export const candidatesApi = {
  list: (params?: Record<string, string>) =>
    apiFetch<PaginatedData<ApiCandidate>>(`/api/candidates?${new URLSearchParams(params ?? {})}`),
  get: (id: string) => apiFetch<ApiCandidate>(`/api/candidates/${id}`),
  update: (id: string, data: { status?: string }) =>
    apiFetch<ApiCandidate>(`/api/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<{ deleted: boolean }>(`/api/candidates/${id}`, { method: 'DELETE' }),
  generateQuestions: (id: string) => apiFetch<{ questions: { q: string; why: string }[] }>(`/api/candidates/${id}/questions`, { method: 'POST' }),
}

// Group: Interviews
export const interviewsApi = {
  list: (params?: Record<string, string>) =>
    apiFetch<PaginatedData<ApiInterview>>(`/api/interviews?${new URLSearchParams(params ?? {})}`),
  get: (id: string) => apiFetch<ApiInterview>(`/api/interviews/${id}`),
  create: (data: unknown) => apiFetch<ApiInterview>('/api/interviews', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiFetch<ApiInterview>(`/api/interviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  submitFeedback: (id: string, data: unknown) =>
    apiFetch<unknown>(`/api/interviews/${id}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
  getFeedback: (id: string) =>
    apiFetch<ApiInterviewFeedback | null>(`/api/interviews/${id}/feedback`),
}

// Group: Analytics
export const analyticsApi = {
  funnel: () => apiFetch<{ status: string; count: number }[]>('/api/analytics/funnel'),
  timeToHire: () => apiFetch<{ month: string; avg_days: number; count: number }[]>('/api/analytics/time-to-hire'),
  summary: () => apiFetch<AnalyticsSummary>('/api/analytics/summary'),
  activity: () => apiFetch<ActivityItem[]>('/api/analytics/activity'),
  emailStats: () => apiFetch<EmailStats>('/api/analytics/email-stats'),
}

// Group: Settings (interview types)
export const settingsApi = {
  listTypes: () => apiFetch<ApiInterviewType[]>('/api/interview-types'),
  createType: (data: unknown) => apiFetch<ApiInterviewType>('/api/interview-types', { method: 'POST', body: JSON.stringify(data) }),
  updateType: (id: string, data: unknown) => apiFetch<ApiInterviewType>(`/api/interview-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteType: (id: string) => apiFetch<{ deleted: boolean }>(`/api/interview-types/${id}`, { method: 'DELETE' }),
}

// Group: Email
export const emailApi = {
  logs: (params?: Record<string, string>) =>
    apiFetch<PaginatedData<ApiEmailLog>>(`/api/email/logs?${new URLSearchParams(params ?? {})}`),
  preferences: () => apiFetch<ApiEmailPreferences>('/api/email/preferences'),
  updatePreferences: (data: Partial<ApiEmailPreferences>) =>
    apiFetch<ApiEmailPreferences>('/api/email/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
}
