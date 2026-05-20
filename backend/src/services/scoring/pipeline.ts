import type { Env } from '../../types/bindings'
import type { ParsedResume } from '../ai/prompts/parse-resume'
import type { ScoringWeights } from './aggregator'
import { generateEmbedding } from '../embeddings/generator'
import { upsertEmbedding } from '../embeddings/vectorize'
import { cosineSimilarity } from '../embeddings/similarity'
import { callWithFallback } from '../ai/fallback'
import { buildScoringMessages, validateLLMScores, LLMScores } from '../ai/prompts/score-candidate'
import { aggregateScore } from './aggregator'

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
  scoringWeights: ScoringWeights
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

  // Step 1: Generate embedding for resume text
  const resumeEmbedding = await generateEmbedding(env.AI, resumeText)

  // Step 2: Generate embedding for job description (use jobTitle if no description)
  const jobText = jobDescription ?? jobTitle
  const jobEmbedding = await generateEmbedding(env.AI, jobText)

  // Step 3: Upsert candidate embedding to Vectorize
  await upsertEmbedding(env.VECTORIZE, candidateId, resumeEmbedding, {
    candidateId,
    jobId,
    companyId,
  })

  // Step 4: Compute cosine similarity → semanticScore (0-100)
  const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding)
  const semanticScore = Math.round(similarity * 100)

  // Step 5: LLM scoring
  const messages = buildScoringMessages(
    resumeText,
    jobTitle,
    jobDescription,
    requiredSkills,
    minYearsExperience
  )

  const llmResult = await callWithFallback(
    env.OPENROUTER_API_KEY,
    messages,
    validateLLMScores
  ) as LLMScores

  // Step 6: Aggregate final score
  const overallScore = aggregateScore(llmResult, semanticScore, scoringWeights)

  return {
    overall_score: overallScore,
    semantic_score: semanticScore,
    skills_score: Math.round(llmResult.skills_score),
    experience_score: Math.round(llmResult.experience_score),
    education_score: Math.round(llmResult.education_score),
    achievements_score: Math.round(llmResult.achievements_score),
    ai_analysis: llmResult.summary,
  }
}
