import type { Env } from '../types/bindings'
import type { ProcessResumeMessage } from './messages'
import { PermanentProcessingError } from './failures'
import { getFromR2 } from '../services/storage/r2'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { hasReadableResumeText } from '../services/parsing/detector'
import { buildResumeParseMessages, validateParsedResume, type ParsedResume } from '../services/ai/prompts/parse-resume'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import { buildNeuronLimitConfig } from '../services/budget/neurons'
import { runScoringPipeline } from '../services/scoring/pipeline'
import { getCandidate, setProcessingStatus, updateCandidateParsed, updateCandidateScores } from '../db/queries/candidates'
import { replaceSkillMatches } from '../db/queries/skill-matches'
import { getJob } from '../db/queries/jobs'

/**
 * Parse then score one uploaded resume. Safe to run more than once: a finished
 * or deleted candidate is a no-op, and a candidate that already has a parsed
 * resume goes straight to scoring so a retry does not pay for parsing again.
 * Throws PermanentProcessingError for failures no retry can fix; anything else
 * propagates so the queue can retry.
 */
export async function processResume(env: Env, msg: ProcessResumeMessage): Promise<void> {
  const candidate = await getCandidate(env.DB, msg.candidateId, msg.companyId)
  if (!candidate || candidate.processing_status === 'complete' || candidate.processing_status === 'error') return

  const job = await getJob(env.DB, msg.jobId, msg.companyId)
  if (!job) throw new PermanentProcessingError('The job for this resume no longer exists')

  const resumeText = await readResumeText(env, msg)

  let parsed: ParsedResume | null = candidate.parsed_resume
  if (!parsed) {
    await setProcessingStatus(env.DB, msg.candidateId, 'parsing')
    parsed = await callWithFallback(
      env.AI, env.KV_CACHE, buildNeuronLimitConfig(env),
      buildResumeParseMessages(resumeText), validateParsedResume, 'LLM_PARSE', buildLlmConfig(env),
    ) as ParsedResume
    await updateCandidateParsed(env.DB, msg.candidateId, parsed, msg.r2Key) // → 'scoring'
  } else {
    await setProcessingStatus(env.DB, msg.candidateId, 'scoring')
  }

  const scoring = await runScoringPipeline(env, {
    candidateId: msg.candidateId,
    jobId: msg.jobId,
    companyId: msg.companyId,
    resumeText,
    jobTitle: job.title,
    jobDescription: job.description ?? null,
    requiredSkills: job.required_skills,
    niceToHaveSkills: job.nice_to_have_skills,
    minYearsExperience: job.min_years_experience,
    scoringWeights: job.scoring_dimensions,
    parsedResume: parsed,
  })

  // Before the score marks the row complete, so 'complete' implies verdicts.
  // Logged, not thrown: a score without skill matches beats no score.
  try {
    await replaceSkillMatches(env.DB, { candidateId: msg.candidateId, jobId: msg.jobId, companyId: msg.companyId }, scoring.skill_matches)
  } catch (err) {
    console.error('[queue] skill match persistence failed', { candidateId: msg.candidateId, err: err instanceof Error ? err.message : String(err) })
  }
  await updateCandidateScores(env.DB, msg.candidateId, scoring, 'workers-ai')
}

async function readResumeText(env: Env, msg: ProcessResumeMessage): Promise<string> {
  const object = await getFromR2(env, msg.r2Key)
  if (!object) throw new PermanentProcessingError('The uploaded file is missing from storage — please upload it again')
  const buffer = await object.arrayBuffer()

  let text: string
  try {
    text = msg.fileType === 'pdf' ? await extractPdfText(buffer) : await extractDocxText(buffer)
  } catch {
    throw new PermanentProcessingError('The file could not be read — it may be corrupt or password-protected')
  }
  if (!hasReadableResumeText(text)) {
    throw new PermanentProcessingError('No readable text found in the resume — scanned or image-only files are not supported')
  }
  return text
}
