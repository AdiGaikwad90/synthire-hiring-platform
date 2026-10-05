import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../../../src/index'
import { createJob } from '../../../src/db/queries/jobs'
import type { Env } from '../../../src/types/bindings'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate, signTestToken, authHeader } from '../../setup/factories'
import { stubVectorize } from '../../setup/ai-stub'

let token: string
let companyId: string
let candidateId: string
let key: string

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  const jobId = (await createJob(env.DB, makeJobData(companyId, s.recruiterId))).id
  candidateId = await insertCandidate(env.DB, companyId, jobId)
  key = `resumes/${companyId}/${jobId}/${candidateId}.pdf`
  await env.DB.prepare('UPDATE candidates SET resume_url = ? WHERE id = ?').bind(key, candidateId).run()
  await env.RESUME_BUCKET.put(key, new Uint8Array([1, 2, 3]))
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: companyId, role: 'recruiter' })
})

async function del(over: Partial<Env>) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(
    new Request(`https://test.local/api/candidates/${candidateId}`, { method: 'DELETE', headers: authHeader(token) }),
    { ...env, ...over } as unknown as Env, ctx,
  )
  await waitOnExecutionContext(ctx)
  return res
}

describe('DELETE /api/candidates/:id', () => {
  it('deletes the row and enqueues a purge-candidate message with the stored file', async () => {
    const sent: unknown[] = []
    const res = await del({ RESUME_QUEUE: { send: async (m: unknown) => { sent.push(m) } } as never })
    expect(res.status).toBe(200)
    expect(await env.DB.prepare('SELECT id FROM candidates WHERE id = ?').bind(candidateId).first()).toBeNull()
    expect(sent).toEqual([{ type: 'purge-candidate', candidateId, companyId, resumeUrl: key }])
  })

  it('purges inline when the queue send fails', async () => {
    const v = stubVectorize()
    const res = await del({
      RESUME_QUEUE: { send: async () => { throw new Error('queue down') } } as never,
      VECTORIZE: v.index,
    })
    expect(res.status).toBe(200)
    expect(await env.RESUME_BUCKET.get(key)).toBeNull()
    expect(v.deleted).toEqual([[candidateId]])
  })

  it('404s another company\'s candidate and enqueues nothing', async () => {
    const other = await seedCompanyAndRecruiter(env.DB)
    token = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId })
    const sent: unknown[] = []
    const res = await del({ RESUME_QUEUE: { send: async (m: unknown) => { sent.push(m) } } as never })
    expect(res.status).toBe(404)
    expect(sent).toEqual([])
  })
})
