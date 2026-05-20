import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'

export const corsMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const allowed = c.env.FRONTEND_ORIGIN

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  await next()

  c.res.headers.set('Access-Control-Allow-Origin', allowed)
  c.res.headers.set('Vary', 'Origin')
})
