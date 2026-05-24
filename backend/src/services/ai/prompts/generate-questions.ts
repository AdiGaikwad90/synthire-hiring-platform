import type { OpenRouterRequest } from '../openrouter'
import type { ParsedResume } from './parse-resume'

export function buildQuestionMessages(
  candidateName: string,
  jobTitle: string,
  technicalSkills: string[],
  experience: ParsedResume['professional_experience']
): OpenRouterRequest['messages'] {
  const skillsList = technicalSkills.slice(0, 10).join(', ')
  const recentRoles = experience
    .slice(0, 3)
    .map(e => `${e.role} at ${e.company}`)
    .join(', ')

  return [
    {
      role: 'system',
      content: 'You are an expert technical interviewer. Generate targeted interview questions based on the candidate\'s background. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Generate 5-7 tailored interview questions for the following candidate applying for ${jobTitle}.

Candidate: ${candidateName}
Technical Skills: ${skillsList}
Recent Experience: ${recentRoles}

Return JSON with this exact structure:
{
  "questions": [
    { "q": "Question text?", "why": "One sentence explaining what this reveals about the candidate" },
    ...
  ]
}

Focus on technical depth, problem-solving, and gaps vs. job requirements.`,
    },
  ]
}

export function validateQuestions(data: unknown): data is { questions: Array<string | { q: string; why: string }> } {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.questions) || d.questions.length < 1) return false
  return d.questions.every((item: unknown) =>
    typeof item === 'string' ||
    (typeof item === 'object' && item !== null && typeof (item as any).q === 'string')
  )
}
