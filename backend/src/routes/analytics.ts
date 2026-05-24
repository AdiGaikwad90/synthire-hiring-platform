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
import { getR2Usage } from '../services/storage/r2-limits'

const router = new Hono<{ Bindings: Env }>()

// All analytics routes require authentication
router.use('*', authMiddleware)

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

// GET /api/analytics/r2-usage  (recruiter/admin only — shows R2 storage + op counts)
router.get('/r2-usage', async (c) => {
  const user = c.get('user')
  if (user.role === 'interviewer') {
    throw new AppError('Forbidden: insufficient permissions', 403)
  }

  const config = {
    enabled: (c.env.R2_LIMITS_ENABLED ?? 'true') === 'true',
    maxStorageBytes: parseInt(c.env.R2_MAX_STORAGE_BYTES ?? '10737418240', 10),
    maxClassAOpsMonthly: parseInt(c.env.R2_MAX_CLASS_A_OPS_MONTHLY ?? '900000', 10),
    maxClassBOpsMonthly: parseInt(c.env.R2_MAX_CLASS_B_OPS_MONTHLY ?? '9000000', 10),
  }

  const usage = await getR2Usage(c.env.KV_CACHE, config)
  return c.json(apiResponse(usage))
})

export default router
