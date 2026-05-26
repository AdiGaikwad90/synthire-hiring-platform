import { Hono } from 'hono'
import { zv } from '../types/api'
import { z } from 'zod'
import type { Env } from '../types/bindings'
import {
  createInterviewSchema,
  submitFeedbackSchema,
  apiResponse,
  paginatedResponse,
  AppError,
} from '../types/api'
import {
  createInterview,
  listInterviews,
  getInterview,
  updateInterview,
  createFeedback,
  getFeedback,
} from '../db/queries/interviews'
import { getCandidate } from '../db/queries/candidates'
import { getJob } from '../db/queries/jobs'
import { findUserById, findUserByEmailInCompany } from '../db/queries/users'
import { queueEmail } from '../db/queries/email'
import { processEmailQueue } from '../services/email/queue'
import { authMiddleware } from '../middleware/auth'

const listInterviewsQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const router = new Hono<{ Bindings: Env }>()

router.use('*', authMiddleware)

// GET /api/interviews — list interviews for the company
router.get('/', zv('query', listInterviewsQuerySchema), async (c) => {
  const { status, page, limit } = c.req.valid('query')
  const user = c.get('user')

  const interviewerId = user.role === 'interviewer' ? user.sub : undefined

  const { items, total } = await listInterviews(c.env.DB, user.company_id, {
    interviewerId,
    status,
    page,
    limit,
  })

  return c.json(paginatedResponse(items, total, page, limit))
})

// POST /api/interviews — create a new interview
router.post('/', zv('json', createInterviewSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const db = c.env.DB

  const companyRow = await c.env.DB.prepare('SELECT name FROM companies WHERE id = ?')
    .bind(user.company_id)
    .first<{ name: string }>()
  const companyName = companyRow?.name ?? 'Synthire'

  // Resolve interviewer_id from interviewer_email if provided
  let interviewerId = body.interviewer_id
  let resolvedInterviewerEmail = body.interviewer_email
  if (body.interviewer_email && !interviewerId) {
    const interviewerByEmail = await findUserByEmailInCompany(db, body.interviewer_email, user.company_id)
    if (interviewerByEmail) {
      interviewerId = interviewerByEmail.id
    }
    // If not found, we store the email for external interviewers and send an invite
  }

  // Verify job exists and belongs to company
  const job = await getJob(db, body.job_id, user.company_id)
  if (!job) {
    throw new AppError('Job not found', 404)
  }

  // Verify candidate exists and belongs to company
  const candidate = await getCandidate(db, body.candidate_id, user.company_id)
  if (!candidate) {
    throw new AppError('Candidate not found', 404)
  }

  const interview = await createInterview(db, {
    candidate_id: body.candidate_id,
    job_id: body.job_id,
    interviewer_id: interviewerId ?? null,
    interviewer_email: interviewerId ? undefined : resolvedInterviewerEmail,
    interview_type_id: body.interview_type_id,
    scheduled_at: body.scheduled_at,
    duration_minutes: body.duration_minutes,
    video_link: body.video_link,
    meeting_notes: body.meeting_notes,
    company_id: user.company_id,
  })

  // Fire-and-forget email queuing — wrapped in waitUntil so the Worker isn't killed after response
  c.executionCtx.waitUntil((async () => {
    try {
      const interviewer = interviewerId ? await findUserById(db, interviewerId) : null
      const externalInterviewerEmail = !interviewerId ? resolvedInterviewerEmail : undefined

      const candidateEmail = body.candidate_email_override || candidate.email
      const candidateName = candidate.name
      const jobTitle = job?.title ?? 'Unknown Position'
      const scheduledAt = body.scheduled_at
      const durationMinutes = body.duration_minutes ?? 60
      const videoLink = body.video_link
      const frontendUrl = c.env.FRONTEND_ORIGIN

      // 1a. If external interviewer (not a Synthire user), send a plain invite email
      if (!interviewer && externalInterviewerEmail) {
        await queueEmail(db, {
          recipientEmail: externalInterviewerEmail,
          emailType: 'magic_link',
          templateData: {
            interviewId: interview.id,
            interviewerName: externalInterviewerEmail.split('@')[0],
            candidateName,
            jobTitle,
            scheduledAt,
            durationMinutes,
            videoLink: videoLink ?? undefined,
            overallScore: undefined,
            frontendUrl,
          },
        })
      }

      if (interviewer) {
        // 1b. Magic link to registered interviewer
        await queueEmail(db, {
          recipientEmail: interviewer.email,
          emailType: 'magic_link',
          templateData: {
            interviewId: interview.id,
            interviewerName: interviewer.name,
            candidateName,
            jobTitle,
            scheduledAt,
            durationMinutes,
            videoLink: videoLink ?? undefined,
            overallScore: candidate.overall_score ?? undefined,
            frontendUrl,
          },
        })
      }

      // 2. Interview scheduled notification to candidate
      if (candidateEmail) {
        await queueEmail(db, {
          recipientEmail: candidateEmail,
          emailType: 'interview_scheduled',
          templateData: {
            candidateName,
            companyName,
            jobTitle,
            scheduledAt,
            durationMinutes,
            videoLink: videoLink ?? undefined,
            interviewId: interview.id,
            frontendUrl,
          },
        })
      }

      // 3. 24h-before reminders
      const reminderTime = new Date(new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000)

      if (interviewer) {
        await queueEmail(db, {
          recipientEmail: interviewer.email,
          emailType: 'interview_reminder',
          templateData: {
            interviewId: interview.id,
            recipientRole: 'interviewer',
            recipientName: interviewer.name,
            candidateName,
            companyName,
            jobTitle,
            scheduledAt,
            durationMinutes,
            videoLink: videoLink ?? undefined,
            frontendUrl,
          },
          scheduledFor: reminderTime,
        })
      }

      if (candidateEmail) {
        await queueEmail(db, {
          recipientEmail: candidateEmail,
          emailType: 'interview_reminder',
          templateData: {
            interviewId: interview.id,
            recipientRole: 'candidate',
            recipientName: candidateName,
            candidateName,
            companyName,
            jobTitle,
            scheduledAt,
            durationMinutes,
            videoLink: videoLink ?? undefined,
            frontendUrl,
          },
          scheduledFor: reminderTime,
        })
      }
      // Process the queue immediately so emails send right away
      // (cron runs every minute but this ensures instant delivery)
      await processEmailQueue(c.env)
    } catch (err) {
      console.error('[interviews] Email send error:', err)
    }
  })())

  return c.json(apiResponse(interview), 201)
})

