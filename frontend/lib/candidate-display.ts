/**
 * How a candidate row reads on screen: its state, the name to show and the
 * score to show. Every screen that lists candidates goes through this.
 *
 * An upload creates its row at once under a placeholder name and with no
 * score. Screens used to print that name and map the missing score to 0, so a
 * resume in progress — or one that failed — looked like a candidate called
 * "Processing..." who scored 0% (SYN-008).
 */
export type CandidateState = 'processing' | 'failed' | 'ready'

export interface CandidateDisplay {
  state: CandidateState
  name: string
  /** null = nothing to show. A real 0 is a score. */
  score: number | null
}

export const UNKNOWN_CANDIDATE = 'Unknown candidate'
export const PROCESSING_NAME = 'Processing resume…'
export const FAILED_NAME = 'Upload failed'

/** What the backend stores in the name column when it has no name. */
const NO_NAME = new Set(['', 'processing...', 'not provided', 'unknown candidate'])

const FALLBACK_NAME: Record<CandidateState, string> = {
  processing: PROCESSING_NAME,
  failed: FAILED_NAME,
  ready: UNKNOWN_CANDIDATE,
}

function stateOf(processingStatus: string | null | undefined): CandidateState {
  // Hand-built objects carry no status; anything the API sends does.
  if (processingStatus == null || processingStatus === 'complete') return 'ready'
  return processingStatus === 'error' ? 'failed' : 'processing'
}

export function candidateDisplay(
  c: { name?: string | null; processing_status?: string | null; overall_score?: number | null } | null | undefined,
): CandidateDisplay {
  const state = stateOf(c?.processing_status)
  const name = (c?.name ?? '').trim()
  const score = c?.overall_score
  return {
    state,
    name: NO_NAME.has(name.toLowerCase()) ? FALLBACK_NAME[state] : name,
    score: state === 'ready' && typeof score === 'number' && Number.isFinite(score) ? score : null,
  }
}
