import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../types/bindings'
import {
  listCandidatesSchema,
  updateCandidateSchema,
  apiResponse,
  paginatedResponse,
} from '../types/api'
import { detectFileType, getExtension, getContentType } from '../services/parsing/detector'
import { uploadToR2, getFromR2, r2Key } from '../services/storage/r2'
import { buildQuestionMessages, validateQuestions } from '../services/ai/prompts/generate-questions'
import { callWithFallback, buildLlmConfig } from '../services/ai/fallback'
import { buildNeuronLimitConfig } from '../services/budget/neurons'
import {
  createCandidate,
  updateCandidateError,
  getCandidate,
  listCandidates,
  updateCandidateStatus,
  deleteCandidate,
  setCandidateResumeUrl,
} from '../db/queries/candidates'
import { listSkillMatches } from '../db/queries/skill-matches'
import { getJob } from '../db/queries/jobs'
import { authMiddleware } from '../middleware/auth'
import { recruiterOnly, requireInterviewAccess } from '../middleware/authorize'
import { hasAssignedInterview } from '../db/queries/interviews'
import type { ResumeQueueMessage } from '../queue/messages'
import { purgeCandidateArtifacts } from '../services/candidates/purge'

const router = new Hono<{ Bindings: Env }>()

router.use('*', authMiddleware)

// Interviewers may read a candidate only from an interview assigned to them.
// Runs after the company-scoped fetch: another company's id stays a 404.
function requireCandidateAccess(c: Context<{ Bindings: Env }>, candidateId: string) {
  const user = c.get('user')
  return requireInterviewAccess(user, () =>
    hasAssignedInterview(c.env.DB, user.company_id, user.sub, { candidateId }))
}

// ── POST /upload — async candidate processing (returns candidateId immediately, client polls) ──

router.post('/upload', recruiterOnly, async (c) => {
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

  // Create candidate row with processing_status='queued'
  const candidate = await createCandidate(c.env.DB, {
    job_id: jobId,
    company_id: companyId,
    name: 'Processing...',
    processing_status: 'queued',
  })

  const env = c.env
  const candidateId = candidate.id
  const ext = getExtension(fileType)
  const contentType = getContentType(fileType)
  const key = r2Key(companyId, jobId, candidateId, ext)

  // Upload to R2 before responding so the file is viewable immediately
  try {
    await uploadToR2(env, key, buffer, contentType)
    await setCandidateResumeUrl(env.DB, candidateId, key)
  } catch (err) {
    console.error('[upload] storing the file failed', { candidateId, err: err instanceof Error ? err.message : String(err) })
    await updateCandidateError(env.DB, candidateId, 'Could not store the uploaded file').catch((e) =>
      console.error('[upload] could not record the storage failure', { candidateId, err: e instanceof Error ? e.message : String(e) })
    )
    throw err
  }

  // Processing runs in the queue consumer (15-min wall clock), not waitUntil
  // (cancelled 30 s after this response). The client polls GET /:id.
  const message: ResumeQueueMessage = { type: 'process-resume', candidateId, companyId, jobId, r2Key: key, fileType }
  try {
    await env.RESUME_QUEUE.send(message)
  } catch (err) {
    console.error('[upload] queue send failed', { candidateId, err: err instanceof Error ? err.message : String(err) })
    await updateCandidateError(env.DB, candidateId, 'Could not queue the resume for processing').catch((e) =>
      console.error('[upload] could not record the queue-send failure', { candidateId, err: e instanceof Error ? e.message : String(e) })
    )
    return c.json({ success: false, error: 'Could not queue the resume for processing — please try again' }, 503)
  }

  return c.json(apiResponse({ candidateId }), 202)
})

// ── GET / — list candidates ───────────────────────────────────────────────────

router.get('/', recruiterOnly, zValidator('query', listCandidatesSchema), async (c) => {
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
  await requireCandidateAccess(c, id)

  const skill_matches = await listSkillMatches(c.env.DB, id, payload.company_id)
  return c.json(apiResponse({ ...candidate, skill_matches }))
})

// ── PATCH /:id — update candidate status ──────────────────────────────────────

router.patch('/:id', recruiterOnly, zValidator('json', updateCandidateSchema), async (c) => {
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
  if (!candidate) {
    return c.json({ success: false, error: 'Resume not found' }, 404)
  }
  // Before the resume check, so a refused caller can't learn whether one exists.
  await requireCandidateAccess(c, id)
  if (!candidate.resume_url) {
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
  // Before the cache and the model call: a refusal must cost no Neurons.
  await requireCandidateAccess(c, id)

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
    buildNeuronLimitConfig(c.env),
    messages,
    validateQuestions,
    'LLM_QUESTIONS',
    buildLlmConfig(c.env)
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

router.delete('/:id', recruiterOnly, async (c) => {
  const payload = c.get('user')
  const id = c.req.param('id')

  const result = await deleteCandidate(c.env.DB, id, payload.company_id)
  if (!result) {
    return c.json({ success: false, error: 'Candidate not found' }, 404)
  }

  // The row is gone (source of truth); its file, embedding and caches are
  // purged by the queue with retries. If the queue is unreachable, purge now.
  const purge: ResumeQueueMessage = { type: 'purge-candidate', candidateId: id, companyId: payload.company_id, resumeUrl: result.resumeUrl }
  try {
    await c.env.RESUME_QUEUE.send(purge)
  } catch (err) {
    console.error('[delete] queue send failed, purging inline', { candidateId: id, err: err instanceof Error ? err.message : String(err) })
    await purgeCandidateArtifacts(c.env, purge).catch((e) => console.error('[delete] inline purge failed', { candidateId: id, e: String(e) }))
  }

  return c.json(apiResponse({ deleted: true, id }))
})

export default router
