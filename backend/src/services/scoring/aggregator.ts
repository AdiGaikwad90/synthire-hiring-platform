import type { LLMScores } from '../ai/prompts/score-candidate'

export interface ScoringWeights {
  skills: number
  experience: number
  education: number
  achievements: number
}

export function aggregateScore(
  llmScores: LLMScores,
  semanticScore: number,  // 0-100 (cosine similarity * 100)
  weights: ScoringWeights
): number {
  const componentScore =
    (llmScores.skills_score * weights.skills +
      llmScores.experience_score * weights.experience +
      llmScores.education_score * weights.education +
      llmScores.achievements_score * weights.achievements) /
    100

  const overall = componentScore * 0.7 + semanticScore * 0.3

  return Math.max(0, Math.min(100, Math.round(overall)))
}
