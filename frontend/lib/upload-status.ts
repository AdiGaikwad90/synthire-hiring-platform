/**
 * Upload-row state for ResumeBatchModal. Processing runs on a queue and can
 * legitimately outlast the modal's polling window (retries, or waiting for the
 * daily AI budget to reset), so running out of ticks is "background", not "error".
 */
export type UploadRowStatus = 'queued' | 'parsing' | 'scoring' | 'done' | 'error' | 'background'

/** 60 ticks × 2 s = 2 minutes of polling in the modal. */
export const UPLOAD_POLL_TICKS = 60

/** null = no change, keep polling. */
export function nextUploadRowStatus(processingStatus: string | null | undefined, ticks: number): UploadRowStatus | null {
  if (processingStatus === 'complete') return 'done'
  if (processingStatus === 'error') return 'error'
  if (ticks > UPLOAD_POLL_TICKS) return 'background'
  if (processingStatus === 'queued' || processingStatus === 'parsing' || processingStatus === 'scoring') return processingStatus
  return null
}

export function isSettledUploadStatus(s: UploadRowStatus): boolean {
  return s === 'done' || s === 'error' || s === 'background'
}
