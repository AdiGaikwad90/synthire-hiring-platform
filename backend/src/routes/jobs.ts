import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
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

const router = new Hono<{ Bindings: Env }>()

// GET /api/jobs — list jobs for the authenticated user's company
router.get('/', zValidator('query', listJobsSchema), async (c) => {
  const { status, search, page, limit } = c.req.valid('query')
  const user = c.get('user')
  const { items, total } = await listJobs(c.env.DB, user.company_id, { status, search, page, limit })
  return c.json(paginatedResponse(items, total, page, limit))
})

// POST /api/jobs — create a new job
router.post('/', zValidator('json', createJobSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const job = await createJob(c.env.DB, {
    ...body,
    company_id: user.company_id,
    recruiter_id: user.sub,
  })
  return c.json(apiResponse(job), 201)
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
router.patch('/:id', zValidator('json', updateJobSchema), async (c) => {
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
