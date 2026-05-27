# Plan D: Performance, Scalability & Observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform handle real SaaS load without degrading — add database indexes, fix N+1 queries, enforce per-tenant AI quota limits, expose real-time observability via `/health` enhancements and Sentry, and add audit logging so every data mutation is traceable.

**Architecture:** All performance changes are in the Cloudflare Workers backend. No new external services needed — use D1 composite indexes, KV for per-tenant rate counters, existing Workers AI for cost tracking, and Sentry for error tracking. Audit log writes to a new D1 table via the existing query pattern.

**Tech Stack:** D1 (SQLite composite indexes + triggers), KV (per-tenant counters), Sentry (`@sentry/cloudflare`), Hono middleware

---

## Files Modified / Created

| File | Change |
|------|--------|
| `backend/src/db/migrations/0011_indexes.sql` | NEW — composite indexes for high-traffic query patterns |
| `backend/src/db/migrations/0012_audit_log.sql` | NEW — `audit_logs` table |
| `backend/src/db/queries/audit.ts` | NEW — `logAudit()` helper |
| `backend/src/db/queries/candidates.ts` | JOIN jobs table to avoid N+1 in listCandidates |
| `backend/src/db/queries/jobs.ts` | JOIN candidate_count subquery into listJobs |
| `backend/src/middleware/neurons.ts` | NEW — per-company Neurons budget middleware |
| `backend/src/routes/health.ts` | Expose Neurons spend, D1 table counts, KV ping |
| `backend/src/routes/candidates.ts` | Apply `neuronsMiddleware` before upload; call `logAudit` on stage change |
| `backend/src/routes/jobs.ts` | Call `logAudit` on create/update/delete |
| `backend/src/routes/interviews.ts` | Call `logAudit` on schedule/feedback |
| `backend/src/index.ts` | Initialize Sentry; add audit log to mutations |
| `backend/src/services/ai/fallback.ts` | Track Neurons spend in KV per company |
| `frontend/components/(recruiter)/Dashboard.tsx` | Wire "Recent activity" to `useActivity()` with actor names |

---

## Task 1: Database indexes for production query patterns

**Files:**
- Create: `backend/src/db/migrations/0011_indexes.sql`

- [ ] **Step 1: Create migration**

```sql
-- backend/src/db/migrations/0011_indexes.sql

-- Primary query pattern: list candidates by company + optional filters
CREATE INDEX IF NOT EXISTS idx_candidates_company_score
  ON candidates(company_id, overall_score DESC)
  WHERE processing_status = 'complete';

CREATE INDEX IF NOT EXISTS idx_candidates_company_status_score
  ON candidates(company_id, status, overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidates_job_score
  ON candidates(job_id, overall_score DESC)
  WHERE processing_status = 'complete';

-- Jobs: list by company + status
CREATE INDEX IF NOT EXISTS idx_jobs_company_status
  ON jobs(company_id, status, created_at DESC);

-- Interviews: list by company + date range
CREATE INDEX IF NOT EXISTS idx_interviews_company_scheduled
  ON interviews(company_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_interviews_interviewer
  ON interviews(interviewer_id, scheduled_at DESC);

-- Email queue: pick up pending items efficiently
CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_queue(status, scheduled_for)
  WHERE status = 'pending';

-- Refresh tokens: lookup by hash
-- (likely already exists from earlier migration — add IF NOT EXISTS to be safe)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
  ON refresh_tokens(token_hash)
  WHERE revoked_at IS NULL;
```

Apply:
```bash
cd backend && wrangler d1 migrations apply synthire-prod --local
```

Expected output: `Applying migration 0011_indexes.sql... Done.`

- [ ] **Step 2: Commit**

```bash
git add backend/src/db/migrations/0011_indexes.sql
git commit -m "perf: add composite indexes for candidate/job/interview query patterns"
```

---

## Task 2: Fix N+1 query — join job title into candidate list

**Files:**
- Modify: `backend/src/db/queries/candidates.ts`

- [ ] **Step 1: Update `listCandidates` SQL to JOIN jobs**

Find the `listCandidates` function and its SQL. Add a LEFT JOIN:

```typescript
const sql = `
  SELECT
    c.*,
    j.title AS job_title
  FROM candidates c
  LEFT JOIN jobs j ON j.id = c.job_id
  WHERE c.company_id = ?
  ${jobId ? 'AND c.job_id = ?' : ''}
  ${status ? 'AND c.status = ?' : ''}
  ${minScore ? 'AND c.overall_score >= ?' : ''}
  ORDER BY c.overall_score DESC
  LIMIT ? OFFSET ?
