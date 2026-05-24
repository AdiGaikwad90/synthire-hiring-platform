import type { OpenRouterRequest } from '../openrouter'
import type { ScoringDimensions } from '../../scoring/dimensions'
import { SUB_DIMENSION_KEYS } from '../../scoring/dimensions'

export interface LLMScores {
  dimensions: {
    skills:       { technical: number; soft: number; domain: number }
    experience:   { years_relevant: number; industry_match: number; leadership: number }
    education:    { degree_level: number; field_relevance: number; certifications: number }
    achievements: { impact: number; recognition: number }
  }
  skills_score?: number
  experience_score?: number
  education_score?: number
  achievements_score?: number
  summary: string
  strengths: string[]
  concerns: string[]
}

export function buildScoringMessages(
  resumeText: string,
  jobTitle: string,
  jobDescription: string | null,
  requiredSkills: string[],
  minYearsExperience: number,
  _dimensions: ScoringDimensions
): OpenRouterRequest['messages'] {
  const skillsList = requiredSkills.length > 0 ? requiredSkills.join(', ') : 'Not specified'
  const jobContext = jobDescription ? `Job Description: ${jobDescription}` : `Job Title: ${jobTitle}`

  return [
    { role: 'system', content: 'You are an expert technical recruiter. Score candidates against job requirements objectively. Return ONLY valid JSON matching the requested schema. Use the full 0-100 range — average candidates should land around 50-65, strong ones above 75.' },
    { role: 'user', content: `Score this candidate against the job requirements.

Job Title: ${jobTitle}
${jobContext}
Required Skills: ${skillsList}
Minimum Years Experience: ${minYearsExperience}

Resume:
${resumeText}

Return JSON with EXACTLY this structure (all scores 0-100):
{
  "dimensions": {
    "skills": { "technical": <0-100>, "soft": <0-100>, "domain": <0-100> },
    "experience": { "years_relevant": <0-100>, "industry_match": <0-100>, "leadership": <0-100> },
    "education": { "degree_level": <0-100>, "field_relevance": <0-100>, "certifications": <0-100> },
    "achievements": { "impact": <0-100>, "recognition": <0-100> }
  },
  "summary": "<one or two sentence overall assessment of fit>",
  "strengths": ["2-4 short bullet points, max 12 words each"],
  "concerns": ["2-4 short bullet points about gaps, empty array if none"]
}

Do not include any text outside the JSON object.` },
  ]
}

export function validateLLMScores(data: unknown): data is LLMScores {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (typeof d.summary !== 'string') return false
  const dims = d.dimensions
  if (!dims || typeof dims !== 'object') return false
  const dimsObj = dims as Record<string, unknown>
  for (const dimKey of Object.keys(SUB_DIMENSION_KEYS) as (keyof typeof SUB_DIMENSION_KEYS)[]) {
    const sub = dimsObj[dimKey]
    if (!sub || typeof sub !== 'object') return false
    const subObj = sub as Record<string, unknown>
    for (const key of SUB_DIMENSION_KEYS[dimKey]) {
      const v = subObj[key]
      if (typeof v !== 'number' || v < 0 || v > 100) return false
    }
  }
  if (!Array.isArray(d.strengths)) return false
  if (!Array.isArray(d.concerns)) return false
  return true
}
