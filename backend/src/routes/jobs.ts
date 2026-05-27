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
import { detectFileType, getExtension, getContentType } from '../services/parsing/detector'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { uploadToR2, getFromR2 } from '../services/storage/r2'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import type { WorkersAIRequest } from '../services/ai/workers-ai'

// ── JD parse schema ───────────────────────────────────────────────────────────

const parsedJdSchema = z.object({
  title: z.string(),
  department: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  experience_level: z.string().nullable().optional(),
  salary_range: z.string().nullable().optional(),
  // Models often return arrays as null or strings as numbers — coerce both
  required_skills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  nice_to_have_skills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  min_years_experience: z.union([z.number(), z.string(), z.null()]).optional()
    .transform(v => (v === null || v === undefined || v === '') ? null : Number(v) || null),
  education_requirement: z.string().nullable().optional(),
})

type ParsedJd = z.infer<typeof parsedJdSchema>

function buildJdParseMessages(jdText: string): WorkersAIRequest['messages'] {
  return [
    {
      role: 'system',
      content: 'You are a strict job description data extractor. Extract ONLY what is explicitly written. NEVER infer, guess, or fabricate any field. Return ONLY valid JSON with no markdown.',
    },
    {
      role: 'user',
      content: `Extract data from the job description below. Return a JSON object with EXACTLY these fields.

CRITICAL RULES — violation is not acceptable:
- salary_range: return null UNLESS a specific dollar amount, range, or compensation figure is written in the text. Do NOT guess based on title or seniority.
- min_years_experience: return null UNLESS the text explicitly says "X years" or "X+ years". Do NOT infer from job title.
- department, location, education_requirement: return null if not mentioned.
- required_skills: ONLY skills the JD explicitly lists as required or analyze and identify the skills which seems to be required. Short keywords only (1-4 words).
- nice_to_have_skills: ONLY skills explicitly marked as preferred/nice-to-have/bonus/good-to-have or similar. Short keywords only (1-4 words).

JSON structure:
{
  "title": "exact job title",
  "department": "department name or null",
  "location": "location/remote policy or null",
  "description": "1-2 sentence role summary",
  "employment_type": "full_time or part_time or contract or null",
  "experience_level": "junior or mid or senior or lead — infer only from explicit seniority language",
  "salary_range": "exact text from JD or null — NEVER fabricate",
  "required_skills": ["skill keyword", "..."],
  "nice_to_have_skills": ["skill keyword", "..."],
  "min_years_experience": explicit number from JD or null — NEVER infer,
  "education_requirement": "none or bachelors or masters or phd or null"
}

Job description:
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

// POST /api/jobs/parse-jd — start async JD parse; returns parseId immediately (202)
router.post('/parse-jd', async (c) => {
  const maxUploadBytes = parseInt(c.env.MAX_UPLOAD_BYTES ?? '10485760', 10)

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    throw new AppError('Invalid multipart form data', 400)
  }

  const file = formData.get('file') as File | null
  if (!file) throw new AppError('file is required', 400)

  const buffer = await file.arrayBuffer()

  if (buffer.byteLength > maxUploadBytes) {
    throw new AppError(`File exceeds maximum size of ${maxUploadBytes} bytes`, 400)
  }

  const fileType = detectFileType(buffer)
  if (!fileType) throw new AppError('Only PDF and DOCX files are supported', 400)

  let jdText: string
  if (fileType === 'pdf') {
    jdText = await extractPdfText(buffer)
  } else {
    jdText = await extractDocxText(buffer)
  }

  if (!jdText.trim()) throw new AppError('Could not extract text from file', 422)

  // Generate a parse ID and store 'processing' status in KV immediately
  const parseId = crypto.randomUUID()
  const user = c.get('user')
  const kvKey = `jdparse:${parseId}`
  await c.env.KV_CACHE.put(kvKey, JSON.stringify({ status: 'processing' }), { expirationTtl: 3600 })

  const env = c.env
  const ext = getExtension(fileType)
  const jdKey = `jd/${user.company_id}/${Date.now()}.${ext}`

  // Run LLM in background — client gets parseId immediately and polls
  c.executionCtx.waitUntil(
    (async () => {
      try {
        // Store original file in R2
        try {
          await uploadToR2(env, jdKey, buffer, getContentType(fileType))
        } catch {
          // Non-fatal
        }

        const messages = buildJdParseMessages(jdText)
        const llmConfig = buildLlmConfig(env)

        const parsed = await callWithFallback(
          env.AI,
          env.KV_CACHE,
          parseInt(env.NEURONS_DAILY_LIMIT ?? '10000', 10),
          messages,
          validateParsedJd,
          'LLM_PARSE',
          llmConfig
        ) as ParsedJd

        const result: ParsedJd = {
          ...parsed,
          required_skills: parsed.required_skills ?? [],
          nice_to_have_skills: parsed.nice_to_have_skills ?? [],
        }

        await env.KV_CACHE.put(
          kvKey,
          JSON.stringify({ status: 'done', result: { ...result, jd_url: jdKey } }),
          { expirationTtl: 3600 }
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Parsing failed'
        await env.KV_CACHE.put(kvKey, JSON.stringify({ status: 'error', error: message }), { expirationTtl: 3600 })
      }
    })()
  )

  return c.json(apiResponse({ parseId }), 202)
})

// GET /api/jobs/parse-jd/:parseId — poll for async JD parse result
router.get('/parse-jd/:parseId', async (c) => {
  const parseId = c.req.param('parseId')
  const raw = await c.env.KV_CACHE.get(`jdparse:${parseId}`)
  if (!raw) return c.json(apiResponse({ status: 'processing' }))

  let state: { status: string; result?: unknown; error?: string }
  try {
    state = JSON.parse(raw)
  } catch {
    return c.json(apiResponse({ status: 'processing' }))
  }

  return c.json(apiResponse(state))
})

// GET /api/jobs/:id/jd — stream the original JD file from R2
router.get('/:id/jd', async (c) => {
  const user = c.get('user')
  const job = await getJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!job) throw new AppError('Job not found', 404)
  if (!job.jd_url) return c.json({ success: false, error: 'No JD file uploaded for this job' }, 404)

  const object = await getFromR2(c.env, job.jd_url)
  if (!object) return c.json({ success: false, error: 'JD file not found in storage' }, 404)

  const ext = job.jd_url.endsWith('.docx') ? 'docx' : 'pdf'
  const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const origin = c.req.header('Origin') || ''
  const corsOrigin = /^https?:\/\/localhost(:\d+)?$/.test(origin)
    ? origin
    : (c.env.FRONTEND_ORIGIN || 'http://localhost:3000')

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="JobDescription.${ext}"`,
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
    },
  })
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