`
```

Update `toCandidate()` to include `job_title`:
```typescript
return {
  // ...existing fields
  job_title: (row as Record<string, unknown>).job_title as string | undefined,
}
```

Update the `ApiCandidate` type in `frontend/lib/types.ts`:
```typescript
job_title?: string
```

- [ ] **Step 2: Verify the COUNT query also has the fix**

The `COUNT(*)` query before the main select should still be efficient — confirm it doesn't need the join (it shouldn't for counting).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/queries/candidates.ts frontend/lib/types.ts
git commit -m "perf: join job_title into listCandidates to eliminate N+1 query"
```

---

## Task 3: Per-company Neurons budget tracking

**Files:**
- Create: `backend/src/middleware/neurons.ts`
- Modify: `backend/src/services/ai/fallback.ts`

- [ ] **Step 1: Create `neurons.ts` middleware**

```typescript
// backend/src/middleware/neurons.ts
import { createMiddleware } from 'hono/factory'
import { AppError } from '../types/api'
import type { JWTPayload } from '../types/auth'
import type { Env } from '../types/bindings'

const DEFAULT_DAILY_LIMIT = 10000

export const neuronsMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const user = c.get('user') as JWTPayload | undefined
  if (!user) { await next(); return }

  const today = new Date().toISOString().slice(0, 10)
  const key = `neurons:${user.company_id}:${today}`
  const current = parseInt(await c.env.KV_CACHE.get(key) ?? '0')
  const limit = parseInt(c.env.NEURONS_DAILY_LIMIT ?? String(DEFAULT_DAILY_LIMIT))

  if (current >= limit) {
    throw new AppError(
      `Daily AI processing limit reached (${limit.toLocaleString()} neurons). Resets at midnight UTC.`,
      429
    )
  }

  c.set('neurons_key', key)
  c.set('neurons_current', current)
  await next()
})

export async function trackNeuronSpend(env: Env, key: string, amount: number): Promise<void> {
  const current = parseInt(await env.KV_CACHE.get(key) ?? '0')
  await env.KV_CACHE.put(key, String(current + amount), { expirationTtl: 86400 * 2 })
}
```

Update `Env` bindings type to accept the new context variables if needed.

- [ ] **Step 2: Track actual spend in `fallback.ts` after each LLM call**

After a successful model call, estimate spend (Workers AI charges ~1 Neuron per 10 tokens roughly — use `max_tokens` as a proxy):

```typescript
// After successful call:
const estimatedNeurons = parseInt(env.LLM_MAX_TOKENS ?? '2000') / 10
await trackNeuronSpend(env, neuronsKey, estimatedNeurons)
```

- [ ] **Step 3: Apply `neuronsMiddleware` to upload route**

In `candidates.ts`:
```typescript
import { neuronsMiddleware } from '../middleware/neurons'

candidatesRouter.post('/upload', authMiddleware, recruiterOnly, neuronsMiddleware, async (c) => { ... })
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/neurons.ts backend/src/services/ai/fallback.ts \
        backend/src/routes/candidates.ts
git commit -m "feat: per-company daily Neurons budget tracking and enforcement"
```

---

## Task 4: Audit log

**Files:**
- Create: `backend/src/db/migrations/0012_audit_log.sql`
- Create: `backend/src/db/queries/audit.ts`
- Modify: `backend/src/routes/candidates.ts`, `jobs.ts`, `interviews.ts`

- [ ] **Step 1: Create audit_logs table**

```sql
-- backend/src/db/migrations/0012_audit_log.sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,           -- e.g. 'candidate.shortlisted', 'job.created'
  resource_type TEXT NOT NULL,    -- 'candidate', 'job', 'interview'
  resource_id TEXT NOT NULL,
  resource_label TEXT,            -- human-readable label e.g. candidate name
  details TEXT,                   -- JSON string with extra context
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_company_time ON audit_logs(company_id, created_at DESC);
```

Apply:
```bash
cd backend && wrangler d1 migrations apply synthire-prod --local
```

- [ ] **Step 2: Create `audit.ts` helper**

```typescript
// backend/src/db/queries/audit.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { JWTPayload } from '../types/auth'

export interface AuditEntry {
  companyId: string
  userId: string
  userName: string
  action: string
  resourceType: string
  resourceId: string
  resourceLabel?: string
  details?: Record<string, unknown>
}

