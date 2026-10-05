import { describe, it, expect, beforeEach } from 'vitest'
import { env, createMessageBatch, createExecutionContext, getQueueResult } from 'cloudflare:test'
import worker from '../../../src/index'
import { DEAD_LETTER_MESSAGE } from '../../../src/queue/handler'
import { createJob } from '../../../src/db/queries/jobs'
import type { Env } from '../../../src/types/bindings'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate } from '../../setup/factories'
import { stubAi, stubVectorize } from '../../setup/ai-stub'

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

const r2Key = () => `resumes/${companyId}/${jobId}/${candidateId}.docx`
const body = () => ({ type: 'process-resume', candidateId, companyId, jobId, r2Key: r2Key(), fileType: 'docx' })
const status = async () => (await env.DB.prepare('SELECT processing_status AS s, processing_error AS e FROM candidates WHERE id = ?')
  .bind(candidateId).first<{ s: string; e: string | null }>())

async function deliver(queue: string, msgBody: unknown, attempts = 1, ai = stubAi()) {
  const batch = createMessageBatch(queue, [{ id: 'm1', timestamp: new Date(), attempts, body: msgBody }])
  const ctx = createExecutionContext()
  const e = { ...env, AI: ai.ai, VECTORIZE: stubVectorize().index } as unknown as Env
  await worker.queue(batch, e, ctx)
  return getQueueResult(batch, ctx)
}

describe('resume queue consumer', () => {
  it('acks a processed resume and leaves it complete', async () => {
    await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
    const result = await deliver('synthire-resume-jobs-test', body())
    expect(result.explicitAcks).toEqual(['m1'])
    expect((await status())?.s).toBe('complete')
  })

  it('acks and marks error on a permanent failure (file missing)', async () => {
    const result = await deliver('synthire-resume-jobs-test', body())
    expect(result.explicitAcks).toEqual(['m1'])
    expect(await status()).toMatchObject({ s: 'error', e: expect.stringMatching(/missing from storage/) })
  })

  it('retries a transient AI failure with backoff and returns the row to queued', async () => {
    await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
    const result = await deliver('synthire-resume-jobs-test', body(), 2, stubAi({ failOn: 'parse' }))
    // @cloudflare/vitest-pool-workers 0.16.9's getQueueResult does not surface
    // delaySeconds on retryMessages (only msgId) — delaySeconds is asserted
    // via the real backoff logic in tests/unit/queue/failures.test.ts instead.
    expect(result.retryMessages).toEqual([{ msgId: 'm1' }])
    expect((await status())?.s).toBe('queued')
  })

  it('acks a malformed message without touching any row', async () => {
    const result = await deliver('synthire-resume-jobs-test', { type: 'nonsense' })
    expect(result.explicitAcks).toEqual(['m1'])
    expect((await status())?.s).toBe('queued')
  })

  it('runs a purge-candidate message', async () => {
    const v = stubVectorize()
    const batch = createMessageBatch('synthire-resume-jobs-test', [
      { id: 'p1', timestamp: new Date(), attempts: 1, body: { type: 'purge-candidate', candidateId, companyId, resumeUrl: null } },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, { ...env, VECTORIZE: v.index } as unknown as Env, ctx)
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['p1'])
    expect(v.deleted).toEqual([[candidateId]])
  })
})

describe('dead-letter consumer', () => {
  it('marks an active candidate error with the dead-letter message', async () => {
    const result = await deliver('synthire-resume-jobs-test-dlq', body())
    expect(result.explicitAcks).toEqual(['m1'])
    expect(await status()).toEqual({ s: 'error', e: DEAD_LETTER_MESSAGE })
  })

  it('leaves a completed candidate alone', async () => {
    await env.DB.prepare(`UPDATE candidates SET processing_status = 'complete' WHERE id = ?`).bind(candidateId).run()
    await deliver('synthire-resume-jobs-test-dlq', body())
    expect((await status())?.s).toBe('complete')
  })
})
