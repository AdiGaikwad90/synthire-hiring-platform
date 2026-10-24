import type { Env } from '../../types/bindings'
import type { ParsedResume } from '../ai/prompts/parse-resume'
import type { ScoringDimensions } from '../scoring/dimensions'
import { generateEmbedding } from '../embeddings/generator'
import { upsertEmbedding } from '../embeddings/vectorize'
import { cosineSimilarity } from '../embeddings/similarity'
import { callWithFallback, buildScoringLlmConfig } from '../ai/fallback'
import { buildScoringMessages, validateLLMScores, type LLMScores } from '../ai/prompts/score-candidate'
import { aggregateScore, buildScoreConfig } from './aggregator'
import { checkNeuronBudget, deductNeurons, buildNeuronLimitConfig } from '../budget/neurons'
import { selectSkillsForAdjudication, normalizeSkillMatches, type SkillMatch } from './skill-matches'
import { buildAttribution } from './attribution'

export interface ScoringInput {
  candidateId: string
  jobId: string
  companyId: string
  resumeText: string
  jobTitle: string
  jobDescription: string | null
  requiredSkills: string[]
  niceToHaveSkills: string[]
  minYearsExperience: number
  scoringWeights: ScoringDimensions
  parsedResume: ParsedResume
}

export interface ScoringResult {
  overall_score: number
  semantic_score: number
  skills_score: number
  experience_score: number
  education_score: number
  achievements_score: number
  ai_analysis: string
  /** JSON of ScoreAttribution — persisted as-is to candidates.score_attribution. */
  score_attribution: string
  /** [] when the model gave nothing usable; the UI shows "not available". */
  skill_matches: SkillMatch[]
}

export async function runScoringPipeline(
  env: Env,
  input: ScoringInput
): Promise<ScoringResult> {
  const {
    candidateId,
    jobId,
    companyId,
    resumeText,
    jobTitle,
    jobDescription,
    requiredSkills,
    minYearsExperience,
    scoringWeights,
  } = input

  const neuronConfig = buildNeuronLimitConfig(env)

  // Step 1: Generate embedding for resume text
  await checkNeuronBudget(env.KV_CACHE, 'EMBEDDING', neuronConfig)
  const resumeEmbedding = await generateEmbedding(env.AI, resumeText)
  if (resumeEmbedding) await deductNeurons(env.KV_CACHE, 'EMBEDDING')

  // Step 2: Generate embedding for job description (use jobTitle if no description)
  const jobText = jobDescription ?? jobTitle
  await checkNeuronBudget(env.KV_CACHE, 'EMBEDDING', neuronConfig)
  const jobEmbedding = await generateEmbedding(env.AI, jobText)
  if (jobEmbedding) await deductNeurons(env.KV_CACHE, 'EMBEDDING')

  // Step 3: Upsert candidate embedding to Vectorize (skip if text was too short; non-fatal in local dev)
  if (resumeEmbedding) {
    try {
      await upsertEmbedding(env.VECTORIZE, candidateId, resumeEmbedding, {
        candidateId,
        jobId,
        companyId,
      })
    } catch (err) {
      // Non-fatal: the semantic score is computed in memory, so a failed
      // upsert only loses future similarity search for this candidate.
      console.error('[scoring] vectorize upsert failed', { candidateId, err: err instanceof Error ? err.message : String(err) })
    }
  }

  // Step 4: Compute cosine similarity → semanticScore (0-100)
  const semanticScore = (resumeEmbedding && jobEmbedding)
    ? Math.max(0, Math.round(cosineSimilarity(resumeEmbedding, jobEmbedding) * 100))
    : 0

  // Step 5: LLM scoring (dimension scores + per-skill verdicts in one call)
  const skillsToAdjudicate = selectSkillsForAdjudication(requiredSkills, input.niceToHaveSkills)
  const messages = buildScoringMessages(
    resumeText,
    jobTitle,
    jobDescription,
    skillsToAdjudicate,
    minYearsExperience,
  )

  const config = buildScoringLlmConfig(env)
  const llmResult = await callWithFallback(
    env.AI,
    env.KV_CACHE,
    neuronConfig,
    messages,
    validateLLMScores,
    'LLM_SCORE',
    config
  ) as LLMScores

  // Step 6: Aggregate final score using dimension rollup
  const scoreConfig = buildScoreConfig(env)
  const aggregated = aggregateScore(llmResult, semanticScore, scoringWeights, scoreConfig)

  // Store strengths/concerns alongside summary as JSON
  const ai_analysis = JSON.stringify({
    summary: llmResult.summary,
    strengths: llmResult.strengths ?? [],
    concerns: llmResult.concerns ?? [],
  })

  return {
    overall_score: aggregated.overall,
    semantic_score: semanticScore,
    skills_score: aggregated.dimensionScores.skills,
    experience_score: aggregated.dimensionScores.experience,
    education_score: aggregated.dimensionScores.education,
    achievements_score: aggregated.dimensionScores.achievements,
    ai_analysis,
    score_attribution: JSON.stringify(buildAttribution(aggregated, llmResult, scoreConfig)),
    skill_matches: normalizeSkillMatches(llmResult.skill_matches, skillsToAdjudicate),
  }
}