export async function logAudit(db: D1Database, entry: AuditEntry): Promise<void> {
  await db.prepare(
    `INSERT INTO audit_logs (company_id, user_id, user_name, action, resource_type, resource_id, resource_label, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.companyId,
    entry.userId,
    entry.userName,
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.resourceLabel ?? null,
    entry.details ? JSON.stringify(entry.details) : null
  ).run()
}

export async function getRecentAuditLogs(
  db: D1Database, companyId: string, limit = 20
): Promise<Array<{ id: string; user_name: string; action: string; resource_label: string; created_at: string }>> {
  const result = await db.prepare(
    `SELECT id, user_name, action, resource_label, created_at
     FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(companyId, limit).all()
  return result.results as Array<{ id: string; user_name: string; action: string; resource_label: string; created_at: string }>
}
```

- [ ] **Step 3: Add audit log calls to candidate stage changes**

In `candidates.ts`, in the `PATCH /:id/stage` handler:

```typescript
import { logAudit } from '../db/queries/audit'

const user = c.get('user')
// ... after successful stage update:
await logAudit(db, {
  companyId: user.company_id,
  userId: user.sub,
  userName: user.name,
  action: `candidate.${newStage}`,
  resourceType: 'candidate',
  resourceId: candidateId,
  resourceLabel: candidate.name,
  details: { previousStage: candidate.status, newStage },
})
```

- [ ] **Step 4: Add audit log to job creation**

In `jobs.ts`, after successful `createJob`:
```typescript
await logAudit(db, {
  companyId: user.company_id,
  userId: user.sub,
  userName: user.name,
  action: 'job.created',
  resourceType: 'job',
  resourceId: newJob.id,
  resourceLabel: newJob.title,
})
```

- [ ] **Step 5: Add audit log endpoint to analytics router**

In `analytics.ts`:
```typescript
analyticsRouter.get('/activity', authMiddleware, async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const logs = await getRecentAuditLogs(db, user.company_id, 20)
  return c.json(apiResponse(logs))
})
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/0012_audit_log.sql \
        backend/src/db/queries/audit.ts \
        backend/src/routes/candidates.ts \
        backend/src/routes/jobs.ts \
        backend/src/routes/analytics.ts
git commit -m "feat: audit log table + hooks on candidate/job mutations"
```

---

## Task 5: Enhanced health check

**Files:**
- Modify: `backend/src/routes/health.ts`

- [ ] **Step 1: Expand `/health` to expose operational metrics**

```typescript
// backend/src/routes/health.ts
import { Hono } from 'hono'
import type { Env } from '../types/bindings'

const healthRouter = new Hono<{ Bindings: Env }>()

