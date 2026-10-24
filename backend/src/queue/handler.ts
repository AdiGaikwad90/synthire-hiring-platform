import type { Env } from '../types/bindings'
import { parseQueueMessage } from './messages'
import { classifyFailure, RETRY_BACKOFF_SECONDS } from './failures'
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
        try {
          if (msg.type === 'process-resume') await updateCandidateError(env.DB, msg.candidateId, action.reason)
          console.warn('[queue] permanent failure', { type: msg.type, candidateId: msg.candidateId, reason: action.reason })
          message.ack()
        } catch (writeErr) {
          // Couldn't record the failure — retry rather than silently dropping
          // the message; the next attempt re-classifies and tries again, and
          // exhausted retries land it on the DLQ.
          console.error('[queue] could not record permanent failure', {
            candidateId: msg.candidateId,
            error: writeErr instanceof Error ? writeErr.message : String(writeErr),
          })
          message.retry({ delaySeconds: RETRY_BACKOFF_SECONDS[0] })
        }
      } else {
        // Back to 'queued' while waiting: honest, and the stale sweep gives
        // queued rows 25 h instead of 10 min.
        if (msg.type === 'process-resume') {
          await setProcessingStatus(env.DB, msg.candidateId, 'queued').catch((writeErr) => {
            console.error('[queue] could not reset status to queued', {
              candidateId: msg.candidateId,
              error: writeErr instanceof Error ? writeErr.message : String(writeErr),
            })
          })
        }
        console.warn('[queue] retrying', { type: msg.type, candidateId: msg.candidateId, attempt: message.attempts, delaySeconds: action.delaySeconds, reason: action.reason })

        // Budget waits can outlive the 24h free-plan message retention and
        // burn a retry attempt for nothing. Requeue as a fresh message (fresh
        // retention clock, no retry consumed) and ack this one instead.
        if (action.waitingForBudget) {
          try {
            await env.RESUME_QUEUE.send(msg, { delaySeconds: action.delaySeconds })
            message.ack()
            continue
          } catch (sendErr) {
            console.error('[queue] could not requeue budget wait — falling back to retry', {
              candidateId: msg.candidateId,
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
            })
          }
        }
        message.retry({ delaySeconds: action.delaySeconds })
      }
    }
  }
}

/** Dead-letter queue: retries are exhausted; record an honest terminal state. */
export async function handleDeadLetters(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const msg = parseQueueMessage(message.body)
    try {
      if (msg?.type === 'process-resume') {
        await failCandidateIfActive(env.DB, msg.candidateId, DEAD_LETTER_MESSAGE)
      } else {
        console.error('[dlq] message exhausted its retries', { id: message.id, body: message.body })
      }
      message.ack()
    } catch (err) {
      // One bad message must never stop the rest of the DLQ batch — retry
      // this one instead of acking it away unrecorded.
      console.error('[dlq] could not mark candidate failed', {
        candidateId: msg?.type === 'process-resume' ? msg.candidateId : undefined,
        error: err instanceof Error ? err.message : String(err),
      })
      message.retry()
    }
  }
}
