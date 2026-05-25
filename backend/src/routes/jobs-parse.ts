import { Hono } from 'hono'
import type { Env } from '../types/bindings'
import { authMiddleware } from '../middleware/auth'
import { apiResponse } from '../types/api'
import { detectFileType } from '../services/parsing/detector'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import type { OpenRouterRequest } from '../services/ai/openrouter'
import { z } from 'zod'

const router = new Hono<{ Bindings: Env }>()
router.use('*', authMiddleware)

const ParsedJDSchema = z.object({
  title: z.string(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  employment_type: z.string().nullable(),
  experience_level: z.string().nullable(),
  salary_range: z.string().nullable(),
  description: z.string(),
  required_skills: z.array(z.string()),
  nice_to_have_skills: z.array(z.string()),
  min_years_experience: z.number().nullable(),
  education_requirement: z.string().nullable(),
})

export type ParsedJD = z.infer<typeof ParsedJDSchema>

function validateParsedJD(data: unknown): boolean {
  const result = ParsedJDSchema.safeParse(data)
  return result.success
}

function buildJDParseMessages(jdText: string): OpenRouterRequest['messages'] {
  return [
    {
      role: 'system',
      content: `You are an expert job description parser. Extract structured data from job descriptions with high accuracy. Return ONLY valid JSON — no markdown, no explanation. If a field is not mentioned in the JD, return null for it. Never invent or guess values that are not explicitly stated in the text.`,
    },
    {
      role: 'user',
      content: `Parse this job description and return a JSON object with EXACTLY this structure. Only include values that are explicitly stated in the text — return null for anything not found:

{
  "title": "exact job title from the JD",
  "department": "department or team name, or null if not mentioned",
  "location": "location as stated (e.g. 'Remote', 'New York, NY', 'Hybrid - London'), or null",
  "employment_type": "one of: Full-time, Part-time, Contract, Freelance — or null if not stated",
  "experience_level": "one of: Junior, Mid, Senior, Lead — infer from years required and seniority language",
  "salary_range": "exact salary/comp range as stated in the JD, or null if not mentioned",
  "description": "the full job description text, cleaned up (remove excessive whitespace/formatting artifacts)",
  "required_skills": ["array of specific skill keywords explicitly listed as required — short keywords only, 1-4 words each, never full sentences"],
  "nice_to_have_skills": ["array of specific skill keywords listed as nice-to-have or preferred — short keywords only"],
  "min_years_experience": minimum years of experience as a number (e.g. 3), or null if not specified,
  "education_requirement": "one of: none, bachelors, masters, phd — based on what the JD requires, or null"
}

Rules:
- required_skills: ONLY skills explicitly listed as required/must-have. Extract every technology, language, framework, tool mentioned as required.
- nice_to_have_skills: ONLY skills listed as preferred/nice-to-have/bonus.
- salary_range: copy exactly as written — do NOT fabricate if not present.
- department: copy exactly as written — do NOT fabricate if not present.
- Keep skills as short keywords (React, Node.js, PostgreSQL, AWS) not sentences.

Job description to parse:
${jdText}`,
    },
  ]
}

router.post('/', async (c) => {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ success: false, error: 'Invalid multipart form data' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return c.json({ success: false, error: 'file is required' }, 400)
  }

  const buffer = await file.arrayBuffer()
  const fileType = detectFileType(buffer)
  if (!fileType) {
    return c.json({ success: false, error: 'Only PDF and DOCX files are supported' }, 400)
  }

  let jdText: string
  try {
    jdText = fileType === 'pdf' ? await extractPdfText(buffer) : await extractDocxText(buffer)
  } catch {
    return c.json({ success: false, error: 'Failed to extract text from file' }, 422)
  }

  if (!jdText.trim()) {
    return c.json({ success: false, error: 'Could not extract text from file — it may be scanned/image-based' }, 422)
  }

  const messages = buildJDParseMessages(jdText.slice(0, 8000))
  const config = buildLlmConfig(c.env)

  const parsed = await callWithFallback(
    c.env.AI,
    c.env.KV_CACHE,
    parseInt(c.env.NEURONS_DAILY_LIMIT ?? '10000', 10),
    messages,
    validateParsedJD,
    'LLM_PARSE',
    config
  ) as ParsedJD

  return c.json(apiResponse(parsed))
})

export default router
