import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { ValidationTargets } from 'hono'
import { zValidator as _zValidator } from '@hono/zod-validator'

// ── Standard response envelope ────────────────────────────────────────────────

// Wrapper that returns our standard { success, error, details } shape on validation failure
// instead of @hono/zod-validator's default raw ZodError response.
export function zv<T extends keyof ValidationTargets>(
  target: T,
  schema: z.ZodTypeAny
) {
  return _zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const flat = result.error.flatten()
      console.error('[validation] 422 on', c.req.path, JSON.stringify(flat))
      return c.json(
        { success: false, data: null, error: 'Validation failed', details: flat },
        422
      )
    }
  })
}

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

// Scoring v2 — independent 0-100 importance per dimension, with sub-dimensions.
// No "sum to 100" constraint; backend normalizes via weighted averages.
const dimensionConfigSchema = z.object({
  importance: z.number().min(0).max(100),
  sub_dimensions: z.record(z.string(), z.number().min(0).max(100)),
})

const scoringDimensionsSchema = z.object({
  skills: dimensionConfigSchema,
  experience: dimensionConfigSchema,
  education: dimensionConfigSchema,
  achievements: dimensionConfigSchema,
})

const DEFAULT_DIMENSIONS = {
  skills:       { importance: 80, sub_dimensions: { technical: 90, soft: 60, domain: 70 } },
  experience:   { importance: 70, sub_dimensions: { years_relevant: 80, industry_match: 60, leadership: 50 } },
  education:    { importance: 50, sub_dimensions: { degree_level: 60, field_relevance: 70, certifications: 40 } },
  achievements: { importance: 60, sub_dimensions: { impact: 80, recognition: 50 } },
}

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
  min_years_experience: z.number().min(0).transform(Math.round).default(0),
  education_requirement: z.enum(['none', 'bachelors', 'masters', 'phd']).optional(),
  scoring_dimensions: scoringDimensionsSchema.default(DEFAULT_DIMENSIONS),
})

export const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(['active', 'paused', 'closed']).optional(),
})

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
  interviewer_id: z.string().optional(),
  interviewer_email: z.string().email().optional(),
  interview_type_id: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  video_link: z.string().transform(v => {
    if (!v) return undefined
    if (/^https?:\/\//i.test(v)) return v
    return `https://${v}`
  }).pipe(z.string().url()).optional(),
  meeting_notes: z.string().optional(),
  candidate_email_override: z.string().email().optional(),
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
