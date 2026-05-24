import { Hono } from 'hono'
import { zv } from '../types/api'
import { z } from 'zod'
import type { Env } from '../types/bindings'
import {
  createJobSchema,
  updateJobSchema,
  listJobsSchema,
  apiResponse,
  paginatedResponse,
  AppError,
} from '../types/api'
import {
  listJobs,
  createJob,
  getJob,
  updateJob,
  deleteJob,
} from '../db/queries/jobs'
import { authMiddleware } from '../middleware/auth'
import { detectFileType } from '../services/parsing/detector'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import type { OpenRouterRequest } from '../services/ai/openrouter'

// ── JD parse schema ───────────────────────────────────────────────────────────

const parsedJdSchema = z.object({
  title: z.string(),
  department: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  experience_level: z.string().nullable().optional(),
  salary_range: z.string().nullable().optional(),
  required_skills: z.array(z.string()).optional(),
  nice_to_have_skills: z.array(z.string()).optional(),
  min_years_experience: z.number().nullable().optional(),
  education_requirement: z.string().nullable().optional(),
})

type ParsedJd = z.infer<typeof parsedJdSchema>

function buildJdParseMessages(jdText: string): OpenRouterRequest['messages'] {
  return [
    {
      role: 'system',
      content: 'You are a job description parser. Extract structured data from job description text. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Parse the following job description and return a JSON object with this exact structure:
{
  "title": "string - job title",
  "department": "string or null - department name",
  "location": "string or null - location or remote policy",
  "description": "string or null - concise role summary (2-3 sentences)",
  "employment_type": "one of: full_time | part_time | contract (use underscores exactly)",
  "experience_level": "one of: junior | mid | senior | lead (use lowercase exactly)",
  "salary_range": "string or null - compensation band if mentioned",
  "required_skills": ["array of required skill strings"],
  "nice_to_have_skills": ["array of nice-to-have skill strings"],
  "min_years_experience": number or null - minimum years of experience as a number,
  "education_requirement": "string or null - e.g. Bachelor's in CS or equivalent"
}

Job description text:
${jdText}`,
    },
  ]
}

function validateParsedJd(data: unknown): data is ParsedJd {
  return parsedJdSchema.safeParse(data).success
}

const router = new Hono<{ Bindings: Env }>()

router.use('*', authMiddleware)

// GET /api/jobs — list jobs for the authenticated user's company
router.get('/', zv('query', listJobsSchema), async (c) => {
  const { status, search, page, limit } = c.req.valid('query')
  const user = c.get('user')
  const { items, total } = await listJobs(c.env.DB, user.company_id, { status, search, page, limit })
  return c.json(paginatedResponse(items, total, page, limit))
})

// POST /api/jobs — create a new job
router.post('/', zv('json', createJobSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const job = await createJob(c.env.DB, {
    ...body,
    company_id: user.company_id,
    recruiter_id: user.sub,
  })
  return c.json(apiResponse(job), 201)
})

// POST /api/jobs/parse-jd — parse a job description file (PDF or DOCX) via LLM
router.post('/parse-jd', async (c) => {
  const maxUploadBytes = parseInt(c.env.MAX_UPLOAD_BYTES ?? '10485760', 10)

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    throw new AppError('Invalid multipart form data', 400)
  }

  const file = formData.get('file') as File | null
  if (!file) {
    throw new AppError('file is required', 400)
  }

  const buffer = await file.arrayBuffer()

  if (buffer.byteLength > maxUploadBytes) {
    throw new AppError(`File exceeds maximum size of ${maxUploadBytes} bytes`, 400)
  }

  const fileType = detectFileType(buffer)
  if (!fileType) {
    throw new AppError('Only PDF and DOCX files are supported', 400)
  }

  let jdText: string
  if (fileType === 'pdf') {
    jdText = await extractPdfText(buffer)
  } else {
    jdText = await extractDocxText(buffer)
  }

  if (!jdText.trim()) {
    throw new AppError('Could not extract text from file', 422)
  }

  const messages = buildJdParseMessages(jdText)
  const llmConfig = buildLlmConfig(c.env)

  const parsed = await callWithFallback(
    c.env.OPENROUTER_API_KEY,
    messages,
    validateParsedJd,
    llmConfig
  ) as ParsedJd

  // Normalise optional arrays to always be present
  const result: ParsedJd = {
    ...parsed,
    required_skills: parsed.required_skills ?? [],
    nice_to_have_skills: parsed.nice_to_have_skills ?? [],
  }

  return c.json(apiResponse(result))
})

// GET /api/jobs/:id — get a single job
router.get('/:id', async (c) => {
  const user = c.get('user')
  const job = await getJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!job) {
    throw new AppError('Job not found', 404)
  }
  return c.json(apiResponse(job))
})

// PATCH /api/jobs/:id — partial update
router.patch('/:id', zv('json', updateJobSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const job = await updateJob(c.env.DB, c.req.param('id'), user.company_id, body)
  if (!job) {
    throw new AppError('Job not found', 404)
  }
  return c.json(apiResponse(job))
})

// DELETE /api/jobs/:id — soft delete (set status='closed')
router.delete('/:id', async (c) => {
  const user = c.get('user')
  const deleted = await deleteJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!deleted) {
    throw new AppError('Job not found', 404)
  }
  return c.json(apiResponse({ deleted: true }))
})

export default router
