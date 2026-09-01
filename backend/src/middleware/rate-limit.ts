import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'
import { AppError } from '../types/api'
import { isGuardrailEnabled } from '../utils/env'

/**
 * Per-IP rate limiting via Cloudflare's native [[ratelimits]] binding.
 *
 * Deliberately NOT KV-backed: a KV counter costs one write per request, and
 * the KV free tier allows only 1,000 writes/day — the limiter would exhaust
 * the account's whole KV budget in 1,000 requests. The native binding keeps
 * counters in the local colo with async replication and bills nothing.
 *
 * Trade-off: counters are per-colo, so the effective global limit is looser
 * than the configured number. That is fine for abuse control, which is what
 * this is for. It is not a billing quota — see middleware/quota.ts for those.
 */

// Endpoints the frontend polls on a short interval. ResumeBatchModal opens one
// 2s poller PER FILE (Dropzone advertises up to 200), and JDUploadModal polls
// parse status the same way, so these would trip any sane limit on their own.
const POLLING_EXEMPT: RegExp[] = [
  /^\/api\/candidates\/[^/]+$/, // GET candidate processing_status
  /^\/api\/jobs\/parse-jd\/[^/]+$/, // GET JD parse status
]

const ALWAYS_EXEMPT = new Set(['/api/email/resend-callback', '/health'])

export const rateLimitMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const path = new URL(c.req.url).pathname

  if (ALWAYS_EXEMPT.has(path)) return next()

  if (c.req.method === 'GET' && POLLING_EXEMPT.some((re) => re.test(path))) {
    return next()
  }

  if (!isGuardrailEnabled(c.env.RATE_LIMIT_ENABLED)) return next()

  // Binding absent (older wrangler.toml, or a test env) — do not hard-fail the
  // API over a missing guardrail, but make the gap visible in logs.
  if (!c.env.RATE_LIMITER) {
    console.warn('[rate-limit] RATE_LIMITER binding missing — rate limiting is OFF')
    return next()
  }

  const ip =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ??
    'unknown'

  const { success } = await c.env.RATE_LIMITER.limit({ key: ip })

  if (!success) {
    c.header('Retry-After', c.env.RATE_LIMIT_WINDOW_SECONDS ?? '60')
    throw new AppError('Rate limit exceeded', 429)
  }

  await next()
})
