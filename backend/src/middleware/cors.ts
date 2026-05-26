import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'

const ALLOWED_ORIGINS = new Set([
  'https://synthire-frontend.pages.dev',
  // Add custom domain when configured:
  // 'https://app.synthire.io',
])

function isAllowedOrigin(origin: string, env: Env): boolean {
  if (env.ENVIRONMENT !== 'production') {
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true
  }
  return ALLOWED_ORIGINS.has(origin)
}

export const corsMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = c.req.header('Origin') ?? ''
  const allowed = isAllowedOrigin(origin, c.env)

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    })
  }

  await next()

  if (allowed && origin) {
    c.res.headers.set('Access-Control-Allow-Origin', origin)
    c.res.headers.set('Vary', 'Origin')
  }
})
