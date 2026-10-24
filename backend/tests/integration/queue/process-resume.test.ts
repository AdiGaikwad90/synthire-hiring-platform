import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { processResume } from '../../../src/queue/process-resume'
import { PermanentProcessingError } from '../../../src/queue/failures'
import { NeuronBudgetError } from '../../../src/services/budget/neurons'
import { createJob } from '../../../src/db/queries/jobs'
import { updateCandidateParsed } from '../../../src/db/queries/candidates'
import type { Env } from '../../../src/types/bindings'
import type { ProcessResumeMessage } from '../../../src/queue/messages'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate } from '../../setup/factories'
import { stubAi, stubVectorize, STUB_PARSED_RESUME, STUB_SCORES } from '../../setup/ai-stub'

// 863-byte blank one-page PDF (no extractable text) — same bytes as tests/integration/routes/candidate-upload.test.ts.
const BLANK_PDF_B64 = 'JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UaXRsZSAoYmxhbmsuaHRtbCkKL0NyZWF0b3IgKE1vemlsbGEvNS4wIFwoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83XCkgQXBwbGVXZWJLaXQvNTM3LjM2IFwoS0hUTUwsIGxpa2UgR2Vja29cKSBIZWFkbGVzc0Nocm9tZS8xNTIuMC4wLjAgU2FmYXJpLzUzNy4zNikKL1Byb2R1Y2VyIChTa2lhL1BERiBtMTUyKQovQ3JlYXRpb25EYXRlIChEOjIwMjYxMDAzMTk1NjUzKzAwJzAwJykKL01vZERhdGUgKEQ6MjAyNjEwMDMxOTU2NTMrMDAnMDAnKT4+CmVuZG9iagozIDAgb2JqCjw8L0xlbmd0aCAwPj4gc3RyZWFtCgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8L1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldPj4KL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KL0NvbnRlbnRzIDMgMCBSCi9UYWJzIC9TCi9QYXJlbnQgNCAwIFI+PgplbmRvYmoKNCAwIG9iago8PC9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMiAwIFJdPj4KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZwovUGFnZXMgNCAwIFIKL1ZpZXdlclByZWZlcmVuY2VzIDw8L1R5cGUgL1ZpZXdlclByZWZlcmVuY2VzCi9EaXNwbGF5RG9jVGl0bGUgdHJ1ZT4+Pj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMzQzIDAwMDAwIG4gCjAwMDAwMDAyOTYgMDAwMDAgbiAKMDAwMDAwMDQ5OCAwMDAwMCBuIAowMDAwMDAwNTUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2Ci9Sb290IDUgMCBSCi9JbmZvIDEgMCBSPj4Kc3RhcnR4cmVmCjY3MAolJUVPRgo='

let companyId: string
let jobId: string
let candidateId: string

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  jobId = (await createJob(env.DB, makeJobData(companyId, s.recruiterId, { required_skills: ['Go'] }))).id
  candidateId = await insertCandidate(env.DB, companyId, jobId)
  await env.DB.prepare(`UPDATE candidates SET processing_status = 'queued' WHERE id = ?`).bind(candidateId).run()
})

const msg = (over: Partial<ProcessResumeMessage> = {}): ProcessResumeMessage => ({
  type: 'process-resume', candidateId, companyId, jobId,
  r2Key: `resumes/${companyId}/${jobId}/${candidateId}.docx`, fileType: 'docx', ...over,
})
const withStubs = (ai = stubAi()) => ({ env: { ...env, AI: ai.ai, VECTORIZE: stubVectorize().index } as unknown as Env, calls: ai.calls })
const row = () => env.DB.prepare('SELECT processing_status, processing_error, overall_score, name FROM candidates WHERE id = ?').bind(candidateId)
  .first<{ processing_status: string; processing_error: string | null; overall_score: number | null; name: string }>()
const putDocx = () => env.RESUME_BUCKET.put(`resumes/${companyId}/${jobId}/${candidateId}.docx`, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))

describe('processResume — happy path', () => {
  it('parses and scores a queued resume to complete', async () => {
    await putDocx()
    const { env: e, calls } = withStubs()
    await processResume(e, msg())
    expect(await row()).toMatchObject({ processing_status: 'complete', name: 'Jane Doe' })
    expect((await row())?.overall_score).toBeGreaterThan(0)
    expect(calls).toMatchObject({ parse: 1, score: 1 })
  })
})

