import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'
import { AppError } from '../types/api'

export const rateLimitMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === '/api/email/resend-callback' || path === '/health') {
    return next()
  }

  if (c.env.RATE_LIMIT_ENABLED !== 'true') {
    return await next()
  }

  const limit = parseInt(c.env.RATE_LIMIT_REQUESTS ?? '100', 10)
  const windowSeconds = parseInt(c.env.RATE_LIMIT_WINDOW_SECONDS ?? '60', 10)

  // Use CF-Connecting-IP (set by Cloudflare) for the rate limit key
  const ip =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ??
    'unknown'

  const window = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `rl:${ip}:${window}`

  const current = await c.env.KV_CACHE.get(key)
  const count = current ? parseInt(current, 10) : 0

  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count - 1)))
  c.header('X-RateLimit-Reset', String((window + 1) * windowSeconds))

  if (count >= limit) {
    c.header('Retry-After', String(windowSeconds))
    throw new AppError('Rate limit exceeded', 429)
  }

  // Increment — TTL is 2× the window so keys self-clean
  await c.env.KV_CACHE.put(key, String(count + 1), { expirationTtl: windowSeconds * 2 })

  await next()
})
