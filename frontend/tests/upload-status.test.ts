import { describe, it, expect } from 'vitest'
import { uploadRow, uploadPollInterval, isSettledUploadStatus, UPLOAD_POLL_TICKS, UPLOAD_POLL_MS } from '@/lib/upload-status'

/**
 * SYN-005. The upload dialog kept its own row state with hand-rolled 2-second
 * timers, never told the candidate lists anything had changed, and showed a
 * failure as the bare word "error". The row is now DERIVED from three facts —
 * was the upload accepted, what does the candidate say, how many checks have
 * run — so there is no state to drift and nothing to clean up.
 */

const row = (over: Partial<Parameters<typeof uploadRow>[0]> = {}) =>
  uploadRow({ accepted: true, uploadError: null, candidate: null, ticks: 1, ...over })

describe('uploadRow — happy path', () => {
  it('shows the score once the candidate is processed', () => {
    expect(row({ candidate: { processing_status: 'complete', overall_score: 82 } }))
      .toEqual({ status: 'done', score: 82, sub: 'Score: 82%' })
  })
})

describe('uploadRow — positive variants (each stage of the pipeline)', () => {
  it('is "uploading" until the server has accepted the file', () => {
    expect(row({ accepted: false })).toEqual({ status: 'uploading', score: null })
  })

  it.each([['queued', 'queued'], ['parsing', 'parsing'], ['scoring', 'scoring']] as const)(
    'processing_status %s → %s', (processing_status, status) => {
      expect(row({ candidate: { processing_status } })).toEqual({ status, score: null })
    })

  it('is "queued" while accepted but not yet checked, or in a status it does not know', () => {
    expect(row({ candidate: null, ticks: 0 }).status).toBe('queued')
    expect(row({ candidate: { processing_status: 'pending' } }).status).toBe('queued')
    expect(row({ candidate: { processing_status: null } }).status).toBe('queued')
  })

  it('is done without a score when scoring produced none', () => {
    expect(row({ candidate: { processing_status: 'complete', overall_score: null } })).toEqual({ status: 'done', score: null })
  })

  it('keeps a score of 0 — zero is a result, not a missing value', () => {
    expect(row({ candidate: { processing_status: 'complete', overall_score: 0 } }))
      .toEqual({ status: 'done', score: 0, sub: 'Score: 0%' })
  })
})

describe('uploadRow — failures say why', () => {
  it('shows the server\'s reason when the upload itself was refused', () => {
    expect(row({ accepted: false, uploadError: 'Unsupported file type' }))
      .toEqual({ status: 'error', score: null, sub: 'Unsupported file type' })
  })

  it('shows the stored reason when processing failed', () => {
    expect(row({ candidate: { processing_status: 'error', processing_error: 'No readable text found in the resume' } }))
      .toEqual({ status: 'error', score: null, sub: 'No readable text found in the resume' })
  })

  it('falls back to a plain message when no reason was recorded', () => {
    for (const processing_error of [null, undefined, '', '   ']) {
      expect(row({ candidate: { processing_status: 'error', processing_error } }).sub, JSON.stringify(processing_error))
        .toBe('Processing failed')
    }
    expect(row({ accepted: false, uploadError: '' }).status, 'an empty upload error is not an error').toBe('uploading')
  })

  it('never shows a score on a failed row, even if an old one is still stored', () => {
    expect(row({ candidate: { processing_status: 'error', overall_score: 77 } }).score).toBeNull()
  })
})

describe('uploadRow — boundaries (the 2-minute window)', () => {
  it('keeps the live status on the last check inside the window', () => {
    expect(row({ candidate: { processing_status: 'scoring' }, ticks: UPLOAD_POLL_TICKS }).status).toBe('scoring')
  })

  // Processing runs on a queue and can outlast the dialog (retries, or waiting
  // for the daily AI budget): running out of checks is not a failure.
  it('becomes "background" one check later — the queue may still be working', () => {
    expect(row({ candidate: { processing_status: 'queued' }, ticks: UPLOAD_POLL_TICKS + 1 }).status).toBe('background')
  })

  it('still reports a finished or failed candidate after the window', () => {
    expect(row({ candidate: { processing_status: 'complete', overall_score: 60 }, ticks: UPLOAD_POLL_TICKS + 5 }).status).toBe('done')
    expect(row({ candidate: { processing_status: 'error' }, ticks: UPLOAD_POLL_TICKS + 5 }).status).toBe('error')
  })
})

describe('uploadPollInterval', () => {
  it.each(['queued', 'parsing', 'scoring', 'pending', undefined, null])('keeps checking while status is %s', (status) => {
    expect(uploadPollInterval(status, 3)).toBe(UPLOAD_POLL_MS)
  })

  it.each(['complete', 'error'])('stops once status is %s', (status) => {
    expect(uploadPollInterval(status, 3)).toBe(false)
  })

  it('stops after the window, whatever the status', () => {
    expect(uploadPollInterval('scoring', UPLOAD_POLL_TICKS)).toBe(UPLOAD_POLL_MS)
    expect(uploadPollInterval('scoring', UPLOAD_POLL_TICKS + 1)).toBe(false)
  })
})

describe('isSettledUploadStatus', () => {
  it.each(['done', 'error', 'background'] as const)('%s is settled', (s) => expect(isSettledUploadStatus(s)).toBe(true))
  it.each(['uploading', 'queued', 'parsing', 'scoring'] as const)('%s is not', (s) => expect(isSettledUploadStatus(s)).toBe(false))
})
