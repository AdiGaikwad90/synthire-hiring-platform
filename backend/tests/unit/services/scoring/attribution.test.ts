import { describe, it, expect } from 'vitest'
import { buildAttribution } from '../../../../src/services/scoring/attribution'
import { aggregateScore } from '../../../../src/services/scoring/aggregator'
import { DEFAULT_SCORING_DIMENSIONS } from '../../../../src/services/scoring/dimensions'
import type { LLMScores } from '../../../../src/services/ai/prompts/score-candidate'

const CFG = { llmWeight: 0.7, semanticWeight: 0.3 }
const llm: LLMScores = {
  dimensions: {
    skills: { technical: 83, soft: 71, domain: 66 },
    experience: { years_relevant: 59, industry_match: 47, leadership: 38 },
    education: { degree_level: 77, field_relevance: 81, certifications: 12 },
    achievements: { impact: 64, recognition: 29 },
  },
  summary: 's', strengths: [], concerns: [],
}

describe('buildAttribution — happy path', () => {
  it('rounds contributions to 2dp while keeping their sum within rounding of overall', () => {
    const agg = aggregateScore(llm, 58, DEFAULT_SCORING_DIMENSIONS, CFG)
    const a = buildAttribution(agg, llm, CFG)
    const sum = Object.values(a.contributions).reduce((s, n) => s + n, 0)
    for (const v of Object.values(a.contributions)) expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9)
    // ≤0.5 from rounding overall to an int, plus ≤0.025 from five 2dp roundings
    expect(Math.abs(sum - agg.overall)).toBeLessThanOrEqual(0.53)
    expect(a).toMatchObject({ version: 1, llmWeight: 0.7, semanticWeight: 0.3, importances: agg.importances })
  })

  it('records the sub-dimension scores the model returned', () => {
    const a = buildAttribution(aggregateScore(llm, 58, DEFAULT_SCORING_DIMENSIONS, CFG), llm, CFG)
    expect(a.subDimensions.education).toEqual({ degree_level: 77, field_relevance: 81, certifications: 12 })
  })

  it('survives a JSON round trip unchanged', () => {
    const a = buildAttribution(aggregateScore(llm, 58, DEFAULT_SCORING_DIMENSIONS, CFG), llm, CFG)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })
})

describe('buildAttribution — invalid / empty', () => {
  it('drops non-finite sub-scores and yields empty objects on the legacy flat shape', () => {
    const legacy = { summary: 's', strengths: [], concerns: [], skills_score: 70 } as unknown as LLMScores
    const a = buildAttribution(aggregateScore(legacy, 0, DEFAULT_SCORING_DIMENSIONS, CFG), legacy, CFG)
    expect(a.subDimensions).toEqual({ skills: {}, experience: {}, education: {}, achievements: {} })
    expect(a.contributions.skills).toBeGreaterThan(0)
  })
})

// Boundaries are covered by the aggregator's contribution tests; error contract N/A (never throws).
