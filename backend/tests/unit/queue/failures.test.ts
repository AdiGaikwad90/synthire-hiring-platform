import { describe, it, expect } from 'vitest'
import { classifyFailure, PermanentProcessingError, RETRY_BACKOFF_SECONDS, MAX_DELAY_SECONDS } from '../../../src/queue/failures'
import { NeuronBudgetError } from '../../../src/services/budget/neurons'
import { AppError } from '../../../src/types/api'

describe('classifyFailure — happy path', () => {
  it('fails a permanent error without retrying, keeping its message', () => {
    expect(classifyFailure(new PermanentProcessingError('No readable text'), 1)).toEqual({ kind: 'fail', reason: 'No readable text' })
  })
})

describe('classifyFailure — positive variants', () => {
  it('retries a transient error with backoff per attempt', () => {
    expect(classifyFailure(new Error('AI 502'), 1)).toEqual({ kind: 'retry', delaySeconds: 30, reason: 'AI 502', waitingForBudget: false })
    expect(classifyFailure(new Error('AI 502'), 2)).toMatchObject({ delaySeconds: 120 })
    expect(classifyFailure(new Error('AI 502'), 3)).toMatchObject({ delaySeconds: 600 })
  })

  it('treats "all models exhausted" (AppError 503) as transient, not as the budget', () => {
    expect(classifyFailure(new AppError('All AI models exhausted without a valid response', 503), 1)).toMatchObject({ kind: 'retry', delaySeconds: 30, waitingForBudget: false })
  })

  it('waits for the UTC budget reset plus a minute when the AI budget is exhausted', () => {
    expect(classifyFailure(new NeuronBudgetError('limit', 3600), 1)).toMatchObject({ kind: 'retry', delaySeconds: 3660, waitingForBudget: true })
  })
})

describe('classifyFailure — boundaries', () => {
  it('keeps the longest backoff for attempts beyond the table', () => {
    expect(classifyFailure(new Error('x'), 9)).toMatchObject({ delaySeconds: RETRY_BACKOFF_SECONDS[2] })
  })
  it('caps the budget delay at 24 hours', () => {
    expect(classifyFailure(new NeuronBudgetError('limit', 999_999), 1)).toMatchObject({ delaySeconds: MAX_DELAY_SECONDS })
  })
  it('treats attempts of 0 or less as the first attempt', () => {
    expect(classifyFailure(new Error('x'), 0)).toMatchObject({ delaySeconds: 30 })
  })
})

describe('classifyFailure — invalid input', () => {
  it.each([['a string', 'boom'], ['undefined', undefined], ['a plain object', { message: 'x' }]])(
    'retries a non-Error throw (%s) as transient', (_n, thrown) => {
      expect(classifyFailure(thrown, 1).kind).toBe('retry')
    },
  )
})

// Empty / error contract: N/A — pure function, never throws.
