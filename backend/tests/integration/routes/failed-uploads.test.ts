import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
import { FAILED_UPLOADS_MAX } from '../../../src/db/queries/candidates'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate, signTestToken, authHeader } from '../../setup/factories'

/**
 * SYN-008 — a resume that failed processing is a failed upload, not a candidate.
 *
 * Before: the upload's row stayed in `candidates` under the placeholder name
 * "Processing...", so every list showed it with a 0% score, every count
 * included it, and it could be moved to "Hired" or sent an interview invitation
 * addressed to "Processing...".
 */

let companyId: string
let recruiterId: string
let jobId: string
let token: string

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  ;({ companyId, recruiterId } = s)
  jobId = (await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Data Engineer' }))).id
  token = await signTestToken(env.JWT_SECRET, { sub: recruiterId, company_id: companyId, role: 'recruiter' })
})

const api = (path: string, init: RequestInit = {}, t: string = token) =>
  SELF.fetch(`https://test.local${path}`, { ...init, headers: { ...authHeader(t), 'Content-Type': 'application/json' } })

type FailedUpload = { id: string; job_id: string; name: string | null; reason: string; has_file: boolean; created_at: string }
type ListData = {
  items: { id: string }[]
  pagination: { total: number }
  failed_uploads: { items: FailedUpload[]; total: number }
}
const list = async (query = '', t = token) => ((await (await api(`/api/candidates${query}`, {}, t)).json()) as { data: ListData }).data

/** An upload that failed before parsing: placeholder name, no parsed data. */
async function failedUpload(opts: { job?: string; reason?: string | null; file?: boolean; createdAt?: string } = {}) {
  const id = await insertCandidate(env.DB, companyId, opts.job ?? jobId, 'Processing...')
  await env.DB.prepare(
    `UPDATE candidates SET processing_status = 'error', processing_error = ?, resume_url = ?, created_at = COALESCE(?, created_at) WHERE id = ?`,
  ).bind(opts.reason === undefined ? 'No readable text found in the resume' : opts.reason, opts.file === false ? null : `resumes/${id}.pdf`, opts.createdAt ?? null, id).run()
  return id
}
const setProcessing = (id: string, status: string) =>
  env.DB.prepare('UPDATE candidates SET processing_status = ? WHERE id = ?').bind(status, id).run()

describe('GET /api/candidates — failed uploads are listed apart from candidates', () => {
  it('happy path: a failed upload is not an item, is not counted, and is reported with its reason', async () => {
    const good = await insertCandidate(env.DB, companyId, jobId, 'Dana Cho')
    const bad = await failedUpload()

    const data = await list()
    expect(data.items.map((c) => c.id)).toEqual([good])
    expect(data.pagination.total).toBe(1)
    expect(data.failed_uploads.total).toBe(1)
    expect(data.failed_uploads.items).toEqual([
      { id: bad, job_id: jobId, name: null, reason: 'No readable text found in the resume', has_file: true, created_at: expect.any(String) },
    ])
  })

  it('positive variants: an upload still being processed stays a candidate', async () => {
    for (const status of ['queued', 'parsing', 'scoring']) {
      const id = await insertCandidate(env.DB, companyId, jobId, 'Processing...')
      await setProcessing(id, status)
    }
    const data = await list()
    expect(data.items).toHaveLength(3)
    expect(data.failed_uploads).toEqual({ items: [], total: 0 })
  })

  it('positive variants: a resume that was read before scoring failed keeps its real name', async () => {
    const id = await insertCandidate(env.DB, companyId, jobId, 'Priya Raman')
    await env.DB.prepare(`UPDATE candidates SET processing_status = 'error', processing_error = 'AI budget', parsed_resume = '{}' WHERE id = ?`).bind(id).run()
    expect((await list()).failed_uploads.items[0]).toMatchObject({ id, name: 'Priya Raman' })
  })

  it('positive variants: a file that was never stored is reported as having no file', async () => {
    await failedUpload({ file: false, reason: 'Could not store the uploaded file' })
    expect((await list()).failed_uploads.items[0]).toMatchObject({ has_file: false, reason: 'Could not store the uploaded file' })
  })

  it('positive variants: job_id narrows failed uploads; the stage and score filters do not hide them', async () => {
    const otherJob = (await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Other' }))).id
    const here = await failedUpload()
    await failedUpload({ job: otherJob })

    expect((await list(`?job_id=${jobId}`)).failed_uploads.items.map((f) => f.id)).toEqual([here])
    expect((await list()).failed_uploads.total).toBe(2)
    // A failure has no stage worth filtering on and no score — it must stay visible.
    expect((await list(`?job_id=${jobId}&status=hired&min_score=90`)).failed_uploads.items.map((f) => f.id)).toEqual([here])
  })

  it('boundaries: newest first, capped, with the full count', async () => {
    const oldest = await failedUpload({ createdAt: '2020-01-01T00:00:00.000Z' })
    for (let i = 0; i < FAILED_UPLOADS_MAX; i++) await failedUpload({ createdAt: `2021-01-01T00:${String(i).padStart(2, '0')}:00.000Z` })
    const newest = await failedUpload({ createdAt: '2022-01-01T00:00:00.000Z' })

    const { failed_uploads } = await list()
    expect(failed_uploads.total).toBe(FAILED_UPLOADS_MAX + 2)
    expect(failed_uploads.items).toHaveLength(FAILED_UPLOADS_MAX)
    expect(failed_uploads.items[0].id).toBe(newest)
    expect(failed_uploads.items.map((f) => f.id)).not.toContain(oldest)
  })

  it('empty / zero: no failures gives an empty list, and a missing reason gets a plain one', async () => {
    expect((await list()).failed_uploads).toEqual({ items: [], total: 0 })
    await failedUpload({ reason: null })
    await failedUpload({ reason: '   ' })
    expect((await list()).failed_uploads.items.map((f) => f.reason)).toEqual(['Processing failed', 'Processing failed'])
  })

  // Invalid input: N/A — this adds no request input; ?status= is covered in candidates.test.ts.

  it('error contract: another company sees none of these failures', async () => {
    await failedUpload()
    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId, role: 'recruiter' })
    expect((await list('', otherToken)).failed_uploads).toEqual({ items: [], total: 0 })
    // Asking for the first company's job by id must not leak them either.
    expect((await list(`?job_id=${jobId}`, otherToken)).failed_uploads).toEqual({ items: [], total: 0 })
  })
})

