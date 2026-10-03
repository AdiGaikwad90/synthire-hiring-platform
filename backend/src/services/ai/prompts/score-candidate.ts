import type { WorkersAIRequest } from '../workers-ai'
import { SUB_DIMENSION_KEYS } from '../../scoring/dimensions'
import type { SkillToAdjudicate } from '../../scoring/skill-matches'

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
  /**
   * Optional and untyped on purpose: validateLLMScores must not reject a
   * response that gets the scores right but this wrong. normalizeSkillMatches()
   * owns turning it into rows.
   */
  skill_matches?: unknown
}

const VERDICT_GUIDE = `Verdicts — judge from the work described, the way a senior recruiter reads a resume, not by keyword presence:
- "evidenced": described work (a role, project or result) uses THIS skill — named, or an unambiguous alias such as "React.js" for React — not merely listed
- "claimed": appears only in a skills list or summary, with no supporting experience
- "transferable": not present, but a related technology the candidate clearly demonstrated reasonably credits it; name that technology in "via"
- "missing": no support anywhere in the resume — before choosing it, look for a related technology the candidate clearly demonstrated; if there is one, the verdict is "transferable"
A related but different technology is "transferable", never "evidenced": Vue work does not evidence React, Azure work does not evidence AWS, GitLab CI work does not evidence GitHub Actions.`

// The job's dimension weights are deliberately NOT a parameter. Telling the
// model a dimension matters more inflates that score, and the aggregator then
// weights the inflated score again. Scores stay independent measurements.
export function buildScoringMessages(
  resumeText: string,
  jobTitle: string,
  jobDescription: string | null,
  skills: readonly SkillToAdjudicate[],
  minYearsExperience: number,
): WorkersAIRequest['messages'] {
  const required = skills.filter((s) => s.requirement === 'required').map((s) => s.skill)
  const skillsList = required.length > 0 ? required.join(', ') : 'Not specified'
  const jobContext = jobDescription ? `Job Description: ${jobDescription}` : `Job Title: ${jobTitle}`

  const skillSection = skills.length > 0
    ? `\nSkills to assess:\n${skills.map((s) => `- ${s.skill} [${s.requirement}]`).join('\n')}\n\n${VERDICT_GUIDE}\n`
    : ''
  const skillSchema = skills.length > 0
    ? `,
  "skill_matches": [
    { "skill": "<exactly as listed in Skills to assess>", "verdict": "evidenced|claimed|transferable|missing", "evidence": "<max 15 words grounded in the resume, or null>", "via": "<adjacent skill, transferable only, else null>" }
  ]`
    : ''
  const skillRule = skills.length > 0 ? '\nInclude exactly one skill_matches entry per skill listed in Skills to assess.' : ''

  return [
    { role: 'system', content: 'You are an expert technical recruiter. Score candidates against job requirements objectively. Return ONLY valid JSON matching the requested schema. Use the full 0-100 range — average candidates should land around 50-65, strong ones above 75.' },
    { role: 'user', content: `Score this candidate against the job requirements.

Job Title: ${jobTitle}
${jobContext}
Required Skills: ${skillsList}
Minimum Years Experience: ${minYearsExperience}
${skillSection}
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
  "concerns": ["2-4 short bullet points about gaps, empty array if none"]${skillSchema}
}
${skillRule}
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
