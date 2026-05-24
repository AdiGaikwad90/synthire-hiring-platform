/**
 * Scoring model v2 — shared types and defaults.
 *
 * Each top-level dimension has:
 *   - importance: 0-100 (relative weight; backend normalizes — no "sum to 100" rule)
 *   - sub_dimensions: 0-100 each (used by LLM to score nuances, then averaged)
 *
 * Final per-dimension score = weighted-average(sub_dimension_scores, sub_dimension_importance)
 * Final component score     = weighted-average(dimension_scores, dimension_importance)
 * Final overall             = component * SCORE_LLM_WEIGHT + semantic * SCORE_SEMANTIC_WEIGHT
 */

export type DimensionId = 'skills' | 'experience' | 'education' | 'achievements'

export interface DimensionConfig {
  importance: number
  sub_dimensions: Record<string, number>
}

export type ScoringDimensions = Record<DimensionId, DimensionConfig>

export const DEFAULT_SCORING_DIMENSIONS: ScoringDimensions = {
  skills: {
    importance: 80,
    sub_dimensions: { technical: 90, soft: 60, domain: 70 },
  },
  experience: {
    importance: 70,
    sub_dimensions: { years_relevant: 80, industry_match: 60, leadership: 50 },
  },
  education: {
    importance: 50,
    sub_dimensions: { degree_level: 60, field_relevance: 70, certifications: 40 },
  },
  achievements: {
    importance: 60,
    sub_dimensions: { impact: 80, recognition: 50 },
  },
}

// Canonical sub-dimension keys per dimension (used by LLM prompt + UI)
export const SUB_DIMENSION_KEYS: Record<DimensionId, string[]> = {
  skills: ['technical', 'soft', 'domain'],
  experience: ['years_relevant', 'industry_match', 'leadership'],
  education: ['degree_level', 'field_relevance', 'certifications'],
  achievements: ['impact', 'recognition'],
}

export const DIMENSION_IDS: DimensionId[] = ['skills', 'experience', 'education', 'achievements']

/**
 * Accept either v2 shape or legacy v1 shape (sum-to-100 four-key object)
 * and always return a v2 shape with safe defaults.
 */
export function normalizeScoringDimensions(raw: unknown): ScoringDimensions {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCORING_DIMENSIONS

  const obj = raw as Record<string, unknown>

  // v2 detection — any dimension has `importance` field
  const looksV2 = DIMENSION_IDS.some((id) => {
    const dim = obj[id]
    return dim && typeof dim === 'object' && 'importance' in (dim as Record<string, unknown>)
  })

  if (looksV2) {
    const out: ScoringDimensions = { ...DEFAULT_SCORING_DIMENSIONS }
    for (const id of DIMENSION_IDS) {
      const dim = obj[id] as Record<string, unknown> | undefined
      if (!dim) continue
      const importance = clamp(Number(dim.importance ?? DEFAULT_SCORING_DIMENSIONS[id].importance))
      const incomingSub = (dim.sub_dimensions ?? {}) as Record<string, unknown>
      const sub: Record<string, number> = { ...DEFAULT_SCORING_DIMENSIONS[id].sub_dimensions }
      for (const key of SUB_DIMENSION_KEYS[id]) {
        if (key in incomingSub) sub[key] = clamp(Number(incomingSub[key]))
      }
      out[id] = { importance, sub_dimensions: sub }
    }
    return out
  }

  // v1 detection — top-level numeric values that sum near 100
  if (DIMENSION_IDS.some((id) => typeof obj[id] === 'number')) {
    const out: ScoringDimensions = { ...DEFAULT_SCORING_DIMENSIONS }
    for (const id of DIMENSION_IDS) {
      const v1Weight = Number(obj[id])
      // map v1 weight (0-100, normalized so all sum to 100) to v2 importance
      // by treating it as a relative priority — clamp to 0-100
      out[id] = {
        importance: clamp(Number.isFinite(v1Weight) ? v1Weight : DEFAULT_SCORING_DIMENSIONS[id].importance),
        sub_dimensions: { ...DEFAULT_SCORING_DIMENSIONS[id].sub_dimensions },
      }
    }
    return out
  }

  return DEFAULT_SCORING_DIMENSIONS
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(min, Math.min(max, n))
}
