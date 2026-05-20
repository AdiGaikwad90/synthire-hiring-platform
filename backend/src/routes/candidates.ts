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
import { uploadToR2, deleteFromR2, r2Key } from '../services/storage/r2'
import {
  buildResumeParseMessages,
  validateParsedResume,
} from '../services/ai/prompts/parse-resume'
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

const router = new Hono<{ Bindings: Env; Variables: { jwtPayload: import('../types/auth').JWTPayload } }>()

// ── POST /upload — SSE streaming candidate processing ─────────────────────────

router.post('/upload', async (c) => {
  const payload = c.get('jwtPayload')
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

  const candidateId = candidate.id
  const ext = getExtension(fileType)
  const contentType = getContentType(fileType)
  const key = r2Key(companyId, jobId, candidateId, ext)

  // Upload to R2
  await uploadToR2(c.env.RESUME_BUCKET, key, buffer, contentType)

  // SSE streaming response
  const env = c.env
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
          env.OPENROUTER_API_KEY,
          messages,
          validateParsedResume
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
          scoringWeights: job.scoring_weights,
          parsedResume,
        })

        // Update scores
        await updateCandidateScores(env.DB, candidateId, scoringResult, 'openrouter')

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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// ── GET / — list candidates ───────────────────────────────────────────────────

router.get('/', zValidator('query', listCandidatesSchema), async (c) => {
  const payload = c.get('jwtPayload')
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
  const payload = c.get('jwtPayload')
  const id = c.req.param('id')

  const candidate = await getCandidate(c.env.DB, id, payload.company_id)
  if (!candidate) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  return c.json(apiResponse(candidate))
})

// ── PATCH /:id — update candidate status ──────────────────────────────────────

router.patch('/:id', zValidator('json', updateCandidateSchema), async (c) => {
  const payload = c.get('jwtPayload')
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

// ── DELETE /:id — delete candidate + R2 ──────────────────────────────────────

router.delete('/:id', async (c) => {
  const payload = c.get('jwtPayload')
  const id = c.req.param('id')

  const result = await deleteCandidate(c.env.DB, id, payload.company_id)
  if (!result) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  // Delete from R2 if resume exists
  if (result.resumeUrl) {
    try {
      await deleteFromR2(c.env.RESUME_BUCKET, result.resumeUrl)
    } catch {
      // best-effort — don't fail the request if R2 delete fails
    }
  }

  return c.json(apiResponse({ deleted: true, id }))
})

export default router
