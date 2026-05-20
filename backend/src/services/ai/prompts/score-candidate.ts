import type { OpenRouterRequest } from '../openrouter'

export interface LLMScores {
  skills_score: number       // 0-100
  experience_score: number   // 0-100
  education_score: number    // 0-100
  achievements_score: number // 0-100
  summary: string            // 1-2 sentence AI analysis
}

export function buildScoringMessages(
  resumeText: string,
  jobTitle: string,
  jobDescription: string | null,
  requiredSkills: string[],
  minYearsExperience: number
): OpenRouterRequest['messages'] {
  const skillsList = requiredSkills.length > 0
    ? requiredSkills.join(', ')
    : 'Not specified'

  const jobContext = jobDescription
    ? `Job Description: ${jobDescription}`
    : `Job Title: ${jobTitle}`

  return [
    {
      role: 'system',
      content: 'You are an expert technical recruiter. Score candidates against job requirements objectively. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Score this candidate against the job requirements and return a JSON object:

Job Title: ${jobTitle}
${jobContext}
Required Skills: ${skillsList}
Minimum Years Experience: ${minYearsExperience}

Resume:
${resumeText}

Return JSON with this exact structure:
{
  "skills_score": <number 0-100, how well candidate's skills match required skills>,
  "experience_score": <number 0-100, based on years and relevance of experience>,
  "education_score": <number 0-100, based on educational background relevance>,
  "achievements_score": <number 0-100, based on notable achievements and impact>,
  "summary": "<1-2 sentence analysis of the candidate's fit for this role>"
}`,
    },
  ]
}

export function validateLLMScores(data: unknown): data is LLMScores {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>

  const isScore = (v: unknown): boolean =>
    typeof v === 'number' && v >= 0 && v <= 100

  if (!isScore(d.skills_score)) return false
  if (!isScore(d.experience_score)) return false
  if (!isScore(d.education_score)) return false
  if (!isScore(d.achievements_score)) return false
  if (typeof d.summary !== 'string') return false

  return true
}