describe('candidate counts — failed uploads are not counted', () => {
  const data = async <T>(path: string) => ((await (await api(path)).json()) as { data: T }).data

  beforeEach(async () => {
    await insertCandidate(env.DB, companyId, jobId, 'Dana Cho')
    const queued = await insertCandidate(env.DB, companyId, jobId, 'Processing...')
    await setProcessing(queued, 'queued')
    await failedUpload()
    // A failed row that was dragged to "Hired" before this fix must not count as a hire.
    const hiredFailure = await failedUpload()
    await env.DB.prepare(`UPDATE candidates SET status = 'hired' WHERE id = ?`).bind(hiredFailure).run()
  })

  it('job list: candidate_count is the finished and in-progress candidates only', async () => {
    const jobs = await data<{ items: { id: string; candidate_count: number }[] }>('/api/jobs')
    expect(jobs.items.find((j) => j.id === jobId)?.candidate_count).toBe(2)
  })

  it('job list: a job whose every upload failed counts zero and is still listed', async () => {
    const empty = (await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'All failed' }))).id
    await failedUpload({ job: empty })
    const jobs = await data<{ items: { id: string; candidate_count: number }[] }>('/api/jobs')
    expect(jobs.items.find((j) => j.id === empty)?.candidate_count).toBe(0)
  })

  it('dashboard summary: total and hires leave failures out', async () => {
    const summary = await data<{ total_candidates: number; total_hired: number }>('/api/analytics/summary')
    expect(summary).toMatchObject({ total_candidates: 2, total_hired: 0 })
  })

  it('funnel: no stage counts a failure', async () => {
    const funnel = await data<{ status: string; count: number }[]>('/api/analytics/funnel')
    expect(funnel).toEqual([{ status: 'new', count: 2 }])
  })

  it('activity feed: only candidates with a real name appear', async () => {
    const activity = await data<{ candidateName: string }[]>('/api/analytics/activity')
    expect(activity.map((a) => a.candidateName)).toEqual(['Dana Cho'])
  })
})

describe('actions on a resume that has not been processed — refused', () => {
  const stage = async (id: string) =>
    (await env.DB.prepare('SELECT status FROM candidates WHERE id = ?').bind(id).first<{ status: string }>())?.status
  const interviews = async () =>
    (await env.DB.prepare('SELECT COUNT(*) AS n FROM interviews WHERE company_id = ?').bind(companyId).first<{ n: number }>())!.n
  const emails = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM email_queue').first<{ n: number }>())!.n

  const UNPROCESSED = ['error', 'queued', 'parsing', 'scoring', 'pending'] as const

  it('PATCH /api/candidates/:id answers 409 and leaves the stage alone', async () => {
    for (const status of UNPROCESSED) {
      const id = await insertCandidate(env.DB, companyId, jobId, 'Processing...')
      await setProcessing(id, status)
      const res = await api(`/api/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'hired' }) })
      expect(res.status, status).toBe(409)
      expect(((await res.json()) as { success: boolean; error: string }), status).toMatchObject({ success: false, error: expect.stringMatching(/processed/i) })
      expect(await stage(id), status).toBe('new')
    }
  })

  it('PATCH still moves a processed candidate', async () => {
    const id = await insertCandidate(env.DB, companyId, jobId, 'Dana Cho')
    const res = await api(`/api/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'shortlisted' }) })
    expect(res.status).toBe(200)
    expect(await stage(id)).toBe('shortlisted')
  })

  it('POST /api/interviews answers 409, schedules nothing and queues no email', async () => {
    const emailsBefore = await emails()
    for (const status of UNPROCESSED) {
      const id = await insertCandidate(env.DB, companyId, jobId, 'Processing...')
      await setProcessing(id, status)
      const res = await api('/api/interviews', {
        method: 'POST',
        body: JSON.stringify({ candidate_id: id, job_id: jobId, scheduled_at: '2030-06-12T21:00:00.000Z', interviewer_email: 'someone@example.com' }),
      })
      expect(res.status, status).toBe(409)
      expect(await stage(id), status).toBe('new')
    }
    expect(await interviews()).toBe(0)
    expect(await emails()).toBe(emailsBefore)
  })

  it('error contract: another company gets 404, never the 409 that confirms the row exists', async () => {
    const id = await failedUpload()
    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId, role: 'recruiter' })
    const res = await api(`/api/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'hired' }) }, otherToken)
    expect(res.status).toBe(404)
  })
})
