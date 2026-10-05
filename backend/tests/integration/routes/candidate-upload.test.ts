import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../../../src/index'
import { createJob } from '../../../src/db/queries/jobs'
import type { Env } from '../../../src/types/bindings'
import { seedCompanyAndRecruiter, makeJobData, signTestToken, authHeader } from '../../setup/factories'

/**
 * Regression from the live-app pass: resume_url was written only after the AI
 * parse succeeded, although the file is in R2 before the 202 returns. So the
 * viewer 404'd for every candidate still processing, and for good on every
 * candidate whose processing failed.
 *
 * A blank PDF is used on purpose: the pipeline rejects it before any AI call
 * (no AI binding exists in this pool), which is also the failure case.
 */

// 863-byte blank one-page PDF (no extractable text).
const BLANK_PDF = Uint8Array.from(atob('JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UaXRsZSAoYmxhbmsuaHRtbCkKL0NyZWF0b3IgKE1vemlsbGEvNS4wIFwoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83XCkgQXBwbGVXZWJLaXQvNTM3LjM2IFwoS0hUTUwsIGxpa2UgR2Vja29cKSBIZWFkbGVzc0Nocm9tZS8xNTIuMC4wLjAgU2FmYXJpLzUzNy4zNikKL1Byb2R1Y2VyIChTa2lhL1BERiBtMTUyKQovQ3JlYXRpb25EYXRlIChEOjIwMjYxMDAzMTk1NjUzKzAwJzAwJykKL01vZERhdGUgKEQ6MjAyNjEwMDMxOTU2NTMrMDAnMDAnKT4+CmVuZG9iagozIDAgb2JqCjw8L0xlbmd0aCAwPj4gc3RyZWFtCgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8L1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldPj4KL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KL0NvbnRlbnRzIDMgMCBSCi9UYWJzIC9TCi9QYXJlbnQgNCAwIFI+PgplbmRvYmoKNCAwIG9iago8PC9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMiAwIFJdPj4KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZwovUGFnZXMgNCAwIFIKL1ZpZXdlclByZWZlcmVuY2VzIDw8L1R5cGUgL1ZpZXdlclByZWZlcmVuY2VzCi9EaXNwbGF5RG9jVGl0bGUgdHJ1ZT4+Pj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMzQzIDAwMDAwIG4gCjAwMDAwMDAyOTYgMDAwMDAgbiAKMDAwMDAwMDQ5OCAwMDAwMCBuIAowMDAwMDAwNTUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2Ci9Sb290IDUgMCBSCi9JbmZvIDEgMCBSPj4Kc3RhcnR4cmVmCjY3MAolJUVPRgo='), (ch) => ch.charCodeAt(0))

let token: string
let jobId: string
let companyId: string

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  jobId = (await createJob(env.DB, makeJobData(s.companyId, s.recruiterId))).id
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: s.companyId, role: 'recruiter' })
})

function queueSpy(fail = false) {
  const sent: unknown[] = []
  return { sent, queue: { send: async (m: unknown) => { if (fail) throw new Error('queue down'); sent.push(m) } } }
}

async function upload(queue: { send: (m: unknown) => Promise<void> }) {
  const form = new FormData()
  form.append('jobId', jobId)
  form.append('file', new File([BLANK_PDF], 'resume.pdf', { type: 'application/pdf' }))
  const ctx = createExecutionContext()
  const res = await worker.fetch(
    new Request('https://test.local/api/candidates/upload', { method: 'POST', body: form, headers: authHeader(token) }),
    { ...env, RESUME_QUEUE: queue } as unknown as Env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return res
}

const rowOf = (id: string) => env.DB.prepare('SELECT processing_status, processing_error, resume_url FROM candidates WHERE id = ?')
  .bind(id).first<{ processing_status: string; processing_error: string | null; resume_url: string | null }>()

describe('POST /api/candidates/upload — enqueues processing', () => {
  it('returns 202, leaves the row queued with its file recorded, and sends one process-resume message', async () => {
    const spy = queueSpy()
    const res = await upload(spy.queue)
    expect(res.status).toBe(202)
    const id = ((await res.json()) as { data: { candidateId: string } }).data.candidateId
    const row = await rowOf(id)
    expect(row?.processing_status).toBe('queued')
    expect(row?.resume_url).toBe(`resumes/${companyId}/${jobId}/${id}.pdf`)
    expect(spy.sent).toEqual([{ type: 'process-resume', candidateId: id, companyId, jobId, r2Key: row?.resume_url, fileType: 'pdf' }])
  })

  it('serves the original file while the resume is still queued', async () => {
    const res = await upload(queueSpy().queue)
    const id = ((await res.json()) as { data: { candidateId: string } }).data.candidateId
    const file = await worker.fetch(
      new Request(`https://test.local/api/candidates/${id}/resume`, { headers: authHeader(token) }),
      env as unknown as Env, createExecutionContext(),
    )
    expect(file.status).toBe(200)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(BLANK_PDF)
  })

  it('returns 503 and marks the row error when the queue send fails — no row left waiting forever', async () => {
    const res = await upload(queueSpy(true).queue)
    expect(res.status).toBe(503)
    const { results } = await env.DB.prepare(`SELECT processing_status, processing_error FROM candidates WHERE job_id = ?`).bind(jobId).all()
    expect(results).toEqual([{ processing_status: 'error', processing_error: 'Could not queue the resume for processing' }])
  })

  it('marks the row error and sends nothing when storing the file fails', async () => {
    const spy = queueSpy()
    const form = new FormData()
    form.append('jobId', jobId)
    form.append('file', new File([BLANK_PDF], 'resume.pdf', { type: 'application/pdf' }))
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request('https://test.local/api/candidates/upload', { method: 'POST', body: form, headers: authHeader(token) }),
      { ...env, RESUME_QUEUE: spy.queue, RESUME_BUCKET: { put: async () => { throw new Error('r2 down') } } } as unknown as Env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBeGreaterThanOrEqual(400)
    const { results } = await env.DB.prepare(`SELECT processing_status, processing_error FROM candidates WHERE job_id = ?`).bind(jobId).all()
    expect(results).toEqual([{ processing_status: 'error', processing_error: 'Could not store the uploaded file' }])
    expect(spy.sent).toEqual([])
  })

  it('still reports the original storage failure when recording it in D1 also fails', async () => {
    const spy = queueSpy()
    const form = new FormData()
    form.append('jobId', jobId)
    form.append('file', new File([BLANK_PDF], 'resume.pdf', { type: 'application/pdf' }))
    const ctx = createExecutionContext()
    // Only the error-recording UPDATE throws; other DB calls (createCandidate, etc.) pass through.
    const flakyDb = {
      prepare: (sql: string) => {
        if (sql.includes("processing_status = 'error'")) {
          return { bind: () => ({ run: async () => { throw new Error('D1 unavailable') } }) }
        }
        return env.DB.prepare(sql)
      },
    }
    const res = await worker.fetch(
      new Request('https://test.local/api/candidates/upload', { method: 'POST', body: form, headers: authHeader(token) }),
      {
        ...env,
        RESUME_QUEUE: spy.queue,
        RESUME_BUCKET: { put: async () => { throw new Error('r2 down') } },
        DB: flakyDb,
      } as unknown as Env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error ?? '').not.toMatch(/D1 unavailable/)
  })
})
