import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../types/bindings'
import {
  listCandidatesSchema,
  updateCandidateSchema,
  apiResponse,
  paginatedResponse,
  AppError,
} from '../types/api'
import { detectFileType, getExtension, getContentType } from '../services/parsing/detector'
import { extractPdfText } from '../services/parsing/pdf'
import { extractDocxText } from '../services/parsing/docx'
import { uploadToR2, deleteFromR2, getFromR2, r2Key } from '../services/storage/r2'
import {
  buildResumeParseMessages,
  validateParsedResume,
} from '../services/ai/prompts/parse-resume'
import { buildQuestionMessages, validateQuestions } from '../services/ai/prompts/generate-questions'
import { callWithFallback } from '../services/ai/fallback'
import { runScoringPipeline } from '../services/scoring/pipeline'
import {
  createCandidate,
  updateCandidateParsed,
  updateCandidateScores,
  updateCandidateError,
  getCandidate,
  listCandidates,
  updateCandidateStatus,
  deleteCandidate,
} from '../db/queries/candidates'
import { getJob } from '../db/queries/jobs'
import type { ParsedResume } from '../services/ai/prompts/parse-resume'
import { authMiddleware } from '../middleware/auth'

const router = new Hono<{ Bindings: Env }>()

router.use('*', authMiddleware)

// ── POST /upload — SSE streaming candidate processing ─────────────────────────

router.post('/upload', async (c) => {
  const payload = c.get('user')
  const companyId = payload.company_id

  const maxUploadBytes = parseInt(c.env.MAX_UPLOAD_BYTES ?? '10485760', 10)

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ success: false, error: 'Invalid multipart form data' }, 400)
  }

  const jobId = formData.get('jobId') as string | null
  const file = formData.get('file') as File | null

  if (!jobId) {
    return c.json({ success: false, error: 'jobId is required' }, 400)
  }

  if (!file) {
    return c.json({ success: false, error: 'file is required' }, 400)
  }

  const buffer = await file.arrayBuffer()

  if (buffer.byteLength > maxUploadBytes) {
    return c.json(
      { success: false, error: `File exceeds maximum size of ${maxUploadBytes} bytes` },
      400
    )
  }

  const fileType = detectFileType(buffer)
  if (!fileType) {
    return c.json({ success: false, error: 'Only PDF and DOCX files are supported' }, 400)
  }

  // Verify job belongs to company
  const job = await getJob(c.env.DB, jobId, companyId)
  if (!job) {
    return c.json({ success: false, error: 'Job not found' }, 404)
  }

  // Create candidate row with processing_status='parsing'
  const candidate = await createCandidate(c.env.DB, {
    job_id: jobId,
    company_id: companyId,
    name: 'Processing...',
    processing_status: 'parsing',
  })

  const env = c.env
  const candidateId = candidate.id
  const ext = getExtension(fileType)
  const contentType = getContentType(fileType)
  const key = r2Key(companyId, jobId, candidateId, ext)

  // Upload to R2
  await uploadToR2(env, key, buffer, contentType)

  // SSE streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send({ candidateId, status: 'parsing' })

        // Extract text
        let resumeText: string
        if (fileType === 'pdf') {
          resumeText = await extractPdfText(buffer)
        } else {
          resumeText = await extractDocxText(buffer)
        }

        // Parse resume with AI
        const messages = buildResumeParseMessages(resumeText)
        const parsedResume = await callWithFallback(
          env.AI,
          env.KV_CACHE,
          parseInt(env.NEURONS_DAILY_LIMIT ?? '10000', 10),
          messages,
          validateParsedResume,
          'LLM_PARSE'
        ) as ParsedResume

        // Update candidate with parsed data
        await updateCandidateParsed(env.DB, candidateId, parsedResume, key)

        send({ candidateId, status: 'scoring' })

        // Run scoring pipeline
        const scoringResult = await runScoringPipeline(env, {
          candidateId,
          jobId,
          companyId,
          resumeText,
          jobTitle: job.title,
          jobDescription: job.description ?? null,
          requiredSkills: job.required_skills,
          niceToHaveSkills: job.nice_to_have_skills,
          minYearsExperience: job.min_years_experience,
          scoringWeights: job.scoring_dimensions,
          parsedResume,
        })

        // Update scores
        await updateCandidateScores(env.DB, candidateId, scoringResult, 'workers-ai')

        // Fetch final candidate row
        const finalCandidate = await getCandidate(env.DB, candidateId, companyId)

        send({
          candidateId,
          status: 'complete',
          score: scoringResult.overall_score,
          candidate: finalCandidate,
        })

        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        try {
          await updateCandidateError(env.DB, candidateId, message)
        } catch {
          // best-effort
        }
        send({ candidateId, status: 'error', error: message })
        controller.close()
      }
    },
  })

  const origin = c.req.header('Origin') || ''
  const corsOrigin = /^https?:\/\/localhost(:\d+)?$/.test(origin)
    ? origin
    : (c.env.FRONTEND_ORIGIN || 'http://localhost:3000')

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
    },
  })
})

