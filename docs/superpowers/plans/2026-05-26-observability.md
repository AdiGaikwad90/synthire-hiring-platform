# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured JSON request logging, Sentry error tracking via toucan-js, React error boundaries, and a hardened health check endpoint to Synthire.

**Architecture:** The backend gains a Hono logger middleware (stdout → Cloudflare Logpush) and a Toucan-based Sentry integration wired into the global error handler and the scheduled cron. The frontend gains Next.js App Router `error.tsx` boundaries at the recruiter layout, interviewer layout, and root levels. The existing `/health` inline handler is extracted into its own route file and extended to probe D1 and KV liveness.

**Tech Stack:** Hono middleware, toucan-js (Sentry SDK for CF Workers), Next.js 14 App Router error boundaries, Cloudflare D1/KV, `crypto.randomUUID()`

---

## File Map

| Action  | File |
|---------|------|
| Create  | `backend/src/middleware/logger.ts` |
| Modify  | `backend/src/index.ts` |
| Modify  | `backend/src/middleware/error.ts` |
| Modify  | `backend/src/types/bindings.ts` |
| Create  | `backend/src/services/monitoring/sentry.ts` |
| Create  | `frontend/app/(recruiter)/error.tsx` |
| Create  | `frontend/app/(interviewer)/error.tsx` |
| Create  | `frontend/app/global-error.tsx` |
| Create  | `backend/src/routes/health.ts` |

---

### Task 1: Structured request logging middleware

**Files:**
- Create: `backend/src/middleware/logger.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create the logger middleware**

Create `backend/src/middleware/logger.ts`:

```typescript
import type { MiddlewareHandler } from 'hono'
import type { Env } from '../types/bindings'

export const loggerMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)

  const start = Date.now()
  let errorMessage: string | null = null

  try {
    await next()
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    const user = c.get('user') as { sub?: string; company_id?: string } | undefined
    const logLine = {
      ts: new Date().toISOString(),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res?.status ?? 0,
      ms: Date.now() - start,
      requestId,
      userId: user?.sub ?? null,
      companyId: user?.company_id ?? null,
      error: errorMessage,
    }
    console.log(JSON.stringify(logLine))
  }
}
```

- [ ] **Step 2: Wire the logger into index.ts before all routes**

In `backend/src/index.ts`, add the import and `app.use('*', loggerMiddleware)` as the FIRST middleware (before cors and rate-limit):

```typescript
import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { rateLimitMiddleware } from './middleware/rate-limit'
import { loggerMiddleware } from './middleware/logger'
import type { Env } from './types/bindings'
import { processEmailQueue } from './services/email/queue'

// Route imports (implemented in later phases)
import authRoutes from './routes/auth'
import jobRoutes from './routes/jobs'
import candidateRoutes from './routes/candidates'
import interviewRoutes from './routes/interviews'
import interviewTypeRoutes from './routes/interview-types'
import analyticsRoutes from './routes/analytics'
import emailRoutes from './routes/email'
import settingsRoutes from './routes/settings'

const app = new Hono<{ Bindings: Env }>()

// Global middleware — logger MUST be first so every request is timed
app.use('*', loggerMiddleware)
app.use('*', corsMiddleware)
app.use('/api/*', rateLimitMiddleware)
app.onError(errorHandler)
```

Leave the rest of `index.ts` unchanged (routes, health check, export).

- [ ] **Step 3: Verify typecheck passes**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run typecheck
```

Expected: 0 errors in `src/`. Duplicate-identifier warnings from `node_modules` are harmless — ignore them.

- [ ] **Step 4: Smoke-test locally**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run dev
```

In a second terminal:

```bash
curl -s http://localhost:8787/health
```

The wrangler terminal should print a JSON line like:
```json
{"ts":"...","method":"GET","path":"/health","status":200,"ms":3,"requestId":"...","userId":null,"companyId":null,"error":null}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add backend/src/middleware/logger.ts backend/src/index.ts
git commit -m "feat: add structured JSON request logging middleware"
```

---

### Task 2: Sentry error tracking via toucan-js

**Files:**
- Create: `backend/src/services/monitoring/sentry.ts`
- Modify: `backend/src/types/bindings.ts`
- Modify: `backend/src/middleware/error.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Install toucan-js**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm install toucan-js
```

Expected: package added to `package.json` and `node_modules/toucan-js` exists.

- [ ] **Step 2: Create the Sentry factory helper**

Create `backend/src/services/monitoring/sentry.ts`:

```typescript
import Toucan from 'toucan-js'

