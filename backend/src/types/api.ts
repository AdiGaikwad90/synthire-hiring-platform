import { nanoid } from 'nanoid'
import { z } from 'zod'

// ── Standard response envelope ────────────────────────────────────────────────

export function apiResponse<T>(data: T, status = 200) {
  return {
    success: true as const,
    data,
    error: null,
    timestamp: new Date().toISOString(),
    request_id: nanoid(12),
  }
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  return apiResponse({
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      has_more: page * limit < total,
    },
  })
}

// ── App error ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// ── Zod validation schemas ────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  company_name: z.string().min(1).max(200),
})

export const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract']).default('full_time'),
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']).default('mid'),
  salary_range: z.string().optional(),
  required_skills: z.array(z.string()).default([]),
  nice_to_have_skills: z.array(z.string()).default([]),
  min_years_experience: z.number().int().min(0).default(0),
  education_requirement: z.enum(['none', 'bachelors', 'masters', 'phd']).optional(),
  scoring_weights: z.object({
    skills: z.number().min(0).max(100),
    experience: z.number().min(0).max(100),
    education: z.number().min(0).max(100),
    achievements: z.number().min(0).max(100),
  }).refine(
    w => w.skills + w.experience + w.education + w.achievements === 100,
    { message: 'Scoring weights must sum to 100' }
  ).default({ skills: 40, experience: 30, education: 20, achievements: 10 }),
})

export const updateJobSchema = createJobSchema.partial()

export const listJobsSchema = z.object({
  status: z.enum(['active', 'paused', 'closed']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const updateCandidateSchema = z.object({
  status: z.enum(['new', 'shortlisted', 'scheduled', 'inprogress', 'feedback', 'hired', 'rejected']).optional(),
})

export const listCandidatesSchema = z.object({
  job_id: z.string().optional(),
  status: z.string().optional(),
  min_score: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
})

export const createInterviewSchema = z.object({
  candidate_id: z.string(),
  job_id: z.string(),
  interviewer_id: z.string(),
  interview_type_id: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  video_link: z.string().url().optional(),
  meeting_notes: z.string().optional(),
})

export const submitFeedbackSchema = z.object({
  technical_score: z.number().int().min(1).max(5),
  communication_score: z.number().int().min(1).max(5),
  problem_solving_score: z.number().int().min(1).max(5),
  culture_score: z.number().int().min(1).max(5),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  notes: z.string().optional(),
  recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no', 'strong_no']),
})

export const createInterviewTypeSchema = z.object({
  name: z.string().min(1).max(100),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  description: z.string().optional(),
  required: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
})

export const updateEmailPreferencesSchema = z.object({
  resume_notifications: z.boolean().optional(),
  interview_notifications: z.boolean().optional(),
  feedback_notifications: z.boolean().optional(),
  reminder_notifications: z.boolean().optional(),
})