// ── GET / — list candidates ───────────────────────────────────────────────────

router.get('/', zValidator('query', listCandidatesSchema), async (c) => {
  const payload = c.get('user')
  const { job_id, status, min_score, page, limit } = c.req.valid('query')

  const { items, total } = await listCandidates(c.env.DB, payload.company_id, {
    job_id,
    status,
    min_score,
    page,
    limit,
  })

  return c.json(paginatedResponse(items, total, page, limit))
})

// ── GET /:id — get candidate ──────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')

  const candidate = await getCandidate(c.env.DB, id, payload.company_id)
  if (!candidate) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  return c.json(apiResponse(candidate))
})

// ── PATCH /:id — update candidate status ──────────────────────────────────────

router.patch('/:id', zValidator('json', updateCandidateSchema), async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')
  const { status } = c.req.valid('json')

  if (!status) {
    return c.json({ success: false, error: 'No fields to update' }, 400)
  }

  const candidate = await updateCandidateStatus(c.env.DB, id, payload.company_id, status)
  if (!candidate) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  return c.json(apiResponse(candidate))
})

// ── GET /:id/resume — stream original file from R2 ────────────────────────────

router.get('/:id/resume', async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')

  const candidate = await getCandidate(c.env.DB, id, payload.company_id)
  if (!candidate || !candidate.resume_url) {
    return c.json({ success: false, error: 'Resume not found' }, 404)
  }

  const object = await getFromR2(c.env, candidate.resume_url)
  if (!object) {
    return c.json({ success: false, error: 'Resume file not found in storage' }, 404)
  }

  const ext = candidate.resume_url.endsWith('.docx') ? 'docx' : 'pdf'
  const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const filename = `${candidate.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}_Resume.${ext}`

  const origin = c.req.header('Origin') || ''
  const corsOrigin = /^https?:\/\/localhost(:\d+)?$/.test(origin)
    ? origin
    : (c.env.FRONTEND_ORIGIN || 'http://localhost:3000')

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
    },
  })
})

// ── POST /:id/questions — generate AI interview questions ─────────────────────

router.post('/:id/questions', async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')

  const candidate = await getCandidate(c.env.DB, id, payload.company_id)
  if (!candidate) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  // Check KV cache first
  const cacheKey = `questions:${id}`
  const cached = await c.env.KV_CACHE.get(cacheKey)
  if (cached) {
    return c.json(apiResponse(JSON.parse(cached)))
  }

  const job = candidate.job_id ? await getJob(c.env.DB, candidate.job_id, payload.company_id) : null

  const messages = buildQuestionMessages(
    candidate.name,
    job?.title ?? 'this role',
    candidate.technical_skills ?? [],
    candidate.professional_experience ?? []
  )

  const result = await callWithFallback(
    c.env.AI,
    c.env.KV_CACHE,
    parseInt(c.env.NEURONS_DAILY_LIMIT ?? '10000', 10),
    messages,
    validateQuestions,
    'LLM_QUESTIONS'
  ) as { questions: Array<string | { q: string; why: string }> }

  // Normalize to {q, why} format regardless of model output shape
  const questions = result.questions.map((item) => {
    if (typeof item === 'string') {
      return { q: item, why: '' }
    }
    return item
  })

  const payload_out = { questions }
  await c.env.KV_CACHE.put(cacheKey, JSON.stringify(payload_out), { expirationTtl: 604800 }) // 7 days

  return c.json(apiResponse(payload_out))
})

// ── DELETE /:id — delete candidate + R2 ──────────────────────────────────────

router.delete('/:id', async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')

  const result = await deleteCandidate(c.env.DB, id, payload.company_id)
  if (!result) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  // Delete from R2 if resume exists
  if (result.resumeUrl) {
    try {
      await deleteFromR2(c.env, result.resumeUrl)
    } catch {
      // best-effort — don't fail the request if R2 delete fails
    }
  }

  return c.json(apiResponse({ deleted: true, id }))
})

export default router
