/**
 * The score-breakdown snapshot persisted in candidates.score_attribution.
 *
 * Snapshotted at score time rather than recomputed on read: if a recruiter
 * edits the job's weights afterwards, recomputing would produce contributions
 * that no longer sum to the overall_score stored next to them.
 */

import type { AggregateResult, DimensionRollup, ScoreConfig } from './aggregator'
import type { LLMScores } from '../ai/prompts/score-candidate'
import type { DimensionId } from './dimensions'
import { DIMENSION_IDS, SUB_DIMENSION_KEYS } from './dimensions'

export interface ScoreAttribution {
  version: 1
  contributions: DimensionRollup & { semantic: number }
  importances: DimensionRollup
  llmWeight: number
  semanticWeight: number
  subDimensions: Record<DimensionId, Record<string, number>>
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function buildAttribution(agg: AggregateResult, llm: LLMScores, config: ScoreConfig): ScoreAttribution {
  const subDimensions = {} as ScoreAttribution['subDimensions']
  for (const id of DIMENSION_IDS) {
    const raw = (llm.dimensions?.[id] ?? {}) as Record<string, unknown>
    subDimensions[id] = {}
    for (const key of SUB_DIMENSION_KEYS[id]) {
      const v = Number(raw[key])
      if (raw[key] !== undefined && raw[key] !== null && Number.isFinite(v)) subDimensions[id][key] = v
    }
  }
  const c = agg.contributions
  return {
    version: 1,
    contributions: {
      skills: round2(c.skills),
      experience: round2(c.experience),
      education: round2(c.education),
      achievements: round2(c.achievements),
      semantic: round2(c.semantic),
    },
    importances: { ...agg.importances },
    llmWeight: config.llmWeight,
    semanticWeight: config.semanticWeight,
    subDimensions,
  }
}
