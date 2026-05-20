import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../types/bindings'
import { createInterviewTypeSchema, apiResponse, AppError } from '../types/api'
import {
  listInterviewTypes,
  createInterviewType,
  updateInterviewType,
  deleteInterviewType,
} from '../db/queries/interviews'

const router = new Hono<{ Bindings: Env }>()

// GET /api/interview-types — list all interview types for the company
router.get('/', async (c) => {
  const user = c.get('user')
  const types = await listInterviewTypes(c.env.DB, user.company_id)
  return c.json(apiResponse(types))
})

// POST /api/interview-types — create a new interview type
router.post('/', zValidator('json', createInterviewTypeSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const interviewType = await createInterviewType(c.env.DB, user.company_id, body)
  return c.json(apiResponse(interviewType), 201)
})

// PATCH /api/interview-types/:id — partial update
router.patch('/:id', zValidator('json', createInterviewTypeSchema.partial()), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user')
  const interviewType = await updateInterviewType(c.env.DB, c.req.param('id'), user.company_id, body)
  if (!interviewType) {
    throw new AppError('Interview type not found', 404)
  }
  return c.json(apiResponse(interviewType))
})

// DELETE /api/interview-types/:id — delete an interview type
router.delete('/:id', async (c) => {
  const user = c.get('user')
  const deleted = await deleteInterviewType(c.env.DB, c.req.param('id'), user.company_id)
  if (!deleted) {
    throw new AppError('Interview type not found', 404)
  }
  return c.json(apiResponse({ deleted: true }))
})

export default router
