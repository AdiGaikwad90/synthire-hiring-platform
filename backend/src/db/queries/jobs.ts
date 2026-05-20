import { nanoid } from 'nanoid'
import type { D1Database } from '@cloudflare/workers-types'
import type { JobRow } from '../../types/db'
import { AppError } from '../../types/api'

// ── Deserialization helpers ───────────────────────────────────────────────────

type ScoringWeights = {
  skills: number
  experience: number
  education: number
  achievements: number
}

type ParsedJobRow = Omit<JobRow, 'scoring_weights' | 'required_skills' | 'nice_to_have_skills'> & {
  scoring_weights: ScoringWeights
  required_skills: string[]
  nice_to_have_skills: string[]
}

export function toJob(row: JobRow): ParsedJobRow {
  const parsed: ParsedJobRow = {
    ...row,
    scoring_weights: { skills: 40, experience: 30, education: 20, achievements: 10 },
    required_skills: [],
    nice_to_have_skills: [],
  }
  try {
    parsed.scoring_weights = JSON.parse(row.scoring_weights) as ScoringWeights
  } catch {
    parsed.scoring_weights = { skills: 40, experience: 30, education: 20, achievements: 10 }
  }
  try {
    parsed.required_skills = JSON.parse(row.required_skills) as string[]
  } catch {
    parsed.required_skills = []
  }
  try {
    parsed.nice_to_have_skills = JSON.parse(row.nice_to_have_skills) as string[]
  } catch {
    parsed.nice_to_have_skills = []
  }
  return parsed
}

// ── List jobs ─────────────────────────────────────────────────────────────────

export async function listJobs(
  db: D1Database,
  companyId: string,
  opts: { status?: string; search?: string; page: number; limit: number }
): Promise<{ items: ReturnType<typeof toJob>[]; total: number }> {
  const { status, search, page, limit } = opts
  const offset = (page - 1) * limit

  const conditions: string[] = ['company_id = ?']
  const params: unknown[] = [companyId]

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  if (search) {
    conditions.push('(title LIKE ? OR department LIKE ? OR location LIKE ?)')
    const pattern = `%${search}%`
    params.push(pattern, pattern, pattern)
  }

  const where = conditions.join(' AND ')

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM jobs WHERE ${where}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  const rows = await db
    .prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<JobRow>()

  const items = (rows.results ?? []).map(toJob)

  return { items, total }
}

// ── Create job ────────────────────────────────────────────────────────────────

type CreateJobData = {
  company_id: string
  recruiter_id: string
  title: string
  description?: string
  department?: string
  location?: string
  employment_type: string
  experience_level: string
  salary_range?: string
  required_skills: string[]
  nice_to_have_skills: string[]
  min_years_experience: number
  education_requirement?: string
  scoring_weights: ScoringWeights
}

export async function createJob(
  db: D1Database,
  data: CreateJobData
): Promise<ReturnType<typeof toJob>> {
  const id = nanoid()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO jobs (
        id, company_id, recruiter_id, title, description, department, location,
        employment_type, experience_level, salary_range, status,
        scoring_weights, required_skills, nice_to_have_skills,
        min_years_experience, education_requirement, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.company_id,
      data.recruiter_id,
      data.title,
      data.description ?? null,
      data.department ?? null,
      data.location ?? null,
      data.employment_type,
      data.experience_level,
      data.salary_range ?? null,
      JSON.stringify(data.scoring_weights),
      JSON.stringify(data.required_skills),
      JSON.stringify(data.nice_to_have_skills),
      data.min_years_experience,
      data.education_requirement ?? null,
      now,
      now
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM jobs WHERE id = ?')
    .bind(id)
    .first<JobRow>()

  if (!row) throw new AppError('Failed to retrieve created job', 500)
  return toJob(row)
}

// ── Get job ───────────────────────────────────────────────────────────────────

export async function getJob(
  db: D1Database,
  id: string,
  companyId: string
): Promise<ReturnType<typeof toJob> | null> {
  const row = await db
    .prepare('SELECT * FROM jobs WHERE id = ? AND company_id = ? LIMIT 1')
    .bind(id, companyId)
    .first<JobRow>()

  return row ? toJob(row) : null
}

// ── Update job ────────────────────────────────────────────────────────────────

export async function updateJob(
  db: D1Database,
  id: string,
  companyId: string,
  data: Partial<CreateJobData>
): Promise<ReturnType<typeof toJob> | null> {
  const setClauses: string[] = []
  const params: unknown[] = []

  if (data.title !== undefined) { setClauses.push('title = ?'); params.push(data.title) }
  if (data.description !== undefined) { setClauses.push('description = ?'); params.push(data.description) }
  if (data.department !== undefined) { setClauses.push('department = ?'); params.push(data.department) }
  if (data.location !== undefined) { setClauses.push('location = ?'); params.push(data.location) }
  if (data.employment_type !== undefined) { setClauses.push('employment_type = ?'); params.push(data.employment_type) }
  if (data.experience_level !== undefined) { setClauses.push('experience_level = ?'); params.push(data.experience_level) }
  if (data.salary_range !== undefined) { setClauses.push('salary_range = ?'); params.push(data.salary_range) }
  if (data.required_skills !== undefined) { setClauses.push('required_skills = ?'); params.push(JSON.stringify(data.required_skills)) }
  if (data.nice_to_have_skills !== undefined) { setClauses.push('nice_to_have_skills = ?'); params.push(JSON.stringify(data.nice_to_have_skills)) }
  if (data.min_years_experience !== undefined) { setClauses.push('min_years_experience = ?'); params.push(data.min_years_experience) }
  if (data.education_requirement !== undefined) { setClauses.push('education_requirement = ?'); params.push(data.education_requirement) }
  if (data.scoring_weights !== undefined) { setClauses.push('scoring_weights = ?'); params.push(JSON.stringify(data.scoring_weights)) }

  if (setClauses.length === 0) {
    return getJob(db, id, companyId)
  }

  setClauses.push('updated_at = ?')
  params.push(new Date().toISOString())

  params.push(id, companyId)

  await db
    .prepare(`UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ? AND company_id = ?`)
    .bind(...params)
    .run()

  return getJob(db, id, companyId)
}

// ── Delete job (soft delete) ──────────────────────────────────────────────────

export async function deleteJob(
  db: D1Database,
  id: string,
  companyId: string
): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE jobs SET status = 'closed', updated_at = ? WHERE id = ? AND company_id = ?`)
    .bind(new Date().toISOString(), id, companyId)
    .run()

  return (result.meta?.changes ?? 0) > 0
}