// GET /api/interviews/:id — get a single interview
router.get('/:id', async (c) => {
  const user = c.get('user')
  const interview = await getInterview(c.env.DB, c.req.param('id'), user.company_id)

  if (!interview) {
    throw new AppError('Interview not found', 404)
  }

  // Interviewers can only see their own interviews
  if (user.role === 'interviewer' && interview.interviewer_id !== user.sub) {
    throw new AppError('Access denied', 403)
  }

  return c.json(apiResponse(interview))
})

// PATCH /api/interviews/:id — update status or meeting notes
router.patch(
  '/:id',
  zv('json', z.object({
    status: z.string().optional(),
    meeting_notes: z.string().optional(),
  })),
  async (c) => {
    const body = c.req.valid('json')
    const user = c.get('user')

    const interview = await updateInterview(c.env.DB, c.req.param('id'), user.company_id, body)
    if (!interview) {
      throw new AppError('Interview not found', 404)
    }

    return c.json(apiResponse(interview))
  }
)

// GET /api/interviews/:id/feedback — get submitted feedback for an interview
router.get('/:id/feedback', async (c) => {
  const user = c.get('user')
  const interviewId = c.req.param('id')
  const interview = await getInterview(c.env.DB, interviewId, user.company_id)
  if (!interview) throw new AppError('Interview not found', 404)
  if (user.role === 'interviewer' && interview.interviewer_id !== user.sub) {
    throw new AppError('Forbidden', 403)
  }
  const feedback = await getFeedback(c.env.DB, interviewId)
  return c.json(apiResponse(feedback))
})

// POST /api/interviews/:id/feedback — submit feedback for an interview
router.post('/:id/feedback', zv('json', submitFeedbackSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const db = c.env.DB
  const interviewId = c.req.param('id')

  const interview = await getInterview(db, interviewId, user.company_id)
  if (!interview) {
    throw new AppError('Interview not found', 404)
  }

  // Interviewers can only submit feedback for their own interviews
  if (user.role === 'interviewer' && interview.interviewer_id !== user.sub) {
    throw new AppError('Forbidden: you can only submit feedback for your own interviews', 403)
  }

  const feedback = await createFeedback(db, {
    interview_id: interviewId,
    interviewer_id: user.sub,
    ...body,
  })

  return c.json(apiResponse(feedback), 201)
})

export default router
