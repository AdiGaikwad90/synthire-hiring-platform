import { Hono } from 'hono'
import type { Env } from '../types/bindings'
import { apiResponse, AppError } from '../types/api'
import { authMiddleware } from '../middleware/auth'
import {
  getFunnelData,
  getTimeToHireData,
  getAnalyticsSummary,
  getRecentActivity,
  getEmailStats,
} from '../db/queries/analytics'

const router = new Hono<{ Bindings: Env }>()

// All analytics routes require authentication
router.use('/*', authMiddleware)

// GET /api/analytics/funnel
router.get('/funnel', async (c) => {
  const user = c.get('user')
  const data = await getFunnelData(c.env.DB, user.company_id)
  return c.json(apiResponse(data))
})

// GET /api/analytics/time-to-hire
router.get('/time-to-hire', async (c) => {
  const user = c.get('user')
  const data = await getTimeToHireData(c.env.DB, user.company_id)
  return c.json(apiResponse(data))
})

// GET /api/analytics/summary
router.get('/summary', async (c) => {
  const user = c.get('user')
  const data = await getAnalyticsSummary(c.env.DB, user.company_id)
  return c.json(apiResponse(data))
})

// GET /api/analytics/activity
router.get('/activity', async (c) => {
  const user = c.get('user')
  const data = await getRecentActivity(c.env.DB, user.company_id)
  return c.json(apiResponse(data))
})

// GET /api/analytics/email-stats  (recruiter/admin only)
router.get('/email-stats', async (c) => {
  const user = c.get('user')
  if (user.role === 'interviewer') {
    throw new AppError('Forbidden: insufficient permissions', 403)
  }
  const data = await getEmailStats(c.env.DB, user.company_id)
  return c.json(apiResponse(data))
})

// GET /api/analytics/sources  (placeholder — source tracking not yet implemented)
router.get('/sources', async (c) => {
  return c.json(
    apiResponse([
      { source: 'Direct', count: 0, percentage: 0 },
      { source: 'LinkedIn', count: 0, percentage: 0 },
      { source: 'Referral', count: 0, percentage: 0 },
      { source: 'Job Board', count: 0, percentage: 0 },
    ])
  )
})

export default router
