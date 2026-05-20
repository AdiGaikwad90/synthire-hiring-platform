import type { OpenRouterRequest } from '../openrouter'

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

export function buildResumeParseMessages(resumeText: string): OpenRouterRequest['messages'] {
  return [
    {
      role: 'system',
      content: 'You are a resume parser. Extract structured data from the resume text. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Parse the following resume and return a JSON object with this exact structure:
{
  "name": "string - candidate full name",
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

export function validateParsedResume(data: unknown): data is ParsedResume {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>

  if (typeof d.name !== 'string') return false
  if (!Array.isArray(d.technical_skills)) return false
  if (!Array.isArray(d.professional_experience)) return false
  if (!Array.isArray(d.education_details)) return false

  return true
}
