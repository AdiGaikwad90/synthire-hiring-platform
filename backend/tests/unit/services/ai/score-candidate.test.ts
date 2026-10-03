import { describe, it, expect } from 'vitest'
import { buildScoringMessages, validateLLMScores } from '../../../../src/services/ai/prompts/score-candidate'
import { VERDICTS, type SkillToAdjudicate } from '../../../../src/services/scoring/skill-matches'

const SKILLS: SkillToAdjudicate[] = [
  { skill: 'Kubernetes', requirement: 'required' },
  { skill: 'Rust', requirement: 'nice_to_have' },
]

const userPrompt = (skills: SkillToAdjudicate[] = SKILLS) =>
  buildScoringMessages('resume text', 'Platform Engineer', 'Run our infra', skills, 3)
    .map((m) => m.content)
    .join('\n')

const validScores = (extra: Record<string, unknown> = {}) => ({
  dimensions: {
    skills: { technical: 80, soft: 70, domain: 60 },
    experience: { years_relevant: 50, industry_match: 50, leadership: 50 },
    education: { degree_level: 50, field_relevance: 50, certifications: 50 },
    achievements: { impact: 50, recognition: 50 },
  },
  summary: 'ok',
  strengths: [],
  concerns: [],
  ...extra,
})

describe('buildScoringMessages — happy path', () => {
  it('lists every skill with its requirement for adjudication', () => {
    const p = userPrompt()
    expect(p).toContain('- Kubernetes [required]')
    expect(p).toContain('- Rust [nice_to_have]')
    expect(p).toContain('"skill_matches"')
  })

  it('defines all four verdicts so the evidenced/claimed line is explicit', () => {
    const p = userPrompt()
    for (const v of VERDICTS) expect(p, v).toContain(`"${v}"`)
  })
})

describe('buildScoringMessages — positive variants', () => {
  it('still states the required skills for dimension scoring', () => {
    expect(userPrompt()).toContain('Required Skills: Kubernetes')
  })

  it('handles a job with only nice-to-have skills', () => {
    const p = userPrompt([{ skill: 'Rust', requirement: 'nice_to_have' }])
    expect(p).toContain('Required Skills: Not specified')
    expect(p).toContain('- Rust [nice_to_have]')
  })
})

describe('buildScoringMessages — never leaks weighting', () => {
  // Telling the model a dimension matters more inflates that score, and the
  // rollup then weights the inflated score again. See the spec, "Why the model
  // is not told the weights".
  it('mentions neither importance nor weight', () => {
    const p = userPrompt().toLowerCase()
    expect(p).not.toContain('importance')
    expect(p).not.toContain('weight')
  })
})

describe('buildScoringMessages — empty', () => {
  it('omits the skill_matches request entirely when the job has no skills', () => {
    const p = userPrompt([])
    expect(p).not.toContain('skill_matches')
    expect(p).toContain('Required Skills: Not specified')
  })
})

// Invalid input / error contract: N/A — the builder takes typed, pre-normalised
// input (selectSkillsForAdjudication owns sanitising) and never throws.

describe('validateLLMScores — skill_matches is optional', () => {
  it('accepts a response with no skill_matches', () => {
    expect(validateLLMScores(validScores())).toBe(true)
  })

  it.each([
    ['a string', 'Kubernetes: yes'],
    ['an array of junk', [1, null, 'x']],
    ['null', null],
  ])('still accepts the scores when skill_matches is %s — normalisation handles it later', (_n, sm) => {
    expect(validateLLMScores(validScores({ skill_matches: sm }))).toBe(true)
  })

  it('still rejects a response with a broken dimension score', () => {
    const bad = validScores()
    ;(bad.dimensions.skills as Record<string, unknown>).technical = 'high'
    expect(validateLLMScores(bad)).toBe(false)
  })
})
