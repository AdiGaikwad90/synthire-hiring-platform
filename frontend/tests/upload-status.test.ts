import { describe, it, expect } from 'vitest'
import { nextUploadRowStatus, isSettledUploadStatus, UPLOAD_POLL_TICKS } from '@/lib/upload-status'

describe('nextUploadRowStatus', () => {
  it.each([
    ['queued', 'queued'], ['parsing', 'parsing'], ['scoring', 'scoring'], ['complete', 'done'], ['error', 'error'],
  ])('maps processing_status %s to %s', (ps, expected) => {
    expect(nextUploadRowStatus(ps, 1)).toBe(expected)
  })

  it('stops polling with "background" after the window — the queue may still be working', () => {
    expect(nextUploadRowStatus('queued', UPLOAD_POLL_TICKS + 1)).toBe('background')
  })

  it('still reports a terminal state on the last tick', () => {
    expect(nextUploadRowStatus('complete', UPLOAD_POLL_TICKS + 1)).toBe('done')
    expect(nextUploadRowStatus('error', UPLOAD_POLL_TICKS + 1)).toBe('error')
  })

  it('returns null (no change, keep polling) for unknown or missing statuses inside the window', () => {
    expect(nextUploadRowStatus(undefined, 3)).toBeNull()
    expect(nextUploadRowStatus('pending', 3)).toBeNull()
  })
})

describe('isSettledUploadStatus', () => {
  it.each(['done', 'error', 'background'] as const)('%s is settled', (s) => expect(isSettledUploadStatus(s)).toBe(true))
  it.each(['queued', 'parsing', 'scoring'] as const)('%s is not', (s) => expect(isSettledUploadStatus(s)).toBe(false))
})
