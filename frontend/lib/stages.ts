import type { Stage } from './types'

/**
 * The stages a candidate moves through — the one list the filter, the card
 * badge and the stage pill all read. Keep it in step with CANDIDATE_STAGES in
 * backend/src/types/api.ts: the API refuses any other value.
 *
 * The Candidates page used to keep its own list with "Applied" and
 * "Interviewing", which are not stages, so those filters matched nothing and
 * five real stages could not be picked (SYN-006).
 */
export const STAGES = ['new', 'shortlisted', 'scheduled', 'inprogress', 'feedback', 'hired', 'rejected'] as const satisfies readonly Stage[]

export const STAGE_LABELS: Record<Stage, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  scheduled: 'Scheduled',
  inprogress: 'In Progress',
  feedback: 'Feedback',
  hired: 'Hired',
  rejected: 'Rejected',
}

const isStage = (value: unknown): value is Stage => STAGES.includes(value as Stage)

/** Options for a stage filter; "" means no filter. */
export const STAGE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Stages' },
  ...STAGES.map((value) => ({ value, label: STAGE_LABELS[value] })),
]

/** A stage's display name; an unknown value is shown as-is, capitalised. */
export function stageLabel(stage: string | null | undefined): string {
  if (isStage(stage)) return STAGE_LABELS[stage]
  return stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : ''
}

/** Badge colour for a stage: where the candidate stands at a glance. */
export function stageTone(stage: string | null | undefined): 'success' | 'danger' | 'primary' | 'neutral' {
  if (stage === 'shortlisted' || stage === 'hired') return 'success'
  if (stage === 'rejected') return 'danger'
  if (stage === 'scheduled' || stage === 'inprogress' || stage === 'feedback') return 'primary'
  return 'neutral'
}