healthRouter.get('/', async (c) => {
  const start = Date.now()
  const checks: Record<string, unknown> = {}

  // D1 check
  try {
    const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    checks.d1 = { status: row?.ok === 1 ? 'ok' : 'degraded', latencyMs: Date.now() - start }
  } catch (e) {
    checks.d1 = { status: 'down', error: String(e) }
  }

  // KV check
  try {
    const kvStart = Date.now()
    await c.env.KV_CACHE.put('health:ping', 'pong', { expirationTtl: 60 })
    checks.kv = { status: 'ok', latencyMs: Date.now() - kvStart }
  } catch (e) {
    checks.kv = { status: 'down', error: String(e) }
  }

  // Neurons spend today
  const today = new Date().toISOString().slice(0, 10)
  const globalNeuronKey = `neurons:global:${today}`
  const neuronsToday = parseInt(await c.env.KV_CACHE.get(globalNeuronKey) ?? '0')
  const neuronsLimit = parseInt(c.env.NEURONS_DAILY_LIMIT ?? '10000')

  // Table counts (lightweight)
  const counts: Record<string, number> = {}
  try {
    const [jobs, candidates, users] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first<{ n: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM candidates').first<{ n: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ])
    counts.jobs = jobs?.n ?? 0
    counts.candidates = candidates?.n ?? 0
    counts.users = users?.n ?? 0
  } catch { /* non-fatal */ }

  const allOk = Object.values(checks).every((c: unknown) => (c as { status: string }).status === 'ok')

  return c.json({
    status: allOk ? 'ok' : 'degraded',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT,
    checks,
    neurons: { used: neuronsToday, limit: neuronsLimit, pct: Math.round(neuronsToday / neuronsLimit * 100) },
    counts,
    uptimeMs: Date.now() - start,
  }, allOk ? 200 : 503)
})

export { healthRouter }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/health.ts
git commit -m "feat: expand /health to expose D1/KV latency, Neurons usage, and table counts"
```

---

## Task 6: Sentry error tracking

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Install Sentry SDK**

```bash
cd backend && npm install @sentry/cloudflare
```

- [ ] **Step 2: Initialize Sentry in `index.ts`**

```typescript
import * as Sentry from '@sentry/cloudflare'

// Wrap the fetch handler:
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN ?? '',
    environment: env.ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1, // sample 10% of requests
    beforeSend(event) {
      // Scrub sensitive fields
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }
      return event
    },
  }),
  {
    async fetch(request, env, ctx) {
      return app.fetch(request, env, ctx)
    },
    async scheduled(event, env, ctx) {
      ctx.waitUntil(processEmailQueue(env).catch(err => {
        console.error('[scheduled] processEmailQueue failed', err)
        Sentry.captureException(err)
      }))
    },
  }
)
```

- [ ] **Step 3: Add `SENTRY_DSN` to bindings type**

In `backend/src/types/bindings.ts`:
```typescript
SENTRY_DSN?: string
```

- [ ] **Step 4: Set the secret in production**

```bash
wrangler secret put SENTRY_DSN --env production
# Paste the DSN from sentry.io project settings
```

- [ ] **Step 5: Verify typecheck**

```bash
cd backend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.ts backend/package.json backend/src/types/bindings.ts
git commit -m "feat: integrate Sentry for production error tracking with PII scrubbing"
```

---

## Task 7: Wire activity feed to real audit log

**Files:**
- Modify: `frontend/hooks/queries/useAnalytics.ts`
- Modify: `frontend/components/(recruiter)/Dashboard.tsx`

- [ ] **Step 1: Update `useActivity` to fetch from real endpoint**

In `useAnalytics.ts`, find `useActivity()`. Verify it calls `GET /api/analytics/activity`. If it's hitting a different endpoint or returning mocked data, update to:

```typescript
export function useActivity() {
  return useQuery({
    queryKey: ['analytics', 'activity'],
    queryFn: () => apiFetch<Array<{
      id: string
      user_name: string
      action: string
      resource_label: string
      created_at: string
    }>>('/api/analytics/activity'),
    refetchInterval: 30_000,
  })
}
```

- [ ] **Step 2: Display actor name in activity feed**

In `Dashboard.tsx`, find the activity feed section. Replace generic entries with actor-aware rendering:

```typescript
const { data: activity } = useActivity()

// In JSX:
{(activity ?? []).map(item => {
  const actionLabel: Record<string, string> = {
    'candidate.shortlisted': 'shortlisted',
    'candidate.rejected': 'rejected',
    'candidate.hired': 'hired',
    'job.created': 'created job',
    'interview.scheduled': 'scheduled interview for',
  }
  return (
    <div key={item.id} className="tsActivityItem">
      <span className="tsActivityActor">{item.user_name}</span>
      <span className="tsActivityAction"> {actionLabel[item.action] ?? item.action} </span>
      <span className="tsActivityResource">{item.resource_label}</span>
      <span className="tsActivityTime tsTextMuted">{formatDate(item.created_at)}</span>
    </div>
  )
})}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/queries/useAnalytics.ts frontend/components/(recruiter)/Dashboard.tsx
git commit -m "feat: wire activity feed to real audit log with actor attribution"
```

---

## Verification Checklist

- [ ] `cd backend && npm run typecheck` — 0 errors
- [ ] `wrangler d1 migrations apply synthire-prod --local` runs cleanly through 0012
- [ ] `curl https://<worker>/health` returns `{ "status": "ok", "checks": { "d1": "ok", "kv": "ok" }, "neurons": {...} }`
- [ ] Create a job → check `audit_logs` table has entry with `action = 'job.created'`
- [ ] Shortlist a candidate → audit log shows `candidate.shortlisted` with user name
- [ ] Dashboard activity feed shows "John moved Alice Doe to Shortlisted" style entries
- [ ] Upload 501 resumes from one company (or set `NEURONS_DAILY_LIMIT=3` for test) → 429 on limit
- [ ] Trigger a backend error (bad DB query) → Sentry dashboard shows the event with no auth headers
- [ ] `EXPLAIN QUERY PLAN SELECT * FROM candidates WHERE company_id = ? ORDER BY overall_score DESC` → shows index usage
