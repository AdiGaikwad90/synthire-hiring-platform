import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
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
} from '../db/queries/interviews'
import { getCandidate } from '../db/queries/candidates'
import { getJob } from '../db/queries/jobs'
import { findUserById } from '../db/queries/users'
import { queueEmail } from '../db/queries/email'

const listInterviewsQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const router = new Hono<{ Bindings: Env }>()

// GET /api/interviews — list interviews for the company
router.get('/', zValidator('query', listInterviewsQuerySchema), async (c) => {
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
router.post('/', zValidator('json', createInterviewSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const db = c.env.DB

  const companyRow = await c.env.DB.prepare('SELECT name FROM companies WHERE id = ?')
    .bind(user.company_id)
    .first<{ name: string }>()
  const companyName = companyRow?.name ?? 'Synthire'

  // Verify candidate exists and belongs to company
  const candidate = await getCandidate(db, body.candidate_id, user.company_id)
  if (!candidate) {
    throw new AppError('Candidate not found', 404)
  }

  const interview = await createInterview(db, {
    ...body,
    company_id: user.company_id,
  })

  // Fire-and-forget email queuing
  void (async () => {
    try {
      const [interviewer, job] = await Promise.all([
        findUserById(db, body.interviewer_id),
        getJob(db, body.job_id, user.company_id),
      ])

      const candidateName = candidate.name
      const jobTitle = job?.title ?? 'Unknown Position'
      const scheduledAt = body.scheduled_at
      const durationMinutes = body.duration_minutes ?? 60
      const videoLink = body.video_link
      const frontendUrl = c.env.FRONTEND_ORIGIN

      if (interviewer) {
        // 1. Magic link to interviewer
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
      if (candidate.email) {
        await queueEmail(db, {
          recipientEmail: candidate.email,
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

      if (candidate.email) {
        await queueEmail(db, {
          recipientEmail: candidate.email,
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
    } catch {
      // fire-and-forget: swallow errors
    }
  })()

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
  zValidator('json', z.object({
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

// POST /api/interviews/:id/feedback — submit feedback for an interview
router.post('/:id/feedback', zValidator('json', submitFeedbackSchema), async (c) => {
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
