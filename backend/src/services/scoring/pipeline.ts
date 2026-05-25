import type { Env } from '../../types/bindings'
import type { ParsedResume } from '../ai/prompts/parse-resume'
import type { ScoringDimensions } from '../scoring/dimensions'
import { generateEmbedding } from '../embeddings/generator'
import { upsertEmbedding } from '../embeddings/vectorize'
import { cosineSimilarity } from '../embeddings/similarity'
import { callWithFallback, buildLlmConfig } from '../ai/fallback'
import { buildScoringMessages, validateLLMScores, type LLMScores } from '../ai/prompts/score-candidate'
import { aggregateScore, buildScoreConfig } from './aggregator'
import { checkNeuronBudget, deductNeurons } from '../budget/neurons'

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

  const dailyLimit = parseInt(env.NEURONS_DAILY_LIMIT ?? '10000', 10)

  // Step 1: Generate embedding for resume text
  await checkNeuronBudget(env.KV_CACHE, 'EMBEDDING', dailyLimit)
  const resumeEmbedding = await generateEmbedding(env.AI, resumeText)
  if (resumeEmbedding) await deductNeurons(env.KV_CACHE, 'EMBEDDING')

  // Step 2: Generate embedding for job description (use jobTitle if no description)
  const jobText = jobDescription ?? jobTitle
  await checkNeuronBudget(env.KV_CACHE, 'EMBEDDING', dailyLimit)
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
    } catch {
      // Vectorize not available locally — continue without semantic scoring
    }
  }

  // Step 4: Compute cosine similarity → semanticScore (0-100)
  const semanticScore = (resumeEmbedding && jobEmbedding)
    ? Math.round(cosineSimilarity(resumeEmbedding, jobEmbedding) * 100)
    : 0

  // Step 5: LLM scoring
  const messages = buildScoringMessages(
    resumeText,
    jobTitle,
    jobDescription,
    requiredSkills,
    minYearsExperience,
    scoringWeights
  )

  const config = buildLlmConfig(env)
  const llmResult = await callWithFallback(
    env.AI,
    env.KV_CACHE,
    dailyLimit,
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
  }
}
