import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env, createMessageBatch, createExecutionContext, getQueueResult, waitOnExecutionContext } from 'cloudflare:test'
import type { D1Database } from '@cloudflare/workers-types'
import worker from '../../../src/index'
import { DEAD_LETTER_MESSAGE, handleResumeQueue, handleDeadLetters } from '../../../src/queue/handler'
import { createJob } from '../../../src/db/queries/jobs'
import type { Env } from '../../../src/types/bindings'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate } from '../../setup/factories'
import { stubAi, stubVectorize } from '../../setup/ai-stub'

/** A batch built by hand, with ack/retry spies, for asserting call args directly. */
function fakeBatch(queue: string, msgBody: unknown, attempts = 1) {
  const ack = vi.fn()
  const retry = vi.fn()
  const message = { id: 'm1', timestamp: new Date(), attempts, body: msgBody, ack, retry }
  const batch = { queue, messages: [message], metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } }, ackAll: vi.fn(), retryAll: vi.fn() }
  return { batch: batch as unknown as MessageBatch<unknown>, ack, retry }
}

/** Wraps a real D1Database so any UPDATE writing processing_status = 'error' throws. */
function dbThrowingOnErrorWrite(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          if (sql.includes(`processing_status = 'error'`)) throw new Error('simulated D1 write failure')
          return (target.prepare as (s: string) => unknown)(sql)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as D1Database
}

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
  it('F4: meters D1/KV usage during processing and flushes it to quota_usage', async () => {
    await env.DB.prepare('DELETE FROM quota_usage').run()
    await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
    const batch = createMessageBatch('synthire-resume-jobs-test', [{ id: 'm1', timestamp: new Date(), attempts: 1, body: body() }])
    const ctx = createExecutionContext()
    const e = { ...env, AI: stubAi().ai, VECTORIZE: stubVectorize().index } as unknown as Env
    await worker.queue(batch, e, ctx)
    await waitOnExecutionContext(ctx)
    const row = await env.DB.prepare('SELECT d1_rows_read, d1_rows_written FROM quota_usage').first<{ d1_rows_read: number; d1_rows_written: number }>()
    expect(row).not.toBeNull()
    expect((row?.d1_rows_read ?? 0) + (row?.d1_rows_written ?? 0)).toBeGreaterThan(0)
  })

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

  it('retries a transient AI failure with the exact backoff delay (direct call, spy retry)', async () => {
    await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
    const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 2)
    const e = { ...env, AI: stubAi({ failOn: 'parse' }).ai, VECTORIZE: stubVectorize().index } as unknown as Env
    await handleResumeQueue(batch, e)
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 })
    expect(ack).not.toHaveBeenCalled()
  })

  it('F3: requeues via RESUME_QUEUE.send + ack (not retry) when the Neuron budget is exhausted', async () => {
    const key = `neurons:daily:${new Date().toISOString().slice(0, 10)}`
    await env.KV_CACHE.put(key, '10000')
    try {
      await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
      const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 1)
      const send = vi.fn(async () => {})
      const e = { ...env, AI: stubAi().ai, VECTORIZE: stubVectorize().index, RESUME_QUEUE: { send } } as unknown as Env
      await handleResumeQueue(batch, e)
      expect(send).toHaveBeenCalledTimes(1)
      const [[sentMsg, sentOpts]] = send.mock.calls as unknown as [[unknown, { delaySeconds: number }]]
      expect(sentMsg).toEqual(body())
      expect(sentOpts.delaySeconds).toBeGreaterThan(60)
      expect(sentOpts.delaySeconds).toBeLessThanOrEqual(86400)
      expect(ack).toHaveBeenCalledTimes(1)
      expect(retry).not.toHaveBeenCalled()
      expect((await status())?.s).toBe('queued')
    } finally {
      await env.KV_CACHE.delete(key)
    }
  })

  it('F3: falls back to message.retry with the budget delay when RESUME_QUEUE.send throws', async () => {
    const key = `neurons:daily:${new Date().toISOString().slice(0, 10)}`
    await env.KV_CACHE.put(key, '10000')
    try {
      await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
      const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 1)
      const send = vi.fn(async () => { throw new Error('queue send failed') })
      const e = { ...env, AI: stubAi().ai, VECTORIZE: stubVectorize().index, RESUME_QUEUE: { send } } as unknown as Env
      await handleResumeQueue(batch, e)
      expect(send).toHaveBeenCalledTimes(1)
      expect(retry).toHaveBeenCalledTimes(1)
      const [[call]] = retry.mock.calls
      expect(call.delaySeconds).toBeGreaterThan(60)
      expect(ack).not.toHaveBeenCalled()
    } finally {
      await env.KV_CACHE.delete(key)
    }
  })

  it('F3: a transient (non-budget) failure still uses message.retry with backoff, never RESUME_QUEUE.send', async () => {
    await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
    const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 2)
    const send = vi.fn(async () => {})
    const e = { ...env, AI: stubAi({ failOn: 'parse' }).ai, VECTORIZE: stubVectorize().index, RESUME_QUEUE: { send } } as unknown as Env
    await handleResumeQueue(batch, e)
    expect(send).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 })
    expect(ack).not.toHaveBeenCalled()
  })

  it('retries instead of acking when recording a permanent failure throws', async () => {
    const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 1)
    const e = { ...env, DB: dbThrowingOnErrorWrite(env.DB), AI: stubAi().ai, VECTORIZE: stubVectorize().index } as unknown as Env
    // No file in R2 → processResume throws PermanentProcessingError → the
    // fail branch tries updateCandidateError, which the wrapped DB rejects.
    await handleResumeQueue(batch, e)
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(ack).not.toHaveBeenCalled()
  })

  it('F6: logs (does not silently swallow) when resetting status to queued fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await env.RESUME_BUCKET.put(r2Key(), new Uint8Array([0x50, 0x4b]))
      const dbThrowingOnQueuedWrite = (db: D1Database): D1Database => new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === 'prepare') {
            return (sql: string) => {
              if (sql === 'UPDATE candidates SET processing_status = ?, updated_at = ? WHERE id = ?') {
                return { bind: () => ({ run: async () => { throw new Error('simulated D1 write failure') } }) }
              }
              return (target.prepare as (s: string) => unknown)(sql)
            }
          }
          return Reflect.get(target, prop, receiver)
        },
      }) as unknown as D1Database
      const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test', body(), 2)
      const e = { ...env, DB: dbThrowingOnQueuedWrite(env.DB), AI: stubAi({ failOn: 'parse' }).ai, VECTORIZE: stubVectorize().index } as unknown as Env
      await handleResumeQueue(batch, e)
      expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 })
      expect(ack).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith('[queue] could not reset status to queued', expect.objectContaining({ candidateId }))
    } finally {
      errorSpy.mockRestore()
    }
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

  it('retries instead of acking when the DB write throws, without stopping the rest of the batch', async () => {
    const { batch, ack, retry } = fakeBatch('synthire-resume-jobs-test-dlq', body(), 1)
    const e = { ...env, DB: dbThrowingOnErrorWrite(env.DB) } as unknown as Env
    await handleDeadLetters(batch, e)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(ack).not.toHaveBeenCalled()
    expect((await status())?.s).toBe('queued') // write never landed
  })
})
