import { nanoid } from 'nanoid'
import type { D1Database } from '@cloudflare/workers-types'
import type { JobRow } from '../../types/db'
import { AppError } from '../../types/api'
import {
  normalizeScoringDimensions,
  DEFAULT_SCORING_DIMENSIONS,
  type ScoringDimensions,
} from '../../services/scoring/dimensions'

// ── Deserialization helpers ───────────────────────────────────────────────────

type ParsedJobRow = Omit<JobRow, 'scoring_weights' | 'required_skills' | 'nice_to_have_skills'> & {
  scoring_dimensions: ScoringDimensions
  required_skills: string[]
  nice_to_have_skills: string[]
}

export function toJob(row: JobRow): ParsedJobRow {
  let scoring_dimensions = DEFAULT_SCORING_DIMENSIONS
  try {
    scoring_dimensions = normalizeScoringDimensions(JSON.parse(row.scoring_weights))
  } catch {
    // fall through to default
  }

  let required_skills: string[] = []
  try {
    const parsed = JSON.parse(row.required_skills)
    if (Array.isArray(parsed)) required_skills = parsed
  } catch {}

  let nice_to_have_skills: string[] = []
  try {
    const parsed = JSON.parse(row.nice_to_have_skills)
    if (Array.isArray(parsed)) nice_to_have_skills = parsed
  } catch {}

  // Strip the legacy `scoring_weights` JSON string from the response; expose
  // only the parsed `scoring_dimensions` field.
  const { scoring_weights: _legacy, ...rest } = row
  void _legacy
  return { ...rest, scoring_dimensions, required_skills, nice_to_have_skills }
}

// ── List jobs ─────────────────────────────────────────────────────────────────

export async function listJobs(
  db: D1Database,
  companyId: string,
  opts: { status?: string; search?: string; page: number; limit: number }
): Promise<{ items: ReturnType<typeof toJob>[]; total: number }> {
  const { status, page, limit } = opts
  const search = opts.search && opts.search.length > 500 ? opts.search.slice(0, 500) : opts.search
  const offset = (page - 1) * limit

  const conditions: string[] = ['j.company_id = ?']
  const params: unknown[] = [companyId]

  if (status) {
    conditions.push('j.status = ?')
    params.push(status)
  }

  if (search) {
    conditions.push('(j.title LIKE ? OR j.department LIKE ? OR j.location LIKE ?)')
    const pattern = `%${search}%`
    params.push(pattern, pattern, pattern)
  }

  const where = conditions.join(' AND ')

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM jobs j WHERE ${where}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  const rows = await db
    .prepare(
      `SELECT j.*, COUNT(c.id) as candidate_count
       FROM jobs j
       LEFT JOIN candidates c ON c.job_id = j.id
       WHERE ${where}
       GROUP BY j.id
       ORDER BY j.created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<JobRow & { candidate_count: number }>()

  const items = (rows.results ?? []).map(r => ({ ...toJob(r), candidate_count: r.candidate_count ?? 0 }))

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
  scoring_dimensions: ScoringDimensions
  status?: string
  jd_url?: string | null
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
      JSON.stringify(data.scoring_dimensions),
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
  if (data.scoring_dimensions !== undefined) { setClauses.push('scoring_weights = ?'); params.push(JSON.stringify(data.scoring_dimensions)) }
  if (data.status !== undefined) { setClauses.push('status = ?'); params.push(data.status) }
  if (data.jd_url !== undefined) { setClauses.push('jd_url = ?'); params.push(data.jd_url) }

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
