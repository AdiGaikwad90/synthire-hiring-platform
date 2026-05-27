import type { WorkersAIRequest } from '../workers-ai'

export interface ParsedResume {
  name: string
  email: string | null
  phone: string | null
  location: string | null
  technical_skills: string[]
  professional_experience: {
    company: string
    role: string
    from: string
    to: string
    description: string
    technologies: string[]
  }[]
  education_details: {
    school: string
    degree: string
    field: string
    year: string
  }[]
  certifications: string[]
  achievements: string[]
}

export function buildResumeParseMessages(resumeText: string): WorkersAIRequest['messages'] {
  return [
    {
      role: 'system',
      content: 'You are a resume parser. Extract structured data from the resume text. Return ONLY valid JSON. The candidate name is almost always the very first line or heading of a resume — always extract it.',
    },
    {
      role: 'user',
      content: `Parse the following resume and return a JSON object with this exact structure:
{
  "name": "string - candidate full name (REQUIRED: look for the largest/first text on the resume, it is always the person's name — never return empty string or null)",
  "email": "string or null - email address",
  "phone": "string or null - phone number",
  "location": "string or null - city/country",
  "technical_skills": ["array of skill strings"],
  "professional_experience": [
    {
      "company": "string",
      "role": "string - job title",
      "from": "string - start date",
      "to": "string - end date or 'Present'",
      "description": "string - responsibilities and achievements",
      "technologies": ["array of technologies used"]
    }
  ],
  "education_details": [
    {
      "school": "string",
      "degree": "string",
      "field": "string - field of study",
      "year": "string - graduation year"
    }
  ],
  "certifications": ["array of certification strings"],
  "achievements": ["array of notable achievement strings"]
}

Resume text:
${resumeText}`,
    },
  ]
}

const PLACEHOLDER_NAMES = new Set(['unknown', 'unknown candidate', 'not provided', 'n/a', 'none', 'candidate', ''])

export function validateParsedResume(data: unknown): data is ParsedResume {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>

  if (typeof d.name !== 'string') return false
  if (PLACEHOLDER_NAMES.has(d.name.trim().toLowerCase())) return false

  // Coerce null arrays to empty arrays so small models don't fail validation
  if (!Array.isArray(d.technical_skills)) d.technical_skills = []
  if (!Array.isArray(d.professional_experience)) d.professional_experience = []
  if (!Array.isArray(d.education_details)) d.education_details = []
  if (!Array.isArray(d.certifications)) d.certifications = []
  if (!Array.isArray(d.achievements)) d.achievements = []

  return true
}