export function createSentry(
  request: Request,
  ctx: ExecutionContext,
  dsn: string
): Toucan {
  return new Toucan({
    dsn,
    context: ctx,
    request,
    tracesSampleRate: 0.1,
  })
}
```

- [ ] **Step 3: Add SENTRY_DSN to the Env interface**

Open `backend/src/types/bindings.ts`. In the `// ── Secrets` block, add `SENTRY_DSN` as an optional string after `RESEND_WEBHOOK_SECRET`:

```typescript
  // ── Secrets (.dev.vars locally / wrangler secret put in production) ────────
  JWT_SECRET: string
  RESEND_API_KEY: string
  RESEND_WEBHOOK_SECRET: string
  SENDGRID_API_KEY: string
  SENTRY_DSN?: string
```

- [ ] **Step 4: Capture unhandled errors in the global error handler**

Open `backend/src/middleware/error.ts`. The current handler logs errors but never sends them to Sentry. Update it so that for non-`AppError`, non-`ZodError` exceptions (i.e. the 500 branch), it conditionally reports to Sentry when `SENTRY_DSN` is set.

Replace the bottom of the handler (the `console.error` + 500 return block) with:

```typescript
  // Unknown errors — report to Sentry if configured
  if (c.env?.SENTRY_DSN) {
    const { createSentry } = await import('../services/monitoring/sentry')
    const sentry = createSentry(c.req.raw, c.executionCtx, c.env.SENTRY_DSN)
    sentry.setUser({ id: (c.get('user') as { sub?: string } | undefined)?.sub })
    sentry.captureException(err)
  }

  console.error(`[error] request_id=${request_id}`, err)
  return c.json(
    {
      success: false,
      data: null,
      error: 'Internal server error',
      timestamp,
      request_id,
    },
    500
  )
```

The full updated `error.ts` should look like this:

```typescript
import type { ErrorHandler } from 'hono'
import { ZodError } from 'zod'
import { AppError } from '../types/api'
import type { Env } from '../types/bindings'
import { nanoid } from 'nanoid'

export const errorHandler: ErrorHandler<{ Bindings: Env }> = async (err, c) => {
  // Ensure CORS headers are present on error responses — middleware headers
  // are not inherited by onError responses in Hono.
  const requestOrigin = c.req.header('Origin') || ''
  const configured = c.env?.FRONTEND_ORIGIN || 'http://localhost:3000'
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)
  c.header('Access-Control-Allow-Origin', isLocalhost ? requestOrigin : configured)
  c.header('Vary', 'Origin')

  const timestamp = new Date().toISOString()
  const request_id = nanoid(12)

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        data: null,
        error: err.message,
        details: err.details ?? null,
        timestamp,
        request_id,
      },
      err.statusCode as Parameters<typeof c.json>[1]
    )
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        data: null,
        error: 'Validation failed',
        details: err.flatten(),
        timestamp,
        request_id,
      },
      422
    )
  }

  // Unknown errors — report to Sentry if configured
  if (c.env?.SENTRY_DSN) {
    const { createSentry } = await import('../services/monitoring/sentry')
    const sentry = createSentry(c.req.raw, c.executionCtx, c.env.SENTRY_DSN)
    sentry.setUser({ id: (c.get('user') as { sub?: string } | undefined)?.sub })
    sentry.captureException(err)
  }

  console.error(`[error] request_id=${request_id}`, err)
  return c.json(
    {
      success: false,
      data: null,
      error: 'Internal server error',
      timestamp,
      request_id,
    },
    500
  )
}
```

Note: `errorHandler` must now be `async` because of the dynamic import. Update the export signature from `(err, c) =>` to `async (err, c) =>`.

- [ ] **Step 5: Wrap the scheduled cron handler with Sentry**

Open `backend/src/index.ts`. Replace the `scheduled` handler so exceptions are captured:

```typescript
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    try {
      await processEmailQueue(env)
    } catch (err) {
      if (env.SENTRY_DSN) {
        const { createSentry } = await import('./services/monitoring/sentry')
        // scheduled events have no Request — pass a synthetic one
        const syntheticRequest = new Request('https://worker/cron/email-queue')
        const sentry = createSentry(syntheticRequest, ctx, env.SENTRY_DSN)
        sentry.captureException(err)
      }
      console.error('[cron] processEmailQueue failed', err)
    }
  },
}
```

- [ ] **Step 6: Verify typecheck passes**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run typecheck
```

Expected: 0 errors in `src/`.

- [ ] **Step 7: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add backend/src/services/monitoring/sentry.ts \
        backend/src/types/bindings.ts \
        backend/src/middleware/error.ts \
        backend/src/index.ts \
        backend/package.json \
        backend/package-lock.json
git commit -m "feat: add Sentry error tracking via toucan-js"
```

