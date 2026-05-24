import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { CandidateRow } from '../../types/db'
import type { ParsedResume } from '../../services/ai/prompts/parse-resume'
import type { ScoringResult } from '../../services/scoring/pipeline'

// ── Deserialization helper ────────────────────────────────────────────────────

export function toCandidate(row: CandidateRow) {
  let technical_skills: string[] = []
  let professional_experience: ParsedResume['professional_experience'] = []
  let education_details: ParsedResume['education_details'] = []
  let certifications: string[] = []
  let achievements: string[] = []
  let ai_analysis: string | null = null
  let parsed_resume: ParsedResume | null = null

  try { technical_skills = JSON.parse(row.technical_skills) } catch { technical_skills = [] }
  try { professional_experience = JSON.parse(row.professional_experience) } catch { professional_experience = [] }
  try { education_details = JSON.parse(row.education_details) } catch { education_details = [] }
  try { certifications = JSON.parse(row.certifications) } catch { certifications = [] }
  try { achievements = JSON.parse(row.achievements) } catch { achievements = [] }
  ai_analysis = row.ai_analysis ?? null
  try { parsed_resume = row.parsed_resume ? JSON.parse(row.parsed_resume) : null } catch { parsed_resume = null }

  return {
    ...row,
    technical_skills,
    professional_experience,
    education_details,
    certifications,
    achievements,
    ai_analysis,
    parsed_resume,
  }
}

// ── Create candidate ──────────────────────────────────────────────────────────

export async function createCandidate(
  db: D1Database,
  data: {
    job_id: string
    company_id: string
    name: string
    email?: string
    phone?: string
    location?: string
    resume_url?: string
    processing_status: string
  }
): Promise<ReturnType<typeof toCandidate>> {
  const id = nanoid()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO candidates (
        id, job_id, company_id, name, email, phone, location, resume_url,
        parsed_resume, technical_skills, professional_experience, education_details,
        certifications, achievements, overall_score, semantic_score, skills_score,
        experience_score, education_score, achievements_score, ai_analysis,
        status, parsing_quality, model_used, processing_status, processing_error,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        NULL, '[]', '[]', '[]',
        '[]', '[]', NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        'new', NULL, NULL, ?, NULL,
        ?, ?
      )`
    )
    .bind(
      id,
      data.job_id,
      data.company_id,
      data.name,
      data.email ?? null,
      data.phone ?? null,
      data.location ?? null,
      data.resume_url ?? null,
      data.processing_status,
      now,
      now
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM candidates WHERE id = ? LIMIT 1')
    .bind(id)
    .first<CandidateRow>()

  if (!row) throw new Error('Failed to retrieve created candidate')
  return toCandidate(row)
}

// ── Update candidate after parsing ───────────────────────────────────────────

export async function updateCandidateParsed(
  db: D1Database,
  id: string,
  parsed: ParsedResume,
  resumeUrl: string
): Promise<void> {
  const now = new Date().toISOString()

  await db
    .prepare(
      `UPDATE candidates SET
        name = ?,
        email = ?,
        phone = ?,
        location = ?,
        resume_url = ?,
        technical_skills = ?,
        professional_experience = ?,
        education_details = ?,
        certifications = ?,
        achievements = ?,
        parsed_resume = ?,
        processing_status = 'scoring',
        updated_at = ?
      WHERE id = ?`
    )
    .bind(
      parsed.name || 'Unknown Candidate',
      parsed.email ?? null,
      parsed.phone ?? null,
      parsed.location ?? null,
      resumeUrl,
      JSON.stringify(parsed.technical_skills),
      JSON.stringify(parsed.professional_experience),
      JSON.stringify(parsed.education_details),
      JSON.stringify(parsed.certifications),
      JSON.stringify(parsed.achievements),
      JSON.stringify(parsed),
      now,
      id
    )
    .run()
}

// ── Update candidate after scoring ───────────────────────────────────────────

export async function updateCandidateScores(
  db: D1Database,
  id: string,
  scores: ScoringResult,
  modelUsed: string
): Promise<void> {
  const now = new Date().toISOString()

  await db
    .prepare(
      `UPDATE candidates SET
        overall_score = ?,
        semantic_score = ?,
        skills_score = ?,
        experience_score = ?,
        education_score = ?,
        achievements_score = ?,
        ai_analysis = ?,
        model_used = ?,
        processing_status = 'complete',
        updated_at = ?
      WHERE id = ?`
    )
    .bind(
      scores.overall_score,
      scores.semantic_score,
      scores.skills_score,
      scores.experience_score,
      scores.education_score,
      scores.achievements_score,
      scores.ai_analysis,
      modelUsed,
      now,
      id
    )
    .run()
}

// ── Update candidate on error ─────────────────────────────────────────────────

export async function updateCandidateError(
  db: D1Database,
  id: string,
  error: string
): Promise<void> {
  const now = new Date().toISOString()

  await db
    .prepare(
      `UPDATE candidates SET
        processing_status = 'error',
        processing_error = ?,
        updated_at = ?
      WHERE id = ?`
    )
    .bind(error, now, id)
    .run()
}

// ── Get single candidate ──────────────────────────────────────────────────────

export async function getCandidate(
  db: D1Database,
  id: string,
  companyId: string
): Promise<ReturnType<typeof toCandidate> | null> {
  const row = await db
    .prepare('SELECT * FROM candidates WHERE id = ? AND company_id = ? LIMIT 1')
    .bind(id, companyId)
    .first<CandidateRow>()

  return row ? toCandidate(row) : null
}

// ── List candidates ───────────────────────────────────────────────────────────

export async function listCandidates(
  db: D1Database,
  companyId: string,
  opts: { job_id?: string; status?: string; min_score?: number; page: number; limit: number }
): Promise<{ items: ReturnType<typeof toCandidate>[]; total: number }> {
  const { job_id, status, min_score, page, limit } = opts
  const offset = (page - 1) * limit

  const conditions: string[] = ['company_id = ?']
  const params: unknown[] = [companyId]

  if (job_id) {
    conditions.push('job_id = ?')
    params.push(job_id)
  }

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  if (min_score !== undefined) {
    conditions.push('overall_score >= ?')
    params.push(min_score)
  }

  const where = conditions.join(' AND ')

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM candidates WHERE ${where}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  const rows = await db
    .prepare(
      `SELECT * FROM candidates WHERE ${where} ORDER BY overall_score DESC, created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<CandidateRow>()

  const items = (rows.results ?? []).map(toCandidate)

  return { items, total }
}

// ── Update candidate status ───────────────────────────────────────────────────

export async function updateCandidateStatus(
  db: D1Database,
  id: string,
  companyId: string,
  status: string
): Promise<ReturnType<typeof toCandidate> | null> {
  const now = new Date().toISOString()

  await db
    .prepare(
      `UPDATE candidates SET status = ?, updated_at = ? WHERE id = ? AND company_id = ?`
    )
    .bind(status, now, id, companyId)
    .run()

  return getCandidate(db, id, companyId)
}

// ── Delete candidate ──────────────────────────────────────────────────────────

export async function deleteCandidate(
  db: D1Database,
  id: string,
  companyId: string
): Promise<{ resumeUrl: string | null } | null> {
  const row = await db
    .prepare('SELECT resume_url FROM candidates WHERE id = ? AND company_id = ? LIMIT 1')
    .bind(id, companyId)
    .first<{ resume_url: string | null }>()

  if (!row) return null

  await db
    .prepare('DELETE FROM candidates WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .run()

  return { resumeUrl: row.resume_url }
}
