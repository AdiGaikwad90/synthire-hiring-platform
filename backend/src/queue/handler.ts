import type { Env } from '../types/bindings'
import { parseQueueMessage } from './messages'
import { classifyFailure } from './failures'
import { processResume } from './process-resume'
import { purgeCandidateArtifacts } from '../services/candidates/purge'
import { failCandidateIfActive, setProcessingStatus, updateCandidateError } from '../db/queries/candidates'

export const DEAD_LETTER_MESSAGE = 'Processing failed after several attempts — please upload the resume again'

/** Work queue: one message per batch (max_batch_size = 1), acked or retried explicitly. */
export async function handleResumeQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const msg = parseQueueMessage(message.body)
    if (!msg) {
      console.error('[queue] dropping malformed message', { id: message.id })
      message.ack()
      continue
    }
    try {
      if (msg.type === 'process-resume') await processResume(env, msg)
      else await purgeCandidateArtifacts(env, msg)
      message.ack()
    } catch (err) {
      const action = classifyFailure(err, message.attempts)
      if (action.kind === 'fail') {
        if (msg.type === 'process-resume') await updateCandidateError(env.DB, msg.candidateId, action.reason)
        console.warn('[queue] permanent failure', { type: msg.type, candidateId: msg.candidateId, reason: action.reason })
        message.ack()
      } else {
        // Back to 'queued' while waiting: honest, and the stale sweep gives
        // queued rows 25 h instead of 10 min.
        if (msg.type === 'process-resume') {
          await setProcessingStatus(env.DB, msg.candidateId, 'queued').catch(() => {})
        }
        console.warn('[queue] retrying', { type: msg.type, candidateId: msg.candidateId, attempt: message.attempts, delaySeconds: action.delaySeconds, reason: action.reason })
        message.retry({ delaySeconds: action.delaySeconds })
      }
    }
  }
}

/** Dead-letter queue: retries are exhausted; record an honest terminal state. */
export async function handleDeadLetters(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const msg = parseQueueMessage(message.body)
    if (msg?.type === 'process-resume') {
      await failCandidateIfActive(env.DB, msg.candidateId, DEAD_LETTER_MESSAGE)
    } else {
      console.error('[dlq] message exhausted its retries', { id: message.id, body: message.body })
    }
    message.ack()
  }
}
