import { describe, it, expect } from 'vitest'
import {
  aggregateScore,
  buildScoreConfig,
} from '../../../../src/services/scoring/aggregator'
import { DEFAULT_SCORING_DIMENSIONS } from '../../../../src/services/scoring/dimensions'
import type { ScoringDimensions } from '../../../../src/services/scoring/dimensions'
import type { LLMScores } from '../../../../src/services/ai/prompts/score-candidate'

/**
 * Scoring is the highest-risk pure logic in the codebase: a wrong number does
 * not crash, it silently misranks every candidate. These tests pin the maths,
 * not the implementation.
 */

const scores = (over: Partial<LLMScores['dimensions']> = {}): LLMScores => ({
  dimensions: {
    skills: { technical: 80, soft: 80, domain: 80 },
    experience: { years_relevant: 60, industry_match: 60, leadership: 60 },
    education: { degree_level: 40, field_relevance: 40, certifications: 40 },
    achievements: { impact: 20, recognition: 20 },
    ...over,
  },
  summary: 'x',
  strengths: [],
  concerns: [],
})

/** All dimensions equally important, all sub-dimensions equally important. */
const flatDims = (importance = 50, sub = 50): ScoringDimensions => ({
  skills: { importance, sub_dimensions: { technical: sub, soft: sub, domain: sub } },
  experience: { importance, sub_dimensions: { years_relevant: sub, industry_match: sub, leadership: sub } },
  education: { importance, sub_dimensions: { degree_level: sub, field_relevance: sub, certifications: sub } },
  achievements: { importance, sub_dimensions: { impact: sub, recognition: sub } },
})

const ALL_LLM = { llmWeight: 1, semanticWeight: 0 }

describe('buildScoreConfig', () => {
  it('defaults to the documented 70/30 split', () => {
    expect(buildScoreConfig({})).toEqual({ llmWeight: 0.7, semanticWeight: 0.3 })
  })

  it('reads overrides from env', () => {
    expect(buildScoreConfig({ SCORE_LLM_WEIGHT: '0.9', SCORE_SEMANTIC_WEIGHT: '0.1' }))
      .toEqual({ llmWeight: 0.9, semanticWeight: 0.1 })
  })
})

describe('aggregateScore — happy path', () => {
  it('rolls sub-dimensions up, then dimensions up, then blends with semantic', () => {
    // Every dimension flat: skills 80, experience 60, education 40, achievements 20.
    // Equal importance -> component = (80+60+40+20)/4 = 50.
    const r = aggregateScore(scores(), 100, flatDims(), { llmWeight: 0.5, semanticWeight: 0.5 })
    expect(r.componentScore).toBe(50)
    expect(r.dimensionScores).toEqual({ skills: 80, experience: 60, education: 40, achievements: 20 })
    expect(r.overall).toBe(75) // 50*0.5 + 100*0.5
  })

  it('weights dimensions by relative importance, with no sum-to-100 requirement', () => {
    // skills importance 100, everything else 0 -> component is skills alone.
    const dims = flatDims()
    dims.skills.importance = 100
    dims.experience.importance = 0
    dims.education.importance = 0
    dims.achievements.importance = 0
    expect(aggregateScore(scores(), 0, dims, ALL_LLM).componentScore).toBe(80)
  })

  it('gives the same result for importances 1/1/1/1 as for 90/90/90/90', () => {
    const a = aggregateScore(scores(), 0, flatDims(1), ALL_LLM)
    const b = aggregateScore(scores(), 0, flatDims(90), ALL_LLM)
    expect(a.componentScore).toBe(b.componentScore)
  })

  it('weights sub-dimensions within a dimension', () => {
    const dims = flatDims()
    // Only `technical` counts for skills.
    dims.skills.sub_dimensions = { technical: 100, soft: 0, domain: 0 }
    dims.skills.importance = 100
    dims.experience.importance = 0
    dims.education.importance = 0
    dims.achievements.importance = 0
    const s = scores({ skills: { technical: 90, soft: 0, domain: 0 } })
    expect(aggregateScore(s, 0, dims, ALL_LLM).componentScore).toBe(90)
  })
})

