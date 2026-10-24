import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { purgeCandidateArtifacts } from '../../../src/services/candidates/purge'
import { uploadToR2 } from '../../../src/services/storage/r2'
import type { Env } from '../../../src/types/bindings'
import { stubVectorize } from '../../setup/ai-stub'

const KEY = 'resumes/co_purge/job_purge/cand_purge.pdf'
const msg = { type: 'purge-candidate' as const, candidateId: 'cand_purge', companyId: 'co_purge', resumeUrl: KEY }

describe('purgeCandidateArtifacts', () => {
  it('removes the file, its storage accounting, the vector and the question cache', async () => {
    await uploadToR2(env as unknown as Env, KEY, new Uint8Array(1234).buffer, 'application/pdf')
    await env.KV_CACHE.put('questions:cand_purge', '{"questions":[]}')
    const before = parseInt((await env.KV_CACHE.get('r2:storage:bytes')) ?? '0', 10)
    const v = stubVectorize()

    await purgeCandidateArtifacts({ ...env, VECTORIZE: v.index } as unknown as Env, msg)

    expect(await env.RESUME_BUCKET.get(KEY)).toBeNull()
    expect(await env.KV_CACHE.get('questions:cand_purge')).toBeNull()
    expect(await env.KV_CACHE.get(`r2:file:${KEY}:size`)).toBeNull()
    expect(parseInt((await env.KV_CACHE.get('r2:storage:bytes')) ?? '0', 10)).toBe(before - 1234)
    expect(v.deleted).toEqual([['cand_purge']])
  })

  it('is idempotent — a second run after everything is gone succeeds', async () => {
    const v = stubVectorize()
    const e = { ...env, VECTORIZE: v.index } as unknown as Env
    await purgeCandidateArtifacts(e, msg)
    await expect(purgeCandidateArtifacts(e, msg)).resolves.toBeUndefined()
  })

  it('handles a candidate that never had a stored file', async () => {
    const v = stubVectorize()
    await purgeCandidateArtifacts({ ...env, VECTORIZE: v.index } as unknown as Env, { ...msg, resumeUrl: null })
    expect(v.deleted).toEqual([['cand_purge']])
  })

  it('throws when a step fails so the queue retries', async () => {
    const failing = { deleteByIds: async () => { throw new Error('vectorize 500') } }
    await expect(
      purgeCandidateArtifacts({ ...env, VECTORIZE: failing } as unknown as Env, { ...msg, resumeUrl: null }),
    ).rejects.toThrow('vectorize 500')
  })
})
