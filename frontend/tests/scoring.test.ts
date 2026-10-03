import { describe, it, expect } from 'vitest'
import {
  VERDICT_META, VERDICT_ORDER, sortSkillMatches, verdictCounts, evaluationCoverage, parseAttribution, attributionRows,
} from '@/lib/scoring'
import type { ApiSkillMatch, ApiScoreAttribution } from '@/lib/api'

const m = (skill: string, verdict: ApiSkillMatch['verdict'], requirement: ApiSkillMatch['requirement'] = 'required'): ApiSkillMatch =>
  ({ skill, requirement, verdict, evidence: null, via: null })

const ATTR: ApiScoreAttribution = {
  version: 1,
  contributions: { skills: 20.5, experience: 15.25, education: 0, achievements: 9.75, semantic: 18 },
  importances: { skills: 80, experience: 70, education: 0, achievements: 60 },
  llmWeight: 0.7, semanticWeight: 0.3,
  subDimensions: { skills: { technical: 80, soft: 70 }, experience: { years_relevant: 55 }, education: {}, achievements: {} },
}

describe('VERDICT_META', () => {
  it('labels claimed as "listed, not evidenced" rather than as a failure', () => {
    expect(VERDICT_META.claimed).toEqual({ label: 'Listed, not evidenced', variant: 'warning' })
  })

  it('covers every verdict', () => {
    expect(Object.keys(VERDICT_META).sort()).toEqual([...VERDICT_ORDER].sort())
  })
})

describe('sortSkillMatches', () => {
  it('groups by verdict (evidenced, transferable, claimed, missing), required first within a group, stable otherwise', () => {
    const out = sortSkillMatches([
      m('A', 'missing'), m('B', 'evidenced', 'nice_to_have'), m('C', 'claimed'), m('D', 'evidenced'), m('E', 'transferable'), m('F', 'evidenced'),
    ])
    expect(out.map((x) => x.skill)).toEqual(['D', 'F', 'B', 'E', 'C', 'A'])
  })

  it('does not mutate its input and handles []', () => {
    const input = [m('A', 'missing'), m('B', 'evidenced')]
    sortSkillMatches(input)
    expect(input.map((x) => x.skill)).toEqual(['A', 'B'])
    expect(sortSkillMatches([])).toEqual([])
  })
})

describe('verdictCounts', () => {
  it('counts each verdict, with zeros for the absent ones', () => {
    expect(verdictCounts([m('A', 'claimed'), m('B', 'claimed'), m('C', 'missing')]))
      .toEqual({ evidenced: 0, transferable: 0, claimed: 2, missing: 1 })
  })
})

describe('evaluationCoverage', () => {
  it('names the job skills that were not adjudicated (cap or job edited later)', () => {
    expect(evaluationCoverage([m('Go', 'evidenced')], ['Go', 'SQL'], ['Rust']))
      .toEqual({ total: 3, notEvaluated: ['SQL', 'Rust'] })
  })

  it('matches case- and whitespace-insensitively and de-duplicates the job list', () => {
    expect(evaluationCoverage([m('Go', 'evidenced')], [' go ', 'GO'], ['go']))
      .toEqual({ total: 1, notEvaluated: [] })
  })

  it('handles a job with no skills', () => {
    expect(evaluationCoverage([], [], [])).toEqual({ total: 0, notEvaluated: [] })
  })

  it('tolerates junk in the job lists', () => {
    expect(evaluationCoverage([], ['Go', '', null as unknown as string], [])).toEqual({ total: 1, notEvaluated: ['Go'] })
  })
})

describe('parseAttribution', () => {
  it('accepts a well-formed v1 snapshot', () => {
    expect(parseAttribution(ATTR)).toEqual(ATTR)
  })

  it.each([
    ['null', null], ['a string', '{"version":1}'], ['wrong version', { ...ATTR, version: 2 }],
    ['missing contributions', { ...ATTR, contributions: undefined }],
    ['non-numeric contribution', { ...ATTR, contributions: { ...ATTR.contributions, skills: 'high' } }],
  ])('returns null for %s', (_n, raw) => {
    expect(parseAttribution(raw)).toBeNull()
  })
})

describe('attributionRows', () => {
  const rows = attributionRows(ATTR)

  it('returns the four dimensions then semantic', () => {
    expect(rows.map((r) => r.id)).toEqual(['skills', 'experience', 'education', 'achievements', 'semantic'])
  })

  it('derives each weight from the snapshot importances and llm/semantic split, summing to 100', () => {
    // 80/(80+70+0+60) * 70 = 26.67
    expect(rows[0].weightPct).toBeCloseTo(26.667, 2)
    expect(rows[2].weightPct).toBe(0)
    expect(rows[4].weightPct).toBeCloseTo(30, 9)
    expect(rows.reduce((s, r) => s + r.weightPct, 0)).toBeCloseTo(100, 9)
  })

  it('recovers the 0-100 score each bar fills to from points ÷ weight', () => {
    expect(rows[0].score).toBe(77) // 20.5 / 26.667%
    expect(rows[4].score).toBe(60) // 18 / 30%
    expect(rows[2].score).toBe(0)  // zero weight — no division by zero
  })

  it('labels sub-dimensions for humans; semantic has none', () => {
    expect(rows[1].subDimensions).toEqual([{ key: 'years_relevant', label: 'Years relevant', score: 55 }])
    expect(rows[4].subDimensions).toEqual([])
  })

  it('gives every dimension 0% weight, without NaN, when all importances are 0', () => {
    const z = attributionRows({ ...ATTR, importances: { skills: 0, experience: 0, education: 0, achievements: 0 } })
    expect(z.slice(0, 4).map((r) => r.weightPct)).toEqual([0, 0, 0, 0])
  })
})
