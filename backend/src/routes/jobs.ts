import { Hono, type Context } from 'hono'
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
import { getJobSkillGaps } from '../db/queries/skill-matches'
import { authMiddleware } from '../middleware/auth'
import { recruiterOnly, requireInterviewAccess } from '../middleware/authorize'
import { hasAssignedInterview } from '../db/queries/interviews'
import { detectFileType, getExtension, getContentType } from '../services/parsing/detector'
import { coerceYears } from '../utils/numbers'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { uploadToR2, getFromR2, deleteFromR2 } from '../services/storage/r2'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import { buildNeuronLimitConfig } from '../services/budget/neurons'
import type { WorkersAIRequest } from '../services/ai/workers-ai'
import {
  JD_PARSE_TTL_SECONDS,
  jdParseKvKey,
  pendingJdKey,
  readJdParse,
  resolveJdParse,
  attachJd,
  type JdParseRecord,
} from '../services/jd/attachment'

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
    .transform(v => coerceYears(v)),
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

// Interviewers may read a job only from an interview assigned to them.
// Runs after the company-scoped fetch: another company's id stays a 404.
function requireJobAccess(c: Context<{ Bindings: Env }>, jobId: string) {
  const user = c.get('user')
  return requireInterviewAccess(user, () =>
    hasAssignedInterview(c.env.DB, user.company_id, user.sub, { jobId }))
}

// GET /api/jobs — list jobs for the authenticated user's company
router.get('/', recruiterOnly, zv('query', listJobsSchema), async (c) => {
  const { status, search, page, limit } = c.req.valid('query')
  const user = c.get('user')
  const { items, total } = await listJobs(c.env.DB, user.company_id, { status, search, page, limit })
  return c.json(paginatedResponse(items, total, page, limit))
})

// POST /api/jobs — create a new job
router.post('/', recruiterOnly, zv('json', createJobSchema), async (c) => {
  const { jd_parse_id, ...body } = c.req.valid('json')
  const user = c.get('user')
  // Validate before inserting, so a bad parse ID creates nothing.
  const jdParse = jd_parse_id ? await resolveJdParse(c.env.KV_CACHE, jd_parse_id, user.company_id) : null

  let job = await createJob(c.env.DB, {
    ...body,
    company_id: user.company_id,
    recruiter_id: user.sub,
  })
  if (!jdParse) return c.json(apiResponse(job), 201)

  let jdUrl: string | null = null
  try {
    jdUrl = await attachJd(c.env, jdParse, user.company_id, job.id)
  } catch (err) {
    console.error('[jobs] attaching the JD failed', { jobId: job.id, error: err instanceof Error ? err.message : String(err) })
  }
  if (jdUrl) {
    job = (await updateJob(c.env.DB, job.id, user.company_id, { jd_url: jdUrl })) ?? job
    await c.env.KV_CACHE.delete(jdParseKvKey(jd_parse_id as string))
  } else {
    console.warn('[jobs] JD pending file expired before attach', { jobId: job.id })
  }
  return c.json(apiResponse({ ...job, jd_attached: jdUrl !== null }), 201)
})

