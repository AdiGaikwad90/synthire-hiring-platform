import { describe, it, expect } from 'vitest'
import { STAGES, STAGE_LABELS, STAGE_FILTER_OPTIONS, stageLabel, stageTone } from '@/lib/stages'

/**
 * SYN-006. The Candidates page had its own list of stages for the filter —
 * "Applied" (`applied`) and "Interviewing" (`interviewing`) — which the app
 * never stores, so both came back empty and five real stages could not be
 * picked. The card badge checked for `interviewing` too. Filter, badge and
 * stage pill now all read one list.
 */

// The stages the API accepts: CANDIDATE_STAGES in backend/src/types/api.ts.
const API_STAGES = ['new', 'shortlisted', 'scheduled', 'inprogress', 'feedback', 'hired', 'rejected']

describe('STAGES', () => {
  it('is exactly the list the API accepts, in pipeline order', () => {
    expect([...STAGES]).toEqual(API_STAGES)
  })

  it('has a label for every stage', () => {
    for (const stage of STAGES) expect(STAGE_LABELS[stage], stage).toMatch(/^[A-Z]/)
  })
})

describe('STAGE_FILTER_OPTIONS', () => {
  it('offers "All Stages" (no filter) first, then every real stage', () => {
    expect(STAGE_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'All Stages' })
    expect(STAGE_FILTER_OPTIONS.slice(1).map((o) => o.value)).toEqual(API_STAGES)
  })

  it('offers nothing the API would refuse', () => {
    for (const { value } of STAGE_FILTER_OPTIONS) {
      expect(value === '' || API_STAGES.includes(value), `"${value}" is not a stage`).toBe(true)
    }
    const values = STAGE_FILTER_OPTIONS.map((o) => o.value)
    expect(values).not.toContain('applied')
    expect(values).not.toContain('interviewing')
  })

  it('labels each option the way the rest of the app names the stage', () => {
    expect(STAGE_FILTER_OPTIONS.find((o) => o.value === 'inprogress')?.label).toBe('In Progress')
    expect(STAGE_FILTER_OPTIONS.find((o) => o.value === 'new')?.label).toBe('New')
  })
})

describe('stageLabel', () => {
  it('names a real stage', () => {
    expect(stageLabel('inprogress')).toBe('In Progress')
    expect(stageLabel('shortlisted')).toBe('Shortlisted')
  })

  // A value the app does not know (older data) is shown as-is rather than hidden or crashing.
  it('falls back to the raw value, capitalised, for anything else', () => {
    expect(stageLabel('archived')).toBe('Archived')
    expect(stageLabel('')).toBe('')
    for (const v of [null, undefined]) expect(stageLabel(v)).toBe('')
  })
})

describe('stageTone', () => {
  it.each([
    ['new', 'neutral'], ['shortlisted', 'success'], ['scheduled', 'primary'], ['inprogress', 'primary'],
    ['feedback', 'primary'], ['hired', 'success'], ['rejected', 'danger'],
  ] as const)('%s → %s', (stage, tone) => {
    expect(stageTone(stage)).toBe(tone)
  })

  it('is neutral for a value it does not know, including the old made-up ones', () => {
    for (const v of ['interviewing', 'applied', '', null, undefined]) expect(stageTone(v), String(v)).toBe('neutral')
  })
})
