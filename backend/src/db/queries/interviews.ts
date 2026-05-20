import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { InterviewRow, InterviewTypeRow, InterviewFeedbackRow } from '../../types/db'
import { AppError } from '../../types/api'

// ── Interview Types ──────────────────────────────────────────────────────────

export async function listInterviewTypes(
  db: D1Database,
  companyId: string
): Promise<InterviewTypeRow[]> {
  const rows = await db
    .prepare('SELECT * FROM interview_types WHERE company_id = ? ORDER BY position ASC')
    .bind(companyId)
    .all<InterviewTypeRow>()
  return rows.results ?? []
}

export async function createInterviewType(
  db: D1Database,
  companyId: string,
  data: {
    name: string
    duration_minutes: number
    description?: string
    required: boolean
    position: number
  }
): Promise<InterviewTypeRow> {
  const id = nanoid()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO interview_types (id, company_id, name, duration_minutes, description, required, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      companyId,
      data.name,
      data.duration_minutes,
      data.description ?? null,
      data.required ? 1 : 0,
      data.position,
      now
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM interview_types WHERE id = ? LIMIT 1')
    .bind(id)
    .first<InterviewTypeRow>()

  if (!row) throw new AppError('Failed to retrieve created interview type', 500)
  return row
}

export async function updateInterviewType(
  db: D1Database,
  id: string,
  companyId: string,
  data: Partial<{
    name: string
    duration_minutes: number
    description: string
    required: boolean
    position: number
  }>
): Promise<InterviewTypeRow | null> {
  const setClauses: string[] = []
  const params: unknown[] = []

  if (data.name !== undefined) { setClauses.push('name = ?'); params.push(data.name) }
  if (data.duration_minutes !== undefined) { setClauses.push('duration_minutes = ?'); params.push(data.duration_minutes) }
  if (data.description !== undefined) { setClauses.push('description = ?'); params.push(data.description) }
  if (data.required !== undefined) { setClauses.push('required = ?'); params.push(data.required ? 1 : 0) }
  if (data.position !== undefined) { setClauses.push('position = ?'); params.push(data.position) }

  if (setClauses.length === 0) {
    return db
      .prepare('SELECT * FROM interview_types WHERE id = ? AND company_id = ? LIMIT 1')
      .bind(id, companyId)
      .first<InterviewTypeRow>()
  }

  params.push(id, companyId)

  await db
    .prepare(`UPDATE interview_types SET ${setClauses.join(', ')} WHERE id = ? AND company_id = ?`)
    .bind(...params)
    .run()

  return db
    .prepare('SELECT * FROM interview_types WHERE id = ? AND company_id = ? LIMIT 1')
    .bind(id, companyId)
    .first<InterviewTypeRow>()
}

export async function deleteInterviewType(
  db: D1Database,
  id: string,
  companyId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM interview_types WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .run()
  return (result.meta?.changes ?? 0) > 0
}

// ── Interviews ───────────────────────────────────────────────────────────────

export async function createInterview(
  db: D1Database,
  data: {
    candidate_id: string
    job_id: string
    company_id: string
    interviewer_id: string
    interview_type_id?: string
    scheduled_at: string
    duration_minutes: number
    video_link?: string
    meeting_notes?: string
  }
): Promise<InterviewRow> {
  const id = nanoid()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO interviews (
        id, candidate_id, job_id, company_id, interviewer_id, interview_type_id,
        scheduled_at, duration_minutes, video_link, meeting_notes, status,
        email_sent_at, reminder_sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NULL, NULL, ?)`
    )
    .bind(
      id,
      data.candidate_id,
      data.job_id,
      data.company_id,
      data.interviewer_id,
      data.interview_type_id ?? null,
      data.scheduled_at,
      data.duration_minutes,
      data.video_link ?? null,
      data.meeting_notes ?? null,
      now
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM interviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<InterviewRow>()

  if (!row) throw new AppError('Failed to retrieve created interview', 500)
  return row
}

export async function listInterviews(
  db: D1Database,
  companyId: string,
  opts: { interviewerId?: string; status?: string; page: number; limit: number }
): Promise<{ items: InterviewRow[]; total: number }> {
  const { interviewerId, status, page, limit } = opts
  const offset = (page - 1) * limit

  const conditions: string[] = ['company_id = ?']
  const params: unknown[] = [companyId]

  if (interviewerId) {
    conditions.push('interviewer_id = ?')
    params.push(interviewerId)
  }

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  const where = conditions.join(' AND ')

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM interviews WHERE ${where}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  const rows = await db
    .prepare(`SELECT * FROM interviews WHERE ${where} ORDER BY scheduled_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<InterviewRow>()

  return { items: rows.results ?? [], total }
}

export async function getInterview(
  db: D1Database,
  id: string,
  companyId: string
): Promise<InterviewRow | null> {
  return db
    .prepare('SELECT * FROM interviews WHERE id = ? AND company_id = ? LIMIT 1')
    .bind(id, companyId)
    .first<InterviewRow>()
}

export async function updateInterview(
  db: D1Database,
  id: string,
  companyId: string,
  data: Partial<{
    status: string
    meeting_notes: string
    email_sent_at: string
    reminder_sent_at: string
  }>
): Promise<InterviewRow | null> {
  const setClauses: string[] = []
  const params: unknown[] = []

  if (data.status !== undefined) { setClauses.push('status = ?'); params.push(data.status) }
  if (data.meeting_notes !== undefined) { setClauses.push('meeting_notes = ?'); params.push(data.meeting_notes) }
  if (data.email_sent_at !== undefined) { setClauses.push('email_sent_at = ?'); params.push(data.email_sent_at) }
  if (data.reminder_sent_at !== undefined) { setClauses.push('reminder_sent_at = ?'); params.push(data.reminder_sent_at) }

  if (setClauses.length === 0) {
    return getInterview(db, id, companyId)
  }

  params.push(id, companyId)

  await db
    .prepare(`UPDATE interviews SET ${setClauses.join(', ')} WHERE id = ? AND company_id = ?`)
    .bind(...params)
    .run()

  return getInterview(db, id, companyId)
}

// ── Interview Feedback ────────────────────────────────────────────────────────

export async function createFeedback(
  db: D1Database,
  data: {
    interview_id: string
    interviewer_id: string
    technical_score: number
    communication_score: number
    problem_solving_score: number
    culture_score: number
    strengths?: string
    weaknesses?: string
    notes?: string
    recommendation: string
  }
): Promise<InterviewFeedbackRow> {
  const id = nanoid()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO interview_feedback (
        id, interview_id, interviewer_id, technical_score, communication_score,
        problem_solving_score, culture_score, strengths, weaknesses, notes,
        recommendation, ai_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .bind(
      id,
      data.interview_id,
      data.interviewer_id,
      data.technical_score,
      data.communication_score,
      data.problem_solving_score,
      data.culture_score,
      data.strengths ?? null,
      data.weaknesses ?? null,
      data.notes ?? null,
      data.recommendation,
      now
    )
    .run()

  // Mark the interview as completed
  await db
    .prepare(`UPDATE interviews SET status = 'completed' WHERE id = ?`)
    .bind(data.interview_id)
    .run()

  const row = await db
    .prepare('SELECT * FROM interview_feedback WHERE id = ? LIMIT 1')
    .bind(id)
    .first<InterviewFeedbackRow>()

  if (!row) throw new AppError('Failed to retrieve created feedback', 500)
  return row
}

export async function getFeedback(
  db: D1Database,
  interviewId: string
): Promise<InterviewFeedbackRow | null> {
  return db
    .prepare('SELECT * FROM interview_feedback WHERE interview_id = ? LIMIT 1')
    .bind(interviewId)
    .first<InterviewFeedbackRow>()
}