// POST /api/jobs/parse-jd — start async JD parse; returns parseId immediately (202)
router.post('/parse-jd', recruiterOnly, async (c) => {
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
  const kvKey = jdParseKvKey(parseId)
  const env = c.env
  const ext = getExtension(fileType) as 'pdf' | 'docx'
  const base = { companyId: user.company_id, pendingKey: pendingJdKey(user.company_id, parseId, ext), ext } satisfies Omit<JdParseRecord, 'status'>
  await c.env.KV_CACHE.put(kvKey, JSON.stringify({ ...base, status: 'processing' } satisfies JdParseRecord), { expirationTtl: JD_PARSE_TTL_SECONDS })

  // Run LLM in background — client gets parseId immediately and polls
  c.executionCtx.waitUntil(
    (async () => {
      try {
        // Store original file in R2
        try {
          await uploadToR2(env, base.pendingKey, buffer, getContentType(fileType))
        } catch {
          // Non-fatal
        }

        const messages = buildJdParseMessages(jdText)
        const llmConfig = buildLlmConfig(env)

        const raw = await callWithFallback(
          env.AI,
          env.KV_CACHE,
          buildNeuronLimitConfig(env),
          messages,
          validateParsedJd,
          'LLM_PARSE',
          llmConfig
        )
        // validateParsedJd only checks shape (data is ParsedJd); re-parse here
        // so the schema's transforms (e.g. coerceYears) actually apply — the
        // raw LLM output must never be stored as-is.
        // parsedJdSchema's own transforms already default these to [], so no
        // extra `?? []` is needed here.
        const result: ParsedJd = parsedJdSchema.parse(raw)

        await env.KV_CACHE.put(
          kvKey,
          JSON.stringify({ ...base, status: 'done', result: { ...result, parse_id: parseId } } satisfies JdParseRecord),
          { expirationTtl: JD_PARSE_TTL_SECONDS }
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Parsing failed'
        await env.KV_CACHE.put(
          kvKey,
          JSON.stringify({ ...base, status: 'error', error: message } satisfies JdParseRecord),
          { expirationTtl: JD_PARSE_TTL_SECONDS }
        )
      }
    })()
  )

  return c.json(apiResponse({ parseId }), 202)
})

// GET /api/jobs/parse-jd/:parseId — poll for async JD parse result
router.get('/parse-jd/:parseId', recruiterOnly, async (c) => {
  const user = c.get('user')
  const record = await readJdParse(c.env.KV_CACHE, c.req.param('parseId'))
  // Unknown, malformed or another tenant's parse all look like "still processing".
  if (!record || record.companyId !== user.company_id) return c.json(apiResponse({ status: 'processing' }))
  const { status, result, error } = record
  return c.json(apiResponse({ status, ...(result ? { result } : {}), ...(error ? { error } : {}) }))
})

// GET /api/jobs/:id/jd — stream the original JD file from R2
router.get('/:id/jd', async (c) => {
  const user = c.get('user')
  const job = await getJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!job) throw new AppError('Job not found', 404)
  await requireJobAccess(c, job.id)
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

// GET /api/jobs/:id/skill-gaps — per-skill verdict counts across scored applicants
router.get('/:id/skill-gaps', recruiterOnly, async (c) => {
  const user = c.get('user')
  const jobId = c.req.param('id')
  if (!(await getJob(c.env.DB, jobId, user.company_id))) throw new AppError('Job not found', 404)
  return c.json(apiResponse(await getJobSkillGaps(c.env.DB, jobId, user.company_id)))
})

// GET /api/jobs/:id — get a single job
router.get('/:id', async (c) => {
  const user = c.get('user')
  const job = await getJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!job) {
    throw new AppError('Job not found', 404)
  }
  await requireJobAccess(c, job.id)
  return c.json(apiResponse(job))
})

// PATCH /api/jobs/:id — partial update
router.patch('/:id', recruiterOnly, zv('json', updateJobSchema), async (c) => {
  const { jd_parse_id, ...body } = c.req.valid('json')
  const user = c.get('user')
  const jdParse = jd_parse_id ? await resolveJdParse(c.env.KV_CACHE, jd_parse_id, user.company_id) : null
  let job = await updateJob(c.env.DB, c.req.param('id'), user.company_id, body)
  if (!job) throw new AppError('Job not found', 404)
  if (!jdParse) return c.json(apiResponse(job))

  const previous = job.jd_url
  let jdUrl: string | null = null
  try {
    jdUrl = await attachJd(c.env, jdParse, user.company_id, job.id)
  } catch (err) {
    console.error('[jobs] attaching the JD failed', { jobId: job.id, error: err instanceof Error ? err.message : String(err) })
  }
  if (jdUrl) {
    job = (await updateJob(c.env.DB, job.id, user.company_id, { jd_url: jdUrl })) ?? job
    if (previous && previous !== jdUrl) await deleteFromR2(c.env, previous).catch(() => {})
    await c.env.KV_CACHE.delete(jdParseKvKey(jd_parse_id as string))
  }
  return c.json(apiResponse({ ...job, jd_attached: jdUrl !== null }))
})

// DELETE /api/jobs/:id — soft delete (set status='closed')
router.delete('/:id', recruiterOnly, async (c) => {
  const user = c.get('user')
  const deleted = await deleteJob(c.env.DB, c.req.param('id'), user.company_id)
  if (!deleted) {
    throw new AppError('Job not found', 404)
  }
  return c.json(apiResponse({ deleted: true }))
})

export default router
