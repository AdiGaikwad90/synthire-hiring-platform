import { describe, it, expect } from 'vitest'
import { candidateDisplay, UNKNOWN_CANDIDATE, PROCESSING_NAME, FAILED_NAME } from '@/lib/candidate-display'

/**
 * SYN-008 — a resume that is still being processed, or failed, was shown as a
 * candidate called "Processing..." with a 0% score, because every screen read
 * the stored placeholder name and mapped a missing score to 0.
 */

describe('candidateDisplay — happy path', () => {
  it('a processed candidate shows its name and score', () => {
    expect(candidateDisplay({ name: 'Dana Cho', processing_status: 'complete', overall_score: 82 }))
      .toEqual({ state: 'ready', name: 'Dana Cho', score: 82 })
  })
})

describe('candidateDisplay — positive variants', () => {
  it('a resume in the queue or being read has no name yet and no score', () => {
    for (const processing_status of ['queued', 'parsing', 'pending']) {
      expect(candidateDisplay({ name: 'Processing...', processing_status, overall_score: null }), processing_status)
        .toEqual({ state: 'processing', name: PROCESSING_NAME, score: null })
    }
  })

  it('a resume being scored already shows the name that was read from it', () => {
    expect(candidateDisplay({ name: 'Priya Raman', processing_status: 'scoring', overall_score: null }))
      .toEqual({ state: 'processing', name: 'Priya Raman', score: null })
  })

  it('a failed upload is named only if the resume was read before it failed', () => {
    expect(candidateDisplay({ name: 'Processing...', processing_status: 'error' })).toEqual({ state: 'failed', name: FAILED_NAME, score: null })
    expect(candidateDisplay({ name: 'Priya Raman', processing_status: 'error' })).toEqual({ state: 'failed', name: 'Priya Raman', score: null })
  })

  it('a processed resume with no name on it is an unknown candidate, never a placeholder', () => {
    for (const name of ['Not Provided', 'Processing...', 'Unknown Candidate', '', '   ', null, undefined]) {
      expect(candidateDisplay({ name, processing_status: 'complete', overall_score: 50 }).name, `"${name}"`).toBe(UNKNOWN_CANDIDATE)
    }
  })

  it('trims a real name', () => {
    expect(candidateDisplay({ name: '  Dana Cho ', processing_status: 'complete' }).name).toBe('Dana Cho')
  })
})

describe('candidateDisplay — boundaries', () => {
  it('a real score of 0 or 100 is kept; it is not the same as no score', () => {
    expect(candidateDisplay({ name: 'A', processing_status: 'complete', overall_score: 0 }).score).toBe(0)
    expect(candidateDisplay({ name: 'A', processing_status: 'complete', overall_score: 100 }).score).toBe(100)
  })
})

describe('candidateDisplay — invalid input', () => {
  it('a score left on an unfinished or failed row is never shown', () => {
    expect(candidateDisplay({ name: 'A', processing_status: 'scoring', overall_score: 40 }).score).toBeNull()
    expect(candidateDisplay({ name: 'A', processing_status: 'error', overall_score: 40 }).score).toBeNull()
  })

  it('a score that is not a finite number is no score', () => {
    for (const overall_score of [NaN, Infinity, '82' as unknown as number]) {
      expect(candidateDisplay({ name: 'A', processing_status: 'complete', overall_score }).score, String(overall_score)).toBeNull()
    }
  })

  it('an unknown processing status is treated as still processing, not as scored', () => {
    expect(candidateDisplay({ name: 'Processing...', processing_status: 'weird', overall_score: 0 }))
      .toEqual({ state: 'processing', name: PROCESSING_NAME, score: null })
  })
})

describe('candidateDisplay — empty / zero', () => {
  it('nothing at all is an unknown, unscored, processed candidate', () => {
    // Objects built by hand (search results, interview rows) carry no processing status.
    expect(candidateDisplay({})).toEqual({ state: 'ready', name: UNKNOWN_CANDIDATE, score: null })
    expect(candidateDisplay(null)).toEqual({ state: 'ready', name: UNKNOWN_CANDIDATE, score: null })
  })
})

// Error contract: N/A — the function never throws; bad input degrades to the cases above.
