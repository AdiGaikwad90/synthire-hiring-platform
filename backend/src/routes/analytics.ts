import { Hono } from 'hono'
import type { Env } from '../types/bindings'
import { requireRecruiter } from '../middleware/authorize'
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
import { buildR2LimitConfig } from '../services/storage/r2'
import { buildQuotaConfig, getQuotaSnapshot } from '../services/budget/quotas'

const router = new Hono<{ Bindings: Env }>()

// All analytics routes require authentication...
router.use('*', authMiddleware)

// ...and every one of them reports company-wide hiring data, so the whole
// router is recruiter/admin only. MUST come after authMiddleware — c.get('user')
// is not populated before it. Guarding the router rather than each route is why
// /funnel, /time-to-hire, /summary, /activity and /sources cannot be missed
// again: a new endpoint added below inherits the guard automatically.
router.use('*', async (c, next) => {
  requireRecruiter(c.get('user'))
  await next()
})

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

  const usage = await getR2Usage(c.env.KV_CACHE, buildR2LimitConfig(c.env))
  return c.json(apiResponse(usage))
})

// GET /api/analytics/quota-usage  (recruiter/admin only — D1 + KV daily quotas)
router.get('/quota-usage', async (c) => {
  // No per-route guard needed — the router-level requireRecruiter covers it.
  const snapshot = await getQuotaSnapshot(c.env.DB, buildQuotaConfig(c.env))
  return c.json(apiResponse(snapshot))
})

export default router
