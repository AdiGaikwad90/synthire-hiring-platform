import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { CandidateRow } from '../../types/db'
import { AppError } from '../../types/api'
import type { ParsedResume } from '../../services/ai/prompts/parse-resume'
import type { ScoringResult } from '../../services/scoring/pipeline'
import type { ScoreAttribution } from '../../services/scoring/attribution'

// ── Deserialization helper ────────────────────────────────────────────────────

export function toCandidate(row: CandidateRow) {
  let technical_skills: string[] = []
  let professional_experience: ParsedResume['professional_experience'] = []
  let education_details: ParsedResume['education_details'] = []
  let certifications: string[] = []
  let achievements: string[] = []
  let ai_analysis: string | null = null
  let parsed_resume: ParsedResume | null = null
  let score_attribution: ScoreAttribution | null = null

  try { technical_skills = JSON.parse(row.technical_skills) } catch { technical_skills = [] }
  try { professional_experience = JSON.parse(row.professional_experience) } catch { professional_experience = [] }
  try { education_details = JSON.parse(row.education_details) } catch { education_details = [] }
  try { certifications = JSON.parse(row.certifications) } catch { certifications = [] }
  try { achievements = JSON.parse(row.achievements) } catch { achievements = [] }
  ai_analysis = row.ai_analysis ?? null
  try { parsed_resume = row.parsed_resume ? JSON.parse(row.parsed_resume) : null } catch { parsed_resume = null }
  try { score_attribution = row.score_attribution ? JSON.parse(row.score_attribution) : null } catch { score_attribution = null }

  return {
    ...row,
    technical_skills,
    professional_experience,
    education_details,
    certifications,
    achievements,
    ai_analysis,
    parsed_resume,
    score_attribution,
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
        score_attribution = ?,
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
      scores.score_attribution,
      modelUsed,
      now,
      id
    )
    .run()
}

// ── Record the stored file ────────────────────────────────────────────────────

/**
 * Written as soon as the file is in R2, not after parsing — otherwise the
 * viewer 404s while a resume processes and for ever if processing fails.
 */
export async function setCandidateResumeUrl(db: D1Database, id: string, resumeUrl: string): Promise<void> {
  await db.prepare('UPDATE candidates SET resume_url = ? WHERE id = ?').bind(resumeUrl, id).run()
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

export type ActiveProcessingStatus = 'queued' | 'parsing' | 'scoring'

/** Also bumps updated_at, which the stale sweep reads. */
export async function setProcessingStatus(db: D1Database, id: string, status: ActiveProcessingStatus): Promise<void> {
  await db
    .prepare('UPDATE candidates SET processing_status = ?, updated_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), id)
    .run()
}

/** Marks the row error unless it already finished — a late DLQ message must not overwrite a result. */
export async function failCandidateIfActive(db: D1Database, id: string, reason: string): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE candidates SET processing_status = 'error', processing_error = ?, updated_at = ?
        WHERE id = ? AND processing_status NOT IN ('complete', 'error')`
    )
    .bind(reason, new Date().toISOString(), id)
    .run()
  return (res.meta.changes ?? 0) > 0
}

// ── Fail interrupted processing ───────────────────────────────────────────────

/** Longer than any real parse + score; a row older than this was abandoned. */
export const STALE_PROCESSING_MINUTES = 10
export const STALE_PROCESSING_MESSAGE =
  'Processing was interrupted before it finished — please upload the resume again'

/** Longer than the 24 h free-plan message retention plus the longest budget wait. */
export const QUEUED_STALE_HOURS = 25

/**
 * Run by the cron. Active rows (pending/parsing/scoring) untouched past
 * `activeBeforeIso` were abandoned mid-run; `queued` rows get the far longer
 * `queuedBeforeIso` because they legitimately wait for retries or the AI
 * budget reset. Both cutoffs are ISO strings — updated_at is toISOString().
 */
export async function failStaleProcessing(
  db: D1Database,
  cutoffs: { activeBeforeIso: string; queuedBeforeIso: string },
): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE candidates SET processing_status = 'error', processing_error = ?, updated_at = ?
        WHERE (processing_status IN ('pending', 'parsing', 'scoring') AND updated_at < ?)
           OR (processing_status = 'queued' AND updated_at < ?)`
    )
    .bind(STALE_PROCESSING_MESSAGE, new Date().toISOString(), cutoffs.activeBeforeIso, cutoffs.queuedBeforeIso)
    .run()
  return res.meta.changes ?? 0
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

/**
 * A resume whose processing failed is a failed upload, not a candidate: it has
 * no score, usually no name, and nothing to act on (SYN-008). Every candidate
 * list and count uses this condition so the two can never disagree.
 */
export const NOT_A_FAILED_UPLOAD = "processing_status != 'error'"

/**
 * Refuses (409) to act on a resume that has not been processed. Until then the
 * row has a placeholder name and no data, so moving it through the pipeline or
 * scheduling an interview would act on, and email, "Processing..." (SYN-008).
 */
export function requireProcessed(candidate: { processing_status: string }): void {
  if (candidate.processing_status === 'complete') return
  throw new AppError(
    candidate.processing_status === 'error'
      ? 'This resume could not be processed — upload it again'
      : 'This resume is still being processed — try again when it has finished',
    409,
  )
}

/** Most failed uploads returned with one list; the total is reported beside them. */
export const FAILED_UPLOADS_MAX = 50

export interface FailedUpload {
  id: string
  job_id: string
  /** The name read from the resume, or null when processing failed before it was read. */
  name: string | null
  reason: string
  /** False when the file itself could not be stored, so there is nothing to open. */
  has_file: boolean
  created_at: string
}

export async function listCandidates(
  db: D1Database,
  companyId: string,
  opts: { job_id?: string; status?: string; min_score?: number; page: number; limit: number }
): Promise<{ items: ReturnType<typeof toCandidate>[]; total: number; failed_uploads: { items: FailedUpload[]; total: number } }> {
  const { job_id, status, min_score, page, limit } = opts
  const offset = (page - 1) * limit

  // Company and job scope both lists; stage and score only narrow candidates —
  // a failure has neither, and filtering must not hide it.
  const scope: string[] = ['company_id = ?']
  const scopeParams: unknown[] = [companyId]

  if (job_id) {
    scope.push('job_id = ?')
    scopeParams.push(job_id)
  }

  const conditions = [...scope, NOT_A_FAILED_UPLOAD]
  const params = [...scopeParams]

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

  // The name column holds a placeholder until the resume has been read.
  const failed = await db
    .prepare(
      `SELECT id, job_id, CASE WHEN parsed_resume IS NOT NULL THEN name END AS name,
              processing_error, resume_url IS NOT NULL AS has_file, created_at, COUNT(*) OVER () AS total
         FROM candidates
        WHERE ${scope.join(' AND ')} AND processing_status = 'error'
        ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .bind(...scopeParams, FAILED_UPLOADS_MAX)
    .all<{ id: string; job_id: string; name: string | null; processing_error: string | null; has_file: number; created_at: string; total: number }>()
  const failedRows = failed.results ?? []

  return {
    items,
    total,
    failed_uploads: {
      total: failedRows[0]?.total ?? 0,
      items: failedRows.map((r) => ({
        id: r.id,
        job_id: r.job_id,
        name: r.name,
        reason: r.processing_error?.trim() || 'Processing failed',
        has_file: Boolean(r.has_file),
        created_at: r.created_at,
      })),
    },
  }
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
