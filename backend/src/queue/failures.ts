import { NeuronBudgetError } from '../services/budget/neurons'

/** A failure no retry can fix: unreadable file, missing job. Marks the row error. */
export class PermanentProcessingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentProcessingError'
  }
}

export const RETRY_BACKOFF_SECONDS = [30, 120, 600] as const
/** Queues' maximum delivery delay. */
export const MAX_DELAY_SECONDS = 86400

export type FailureAction =
  | { kind: 'fail'; reason: string }
  | { kind: 'retry'; delaySeconds: number; reason: string; waitingForBudget: boolean }

/**
 * Decides what the consumer does with a failed message. `attempts` is
 * Message.attempts (1 on first delivery).
 */
export function classifyFailure(err: unknown, attempts: number): FailureAction {
  const reason = err instanceof Error ? err.message : String(err)
  if (err instanceof PermanentProcessingError) return { kind: 'fail', reason }
  if (err instanceof NeuronBudgetError) {
    return { kind: 'retry', delaySeconds: Math.min(err.resetInSeconds + 60, MAX_DELAY_SECONDS), reason, waitingForBudget: true }
  }
  const index = Math.min(Math.max(attempts, 1), RETRY_BACKOFF_SECONDS.length) - 1
  return { kind: 'retry', delaySeconds: RETRY_BACKOFF_SECONDS[index], reason, waitingForBudget: false }
}