describe('processResume — idempotency', () => {
  it.each(['complete', 'error'])('does nothing for a %s candidate (redelivery)', async (status) => {
    await env.DB.prepare('UPDATE candidates SET processing_status = ? WHERE id = ?').bind(status, candidateId).run()
    const { env: e, calls } = withStubs()
    await processResume(e, msg())
    expect(calls).toEqual({ parse: 0, score: 0, embed: 0 })
    expect((await row())?.processing_status).toBe(status)
  })

  it('does nothing when the candidate was deleted before delivery', async () => {
    await env.DB.prepare('DELETE FROM candidates WHERE id = ?').bind(candidateId).run()
    const { env: e, calls } = withStubs()
    await expect(processResume(e, msg())).resolves.toBeUndefined()
    expect(calls.parse).toBe(0)
  })

  it('skips the paid parse on a retry after parsing already succeeded', async () => {
    await putDocx()
    await updateCandidateParsed(env.DB, candidateId, STUB_PARSED_RESUME as never, msg().r2Key)
    await env.DB.prepare(`UPDATE candidates SET processing_status = 'queued' WHERE id = ?`).bind(candidateId).run()
    const { env: e, calls } = withStubs()
    await processResume(e, msg())
    expect(calls).toMatchObject({ parse: 0, score: 1 })
    expect((await row())?.processing_status).toBe('complete')
  })
})

describe('processResume — permanent failures throw PermanentProcessingError', () => {
  it('a blank PDF', async () => {
    const key = `resumes/${companyId}/${jobId}/${candidateId}.pdf`
    await env.RESUME_BUCKET.put(key, Uint8Array.from(atob(BLANK_PDF_B64), (c) => c.charCodeAt(0)))
    const { env: e, calls } = withStubs()
    await expect(processResume(e, msg({ r2Key: key, fileType: 'pdf' }))).rejects.toBeInstanceOf(PermanentProcessingError)
    expect(calls.parse).toBe(0)
  })

  it('a file missing from storage', async () => {
    const { env: e } = withStubs()
    await expect(processResume(e, msg())).rejects.toThrow(/missing from storage/)
  })

  it('a corrupt PDF the extractor cannot read', async () => {
    const key = `resumes/${companyId}/${jobId}/${candidateId}.pdf`
    await env.RESUME_BUCKET.put(key, new TextEncoder().encode('%PDF-1.4 this is not really a pdf'))
    const { env: e } = withStubs()
    const err = await processResume(e, msg({ r2Key: key, fileType: 'pdf' })).catch((x) => x)
    expect(err).toBeInstanceOf(PermanentProcessingError)
    expect(err.message).toMatch(/could not be read/)
  })

  it('a job that no longer exists', async () => {
    await putDocx()
    const { env: e } = withStubs()
    await expect(processResume(e, msg({ jobId: 'job_gone' }))).rejects.toThrow(/job for this resume no longer exists/)
  })
})

describe('processResume — transient failures propagate for retry', () => {
  it('rethrows an AI failure as a non-permanent error and leaves the row non-terminal', async () => {
    await putDocx()
    const { env: e } = withStubs(stubAi({ failOn: 'parse' }))
    const err = await processResume(e, msg()).catch((x) => x)
    expect(err).not.toBeInstanceOf(PermanentProcessingError)
    expect((await row())?.processing_status).not.toMatch(/complete|error/)
  })

  it('rethrows the budget error as NeuronBudgetError', async () => {
    await putDocx()
    await env.KV_CACHE.put(`neurons:daily:${new Date().toISOString().slice(0, 10)}`, '10000')
    const { env: e } = withStubs()
    await expect(processResume(e, msg())).rejects.toBeInstanceOf(NeuronBudgetError)
    await env.KV_CACHE.delete(`neurons:daily:${new Date().toISOString().slice(0, 10)}`)
  })
})

describe('processResume — F1 orphaned vector cleanup', () => {
  it('removes the late embedding when the candidate was deleted mid-processing (during scoring)', async () => {
    await putDocx()
    const v = stubVectorize()
    const ai = {
      run: async (model: string, input: { messages?: { content: string }[] }) => {
        const prompt = (input.messages ?? []).map((m) => m.content).join('\n')
        if (model.includes('bge')) return { data: [Array.from({ length: 1024 }, () => 0.5)] }
        if (prompt.includes('Score this candidate')) {
          // Simulate the candidate being deleted between parse and score (e.g. a concurrent DELETE).
          await env.DB.prepare('DELETE FROM candidates WHERE id = ?').bind(candidateId).run()
          return { response: JSON.stringify(STUB_SCORES) }
        }
        return { response: JSON.stringify(STUB_PARSED_RESUME) }
      },
    } as unknown as Env['AI']
    const e = { ...env, AI: ai, VECTORIZE: v.index } as unknown as Env
    await expect(processResume(e, msg())).resolves.toBeUndefined()
    expect(v.deleted).toEqual([[candidateId]])
  })
})
