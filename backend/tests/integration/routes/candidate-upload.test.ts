import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
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

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  jobId = (await createJob(env.DB, makeJobData(s.companyId, s.recruiterId))).id
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: s.companyId, role: 'recruiter' })
})

async function upload(): Promise<string> {
  const form = new FormData()
  form.append('jobId', jobId)
  form.append('file', new File([BLANK_PDF], 'resume.pdf', { type: 'application/pdf' }))
  const res = await SELF.fetch('https://test.local/api/candidates/upload', { method: 'POST', body: form, headers: authHeader(token) })
  expect(res.status).toBe(202)
  return ((await res.json()) as { data: { candidateId: string } }).data.candidateId
}

describe('POST /api/candidates/upload — the stored file is viewable straight away', () => {
  it('records resume_url before processing finishes', async () => {
    const id = await upload()
    const row = await env.DB.prepare('SELECT resume_url FROM candidates WHERE id = ?').bind(id).first<{ resume_url: string | null }>()
    expect(row?.resume_url).toMatch(/\.pdf$/)
  })

  it('serves the original file for a candidate whose processing failed', async () => {
    const id = await upload()
    const res = await SELF.fetch(`https://test.local/api/candidates/${id}/resume`, { headers: authHeader(token) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BLANK_PDF)
  })
})
