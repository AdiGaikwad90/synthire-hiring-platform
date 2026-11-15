/**
 * Upload-row state for ResumeBatchModal, derived rather than stored: given
 * whether the upload was accepted, what the candidate record says and how many
 * progress checks have run, there is exactly one right row (SYN-005).
 *
 * Processing runs on a queue and can legitimately outlast the dialog's polling
 * window (retries, or waiting for the daily AI budget to reset), so running
 * out of checks is "background", not "error".
 */
export type UploadRowStatus = 'uploading' | 'queued' | 'parsing' | 'scoring' | 'done' | 'error' | 'background'

/** 60 checks × 2 s = 2 minutes of polling in the dialog. */
export const UPLOAD_POLL_TICKS = 60
export const UPLOAD_POLL_MS = 2000

export interface UploadRowInput {
  /** The server accepted the file and returned a candidate id. */
  accepted: boolean
  /** Why the upload request was refused, if it was. */
  uploadError: string | null
  /** The candidate as last fetched; null before the first check. */
  candidate: { processing_status?: string | null; processing_error?: string | null; overall_score?: number | null } | null
  /** Progress checks completed so far. */
  ticks: number
}

export interface UploadRow {
  status: UploadRowStatus
  score: number | null
  /** Shown under the file name: the score, or why it failed. */
  sub?: string
}

export function uploadRow({ accepted, uploadError, candidate, ticks }: UploadRowInput): UploadRow {
  if (uploadError) return { status: 'error', score: null, sub: uploadError }
  if (!accepted) return { status: 'uploading', score: null }

  const processing = candidate?.processing_status
  if (processing === 'complete') {
    const score = candidate?.overall_score ?? null
    return score == null ? { status: 'done', score: null } : { status: 'done', score, sub: `Score: ${score}%` }
  }
  if (processing === 'error') {
    return { status: 'error', score: null, sub: candidate?.processing_error?.trim() || 'Processing failed' }
  }
  if (ticks > UPLOAD_POLL_TICKS) return { status: 'background', score: null }
  if (processing === 'parsing' || processing === 'scoring') return { status: processing, score: null }
  return { status: 'queued', score: null }
}

/** How soon to check an uploaded candidate again; false once it is finished, failed, or the window has passed. */
export function uploadPollInterval(processingStatus: string | null | undefined, ticks: number): number | false {
  if (processingStatus === 'complete' || processingStatus === 'error' || ticks > UPLOAD_POLL_TICKS) return false
  return UPLOAD_POLL_MS
}

export function isSettledUploadStatus(s: UploadRowStatus): boolean {
  return s === 'done' || s === 'error' || s === 'background'
}
