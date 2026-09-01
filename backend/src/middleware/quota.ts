import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'
import { assertQuotaAvailable, buildQuotaConfig } from '../services/budget/quotas'

/**
 * Fail fast when a Cloudflare free-tier daily allowance is spent, rather than
 * letting D1/KV return their own opaque errors mid-handler.
 *
 * Exempt paths mirror the rate limiter's: /health must stay answerable so
 * uptime checks can still tell you the Worker is alive while quota-blocked.
 */
export const quotaMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === '/health') return next()

  await assertQuotaAvailable(c.env.DB, buildQuotaConfig(c.env))
  await next()
})
