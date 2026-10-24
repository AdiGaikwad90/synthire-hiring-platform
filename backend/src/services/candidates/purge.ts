import type { Env } from '../../types/bindings'
import type { PurgeCandidateMessage } from '../../queue/messages'
import { deleteFromR2 } from '../storage/r2'

/**
 * Removes everything a deleted candidate left outside D1: the stored resume
 * (with storage accounting), its embedding, and cached interview questions.
 * Every step is idempotent; any failure throws so the queue retries the lot.
 */
export async function purgeCandidateArtifacts(env: Env, msg: PurgeCandidateMessage): Promise<void> {
  if (msg.resumeUrl) await deleteFromR2(env, msg.resumeUrl)
  await env.VECTORIZE.deleteByIds([msg.candidateId])
  await env.KV_CACHE.delete(`questions:${msg.candidateId}`)
}