describe('aggregateScore — boundaries', () => {
  it('clamps into 0-100 and returns integers', () => {
    const r = aggregateScore(scores(), 100, flatDims(), { llmWeight: 5, semanticWeight: 5 })
    expect(r.overall).toBe(100)
    expect(Number.isInteger(r.overall)).toBe(true)
  })

  it('floors at 0 rather than going negative', () => {
    const zero = scores({
      skills: { technical: 0, soft: 0, domain: 0 },
      experience: { years_relevant: 0, industry_match: 0, leadership: 0 },
      education: { degree_level: 0, field_relevance: 0, certifications: 0 },
      achievements: { impact: 0, recognition: 0 },
    })
    const r = aggregateScore(zero, 0, flatDims(), { llmWeight: -1, semanticWeight: -1 })
    expect(r.overall).toBe(0)
  })

  it('handles a perfect candidate', () => {
    const perfect = scores({
      skills: { technical: 100, soft: 100, domain: 100 },
      experience: { years_relevant: 100, industry_match: 100, leadership: 100 },
      education: { degree_level: 100, field_relevance: 100, certifications: 100 },
      achievements: { impact: 100, recognition: 100 },
    })
    expect(aggregateScore(perfect, 100, flatDims()).overall).toBe(100)
  })
})

describe('aggregateScore — zero and empty', () => {
  it('returns 0 rather than NaN when every importance is 0', () => {
    const r = aggregateScore(scores(), 0, flatDims(0, 0), ALL_LLM)
    expect(Number.isNaN(r.overall)).toBe(false)
    expect(r.overall).toBe(0)
  })

  it('ignores sub-dimensions weighted 0 instead of dragging the average down', () => {
    const dims = flatDims()
    dims.skills.sub_dimensions = { technical: 100, soft: 0, domain: 0 }
    dims.skills.importance = 100
    dims.experience.importance = 0
    dims.education.importance = 0
    dims.achievements.importance = 0
    // soft/domain are 0-scored but 0-weighted, so skills must be technical's 80.
    const s = scores({ skills: { technical: 80, soft: 0, domain: 0 } })
    expect(aggregateScore(s, 0, dims, ALL_LLM).dimensionScores.skills).toBe(80)
  })
})

describe('aggregateScore — invalid LLM output', () => {
  // The LLM is an untrusted input. These are the shapes it actually produces
  // when it ignores the schema.
  it('falls back to the legacy flat {id}_score when sub-dimensions are missing', () => {
    const legacy = {
      dimensions: {},
      skills_score: 70,
      experience_score: 50,
      education_score: 30,
      achievements_score: 10,
      summary: 'x',
      strengths: [],
      concerns: [],
    } as unknown as LLMScores
    const r = aggregateScore(legacy, 0, flatDims(), ALL_LLM)
    expect(r.dimensionScores).toEqual({ skills: 70, experience: 50, education: 30, achievements: 10 })
    expect(r.componentScore).toBe(40) // (70+50+30+10)/4
  })

  it('treats a dimension with neither sub-scores nor a legacy score as 0, not NaN', () => {
    const empty = { dimensions: {}, summary: 'x', strengths: [], concerns: [] } as unknown as LLMScores
    const r = aggregateScore(empty, 0, flatDims(), ALL_LLM)
    expect(r.overall).toBe(0)
    expect(Number.isNaN(r.componentScore)).toBe(false)
  })

  it('skips non-numeric sub-scores rather than poisoning the average', () => {
    const dirty = scores({
      skills: { technical: 90, soft: 'high' as unknown as number, domain: NaN },
    })
    // Only `technical` is finite, so skills should be exactly 90.
    expect(aggregateScore(dirty, 0, flatDims(), ALL_LLM).dimensionScores.skills).toBe(90)
  })

  it('falls back to default importance when a dimension is absent from config', () => {
    const partial = { skills: DEFAULT_SCORING_DIMENSIONS.skills } as unknown as ScoringDimensions
    const r = aggregateScore(scores(), 0, partial, ALL_LLM)
    expect(Number.isNaN(r.overall)).toBe(false)
    expect(r.overall).toBeGreaterThan(0)
  })
})

describe('aggregateScore — semantic blending', () => {
  it('semanticWeight 0 makes the semantic score irrelevant', () => {
    const a = aggregateScore(scores(), 0, flatDims(), ALL_LLM)
    const b = aggregateScore(scores(), 100, flatDims(), ALL_LLM)
    expect(a.overall).toBe(b.overall)
  })

  it('llmWeight 0 makes the score purely semantic', () => {
    const r = aggregateScore(scores(), 42, flatDims(), { llmWeight: 0, semanticWeight: 1 })
    expect(r.overall).toBe(42)
  })

  it('componentScore is reported before semantic blending', () => {
    const r = aggregateScore(scores(), 100, flatDims(), { llmWeight: 0.7, semanticWeight: 0.3 })
    expect(r.componentScore).toBe(50)
    expect(r.overall).toBe(65) // 50*0.7 + 100*0.3
  })
})
