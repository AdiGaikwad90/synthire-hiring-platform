import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'

export const loggerMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId' as never, requestId)
  const start = Date.now()

  await next()

  const ms = Date.now() - start
  const user = c.get('user' as never) as { sub?: string; company_id?: string } | undefined

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    ms,
    userId: user?.sub ?? null,
    companyId: user?.company_id ?? null,
  }))
})