---

### Task 3: React Error Boundaries (frontend)

**Files:**
- Create: `frontend/app/(recruiter)/error.tsx`
- Create: `frontend/app/(interviewer)/error.tsx`
- Create: `frontend/app/global-error.tsx`

- [ ] **Step 1: Create the recruiter error boundary**

Create `frontend/app/(recruiter)/error.tsx`:

```typescript
'use client'

import { useEffect } from 'react'

export default function RecruiterError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[recruiter error boundary]', error)
  }, [error])

  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        minHeight: '60vh',
        justifyContent: 'center',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ color: 'var(--muted-foreground)', maxWidth: 400 }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          padding: '8px 20px',
          borderRadius: 6,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Try again
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create the interviewer error boundary**

Create `frontend/app/(interviewer)/error.tsx` with the same structure (the interviewer shell is a separate layout segment so it needs its own boundary):

```typescript
'use client'

import { useEffect } from 'react'

export default function InterviewerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[interviewer error boundary]', error)
  }, [error])

  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        minHeight: '60vh',
        justifyContent: 'center',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ color: 'var(--muted-foreground)', maxWidth: 400 }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          padding: '8px 20px',
          borderRadius: 6,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Try again
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create the root global-error boundary**

`global-error.tsx` replaces the entire root layout on crash — it must supply its own `<html>` and `<body>` tags.

Create `frontend/app/global-error.tsx`:

```typescript
'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global error boundary]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#0a0a0a',
          color: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
            Application error
          </h1>
          <p style={{ color: '#a1a1aa', marginBottom: 24, maxWidth: 400 }}>
            {error.message}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              borderRadius: 6,
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add frontend/app/\(recruiter\)/error.tsx \
        frontend/app/\(interviewer\)/error.tsx \
        frontend/app/global-error.tsx
git commit -m "feat: add React error boundaries for recruiter, interviewer, and root layouts"
```

---

### Task 4: Health check endpoint hardening

**Files:**
- Create: `backend/src/routes/health.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create the health route file**

Create `backend/src/routes/health.ts`:

```typescript
import { Hono } from 'hono'
import type { Env } from '../types/bindings'

const router = new Hono<{ Bindings: Env }>()

router.get('/', async (c) => {
  const checks: { db: boolean; kv: boolean; uptime: number } = {
    db: false,
    kv: false,
    uptime: Date.now(),
  }

  try {
    await c.env.DB.prepare('SELECT 1').first()
    checks.db = true
  } catch {
    // db unreachable — checks.db stays false
  }

  try {
    await c.env.KV_CACHE.get('health_ping')
    checks.kv = true
  } catch {
    // kv unreachable — checks.kv stays false
  }

  const healthy = checks.db && checks.kv
  return c.json({ ok: healthy, checks }, healthy ? 200 : 503)
})

export default router
```

- [ ] **Step 2: Replace the inline health handler in index.ts with the new route**

Open `backend/src/index.ts`. Remove this block:

```typescript
// Health check
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'synthire-backend',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  })
)
```

Add the import at the top with the other route imports:

```typescript
import healthRoutes from './routes/health'
```

Add the route mount in the route section (before the export):

```typescript
app.route('/health', healthRoutes)
```

The final route section of `index.ts` should read:

```typescript
// Public routes
app.route('/api/auth', authRoutes)

// Protected routes — authMiddleware is registered INSIDE each route file
app.route('/api/jobs', jobRoutes)
app.route('/api/candidates', candidateRoutes)
app.route('/api/interviews', interviewRoutes)
app.route('/api/interview-types', interviewTypeRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/settings', settingsRoutes)

// Health check — no auth required
app.route('/health', healthRoutes)
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run typecheck
```

Expected: 0 errors in `src/`.

- [ ] **Step 4: Smoke-test the hardened health endpoint locally**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run dev
```

In a second terminal:

```bash
curl -s http://localhost:8787/health | jq .
```

Expected (D1 + KV reachable in local dev):

```json
{
  "ok": true,
  "checks": {
    "db": true,
    "kv": true,
    "uptime": 1748000000000
  }
}
```

HTTP status should be `200`. If `db` or `kv` is `false`, the status will be `503`.

- [ ] **Step 5: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add backend/src/routes/health.ts backend/src/index.ts
git commit -m "feat: harden /health endpoint with D1 and KV liveness checks"
```
