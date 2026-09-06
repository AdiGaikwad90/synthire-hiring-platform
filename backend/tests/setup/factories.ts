import type { D1Database } from '@cloudflare/workers-types'
import type { CreateJobData } from '../../src/db/queries/jobs'
import { DEFAULT_SCORING_DIMENSIONS } from '../../src/services/scoring/dimensions'

/**
 * Row builders for integration tests.
 *
 * Rule (see TESTING.md): tests never hand-write INSERTs for shared entities.
 * The schema has real FKs and NOT NULL constraints, so a missing column fails
 * loudly here instead of in ten separate test files.
 */

let seq = 0
/** Deterministic within a run, unique across calls — no random flakiness. */
export const testId = (prefix: string) => `${prefix}_${++seq}`

export async function seedCompanyAndRecruiter(
  db: D1Database,
): Promise<{ companyId: string; recruiterId: string }> {
  const companyId = testId('co')
  const recruiterId = testId('usr')

  await db.prepare('INSERT INTO companies (id, name) VALUES (?, ?)')
    .bind(companyId, `Test Co ${companyId}`)
    .run()

  await db.prepare(
    `INSERT INTO users (id, company_id, email, password_hash, name, role)
     VALUES (?, ?, ?, ?, ?, 'recruiter')`,
  )
    .bind(recruiterId, companyId, `${recruiterId}@test.local`, 'x'.repeat(60), 'Test Recruiter')
    .run()

  return { companyId, recruiterId }
}

/**
 * Inserts a job with RAW column values, bypassing createJob(), so a test can
 * put deliberately malformed JSON into a TEXT column the way a bad migration
 * or a hand-edited row would.
 */
export async function insertRawJob(
  db: D1Database,
  companyId: string,
  recruiterId: string,
  raw: Partial<{ scoring_weights: string; required_skills: string; nice_to_have_skills: string }> = {},
): Promise<string> {
  const id = testId('job')
  await db.prepare(
    `INSERT INTO jobs (id, company_id, recruiter_id, title, scoring_weights,
                       required_skills, nice_to_have_skills)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      companyId,
      recruiterId,
      'Raw Job',
      raw.scoring_weights ?? '{"skills":40,"experience":30,"education":20,"achievements":10}',
      raw.required_skills ?? '[]',
      raw.nice_to_have_skills ?? '[]',
    )
    .run()
  return id
}

/** Queues an email row directly, for exercising the cron drain. */
export async function insertQueuedEmail(
  db: D1Database,
  over: Partial<{
    recipient_email: string
    email_type: string
    template_data: string
    scheduled_for: string
    max_retries: number
    status: string
  }> = {},
): Promise<string> {
  const id = testId('eq')
  await db.prepare(
    `INSERT INTO email_queue
       (id, recipient_email, email_type, template_data, scheduled_for, retry_count, max_retries, status)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      over.recipient_email ?? `${id}@test.local`,
      over.email_type ?? 'resume_uploaded',
      over.template_data ?? '{}',
      over.scheduled_for ?? new Date(Date.now() - 1000).toISOString(),
      over.max_retries ?? 3,
      over.status ?? 'pending',
    )
    .run()
  return id
}

/**
 * Complete CreateJobData with sensible defaults. Use this instead of building
 * the object inline — CreateJobData has several REQUIRED fields, and omitting
 * one produces a D1_TYPE_ERROR at runtime rather than anything readable.
 */
export function makeJobData(
  companyId: string,
  recruiterId: string,
  over: Partial<CreateJobData> = {},
): CreateJobData {
  return {
    company_id: companyId,
    recruiter_id: recruiterId,
    title: 'Test Job',
    employment_type: 'full_time',
    experience_level: 'mid',
    required_skills: [],
    nice_to_have_skills: [],
    min_years_experience: 0,
    scoring_dimensions: DEFAULT_SCORING_DIMENSIONS,
    ...over,
  }
}
