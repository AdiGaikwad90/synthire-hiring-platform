/**
 * Scoring aggregator — v2.
 *
 * Math:
 *   dimension_score   = weighted_avg(sub_dimension_scores, sub_dimension_importance)
 *   component_score   = weighted_avg(dimension_scores, dimension_importance)
 *   overall           = component_score * SCORE_LLM_WEIGHT + semantic * SCORE_SEMANTIC_WEIGHT
 *
 * No "sum to 100" constraint anywhere — the weighted average normalizes by
 * total importance, so dimensions can be set independently 0-100.
 */

import type { LLMScores } from '../ai/prompts/score-candidate'
import type { ScoringDimensions, DimensionId } from './dimensions'
import { DIMENSION_IDS, SUB_DIMENSION_KEYS, DEFAULT_SCORING_DIMENSIONS } from './dimensions'

export interface ScoreConfig {
  llmWeight: number      // fraction of final score from LLM dimensions (e.g. 0.70)
  semanticWeight: number // fraction from cosine similarity (e.g. 0.30)
}

const DEFAULT_SCORE_CONFIG: ScoreConfig = { llmWeight: 0.70, semanticWeight: 0.30 }

export function buildScoreConfig(env: { SCORE_LLM_WEIGHT?: string; SCORE_SEMANTIC_WEIGHT?: string }): ScoreConfig {
  return {
    llmWeight: parseFloat(env.SCORE_LLM_WEIGHT ?? '0.70'),
    semanticWeight: parseFloat(env.SCORE_SEMANTIC_WEIGHT ?? '0.30'),
  }
}

export interface DimensionRollup {
  skills: number
  experience: number
  education: number
  achievements: number
}

export interface AggregateResult {
  overall: number
  componentScore: number
  dimensionScores: DimensionRollup
}

/**
 * Aggregate LLM sub-dimension scores into final overall score.
 * Returns both the overall and the rolled-up per-dimension scores
 * (needed because we persist top-level dimension scores in the candidates table).
 */
export function aggregateScore(
  llmScores: LLMScores,
  semanticScore: number,
  dimensions: ScoringDimensions,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG
): AggregateResult {
  // Roll up each top-level dimension from its sub-dimension scores
  const dimensionScores: DimensionRollup = {
    skills: rollupDimension('skills', llmScores, dimensions),
    experience: rollupDimension('experience', llmScores, dimensions),
    education: rollupDimension('education', llmScores, dimensions),
    achievements: rollupDimension('achievements', llmScores, dimensions),
  }

  // Combine dimension scores using their importance weights
  const componentScore = weightedAvg(
    DIMENSION_IDS.map((id) => ({
      score: dimensionScores[id],
      weight: dimensions[id]?.importance ?? DEFAULT_SCORING_DIMENSIONS[id].importance,
    }))
  )

  const overall = componentScore * config.llmWeight + semanticScore * config.semanticWeight

  return {
    overall: clampInt(overall),
    componentScore: clampInt(componentScore),
    dimensionScores: {
      skills: clampInt(dimensionScores.skills),
      experience: clampInt(dimensionScores.experience),
      education: clampInt(dimensionScores.education),
      achievements: clampInt(dimensionScores.achievements),
    },
  }
}

function rollupDimension(
  id: DimensionId,
  llmScores: LLMScores,
  dimensions: ScoringDimensions
): number {
  const subImportance = dimensions[id]?.sub_dimensions ?? DEFAULT_SCORING_DIMENSIONS[id].sub_dimensions
  const subScores = (llmScores.dimensions?.[id] ?? {}) as Record<string, unknown>
  const pairs: { score: number; weight: number }[] = []
  for (const key of SUB_DIMENSION_KEYS[id]) {
    const weight = subImportance[key] ?? 0
    const score = Number(subScores[key])
    if (Number.isFinite(score)) {
      pairs.push({ score, weight })
    }
  }
  // Fallback: if LLM did not return sub-dimension scores, use the legacy flat
  // dimension score (e.g. skills_score). This keeps the pipeline resilient if
  // the LLM ignores the v2 structure on a particular call.
  if (pairs.length === 0) {
    const legacy = (llmScores as unknown as Record<string, number>)[`${id}_score`]
    return Number.isFinite(legacy) ? Number(legacy) : 0
  }
  return weightedAvg(pairs)
}

function weightedAvg(pairs: { score: number; weight: number }[]): number {
  let weighted = 0
  let totalWeight = 0
  for (const { score, weight } of pairs) {
    if (weight > 0) {
      weighted += score * weight
      totalWeight += weight
    }
  }
  if (totalWeight === 0) return 0
  return weighted / totalWeight
}

function clampInt(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
