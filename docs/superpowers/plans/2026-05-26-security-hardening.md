# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all OWASP Top-10 and XSS/CSRF vulnerabilities found in the production audit before any paying tenant can access the system.

**Architecture:** HTML-escape utilities added to the backend, CSP/HSTS/X-Frame headers added to both Next.js and the Worker, CORS locked to an allowlist, Vectorize queries namespaced by company, unsubscribe endpoint hardened against XSS and replay attacks.

**Tech Stack:** Hono (backend), Next.js 14 App Router (frontend), Cloudflare Workers, `hono/html` escaping, `next.config.mjs` headers API.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/src/utils/html.ts` | `escapeHtml()` and `safeHref()` utility |
| Modify | `backend/src/services/email/templates/magic-link.ts` | Escape all user-controlled vars |
| Modify | `backend/src/services/email/templates/interview-scheduled.ts` | Escape all user-controlled vars |
| Modify | `backend/src/services/email/templates/resume-uploaded.ts` | Escape all user-controlled vars |
| Modify | `backend/src/services/email/templates/feedback-reminder.ts` | Escape all user-controlled vars |
| Modify | `backend/src/services/email/templates/interview-reminder.ts` | Escape all user-controlled vars |
| Modify | `backend/src/routes/email.ts` | Fix unsubscribe XSS + one-time token + replay protection |
| Modify | `backend/src/middleware/cors.ts` | Allowlist-only CORS, no localhost in production |
| Modify | `backend/src/services/embeddings/vectorize.ts` | Add `companyId` filter to all queries |
| Modify | `backend/src/db/queries/users.ts` | Add `company_id` to `findUserByEmail` |
| Modify | `backend/src/routes/interviews.ts` | Use scoped user lookup |
| Modify | `frontend/next.config.mjs` | Add CSP, HSTS, X-Frame-Options, Referrer-Policy |
| Modify | `backend/src/index.ts` | Add security headers middleware for HTML Worker responses |
| Modify | `backend/wrangler.toml` | Gate localhost CORS on ENVIRONMENT |

---

### Task 1: HTML escaping utility

**Files:**
- Create: `backend/src/utils/html.ts`

- [ ] **Step 1: Create the file**

```typescript
// backend/src/utils/html.ts

/**
 * Escape characters that would break HTML context.
 * Must be applied to every user-controlled value interpolated into HTML.
 */
export function escapeHtml(raw: unknown): string {
  const str = raw == null ? '' : String(raw)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validate and return a safe https:// URL.
 * Returns '#' for anything that isn't a valid https URL.
 */
export function safeHref(raw: unknown): string {
  const str = raw == null ? '' : String(raw).trim()
  try {
    const url = new URL(str)
    if (url.protocol !== 'https:') return '#'
    return url.toString()
  } catch {
    return '#'
  }
}
```

- [ ] **Step 2: Run typecheck to confirm no issues**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```
Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/utils/html.ts
git commit -m "feat: add escapeHtml and safeHref security utilities"
```

---

### Task 2: Escape all email templates

**Files:**
- Modify: `backend/src/services/email/templates/magic-link.ts`
- Modify: `backend/src/services/email/templates/interview-scheduled.ts`
- Modify: `backend/src/services/email/templates/resume-uploaded.ts`
- Modify: `backend/src/services/email/templates/feedback-reminder.ts`
- Modify: `backend/src/services/email/templates/interview-reminder.ts`

- [ ] **Step 1: Update magic-link.ts**

Open `backend/src/services/email/templates/magic-link.ts`. Add import at top:
```typescript
import { escapeHtml, safeHref } from '../../utils/html'
```

Replace every `${data.candidateName}`, `${data.jobTitle}`, `${data.recruiterName}`, `${data.companyName}`, `${data.interviewerName}`, `${data.interviewType}` with `${escapeHtml(data.candidateName)}` etc.

Replace every `href="${data.interviewLink}"` with `href="${safeHref(data.interviewLink)}"`.

The pattern: anywhere a template literal reads `data.<anything>` inside HTML, wrap it with `escapeHtml()`. Anywhere it reads inside `href="..."` or `src="..."`, use `safeHref()`.

- [ ] **Step 2: Apply the same pattern to interview-scheduled.ts**

Add the same import. Escape: `data.candidateName`, `data.jobTitle`, `data.recruiterName`, `data.companyName`, `data.interviewType`, `data.scheduledAt`, `data.location`, `data.notes`. Apply `safeHref()` to `data.videoLink`, `data.calendarLink`.

- [ ] **Step 3: Apply to resume-uploaded.ts**

Escape: `data.candidateName`, `data.jobTitle`, `data.overallScore`, `data.recruiterName`, `data.companyName`. Apply `safeHref()` to dashboard links.

- [ ] **Step 4: Apply to feedback-reminder.ts and interview-reminder.ts**

Same pattern. Identify every `data.*` in template literals and wrap with `escapeHtml()`. URL fields get `safeHref()`.

- [ ] **Step 5: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```
Expected: no output

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/services/email/templates/
git commit -m "security: escape all user-controlled values in email templates (XSS C11)"
```

---

### Task 3: Fix unsubscribe endpoint — XSS + one-time token + replay protection

**Files:**
- Modify: `backend/src/routes/email.ts`

The current endpoint at `GET /api/email/unsubscribe?token=...` renders `${token}` raw into HTML (C10). The POST has no replay protection (C9).

- [ ] **Step 1: Add import and constants at top of email.ts**

```typescript
import { escapeHtml } from '../utils/html'
```

- [ ] **Step 2: Replace the GET handler HTML rendering**

Find the section that returns HTML for the unsubscribe page. Replace every occurrence of `${token}` inside HTML string literals with `${escapeHtml(token)}`.

Also add a Content-Security-Policy header to this response:

```typescript
// In the GET /unsubscribe handler, change the return to:
return new Response(html, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
  },
})
```

- [ ] **Step 3: Add replay protection to POST handler**

Add a KV check to prevent the same unsubscribe token from being replayed:

```typescript
// At the start of the POST /unsubscribe handler, after validating the token:
const replayKey = `unsub_used:${token}`
const alreadyUsed = await c.env.KV_CACHE.get(replayKey)
if (alreadyUsed) {
  return new Response('This unsubscribe link has already been used.', {
    status: 400,
    headers: { 'Content-Type': 'text/plain' },
  })
}
// After successful unsubscribe, mark token as used (TTL = 90 days):
await c.env.KV_CACHE.put(replayKey, '1', { expirationTtl: 7776000 })
```

- [ ] **Step 4: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/routes/email.ts src/utils/html.ts
git commit -m "security: fix reflected XSS in unsubscribe endpoint + replay protection (C9, C10)"
```

---

### Task 4: CORS production lockdown

**Files:**
- Modify: `backend/src/middleware/cors.ts`

- [ ] **Step 1: Read the current cors.ts**

Open `backend/src/middleware/cors.ts` and understand the current logic.

- [ ] **Step 2: Replace with allowlist-gated logic**

```typescript
import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/bindings'

const ALLOWED_ORIGINS = new Set([
  'https://synthire-frontend.pages.dev',
  // Add custom domain when configured:
  // 'https://app.synthire.io',
])

function isAllowedOrigin(origin: string, env: Env): boolean {
  // Only allow localhost bypass in non-production environments
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
```

- [ ] **Step 3: Update ALLOWED_ORIGINS to include your actual production domain**

In `wrangler.toml`, ensure `FRONTEND_ORIGIN = "https://synthire-frontend.pages.dev"` is set in `[env.production.vars]`. The middleware reads the env to determine production mode.

- [ ] **Step 4: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 5: Test locally — confirm CORS still works from localhost:3000**

With `wrangler dev` running, make a request from the frontend. Should return CORS headers. Confirm a request from a random origin gets no CORS headers.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/middleware/cors.ts
git commit -m "security: allowlist-only CORS, no localhost bypass in production (C4)"
```

---

### Task 5: Vectorize tenant isolation

**Files:**
- Modify: `backend/src/services/embeddings/vectorize.ts`

- [ ] **Step 1: Read the current vectorize.ts**

Open `backend/src/services/embeddings/vectorize.ts`.

- [ ] **Step 2: Add companyId filter to queryEmbedding**

Find the `queryEmbedding` / `querySimilar` function. It currently calls `VECTORIZE.query(vector, { topK, ... })`. Change it to always pass a metadata filter:

```typescript
export async function queryEmbedding(
  vectorize: Vectorize,
  vector: number[],
  topK: number,
  companyId: string,
): Promise<VectorizeMatches> {
  return vectorize.query(vector, {
    topK,
    returnMetadata: 'all',
    filter: { companyId },
  })
}
```

- [ ] **Step 3: Update all call sites**

Search for all callers of `queryEmbedding` / `querySimilar` (in `services/scoring/pipeline.ts` and anywhere else). Pass `companyId` from the surrounding context (it's always available from the authenticated user's `company_id`).

- [ ] **Step 4: Add the metadata index in wrangler.toml documentation comment**

Add a comment in `wrangler.toml` near the `[[vectorize]]` section:
```toml
# IMPORTANT: Before first production deploy, create the companyId metadata index:
# wrangler vectorize create-metadata-index synthire-embeddings --property-name=companyId --type=string
```

- [ ] **Step 5: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/services/embeddings/vectorize.ts wrangler.toml
git commit -m "security: enforce companyId filter on all Vectorize queries (H27)"
```

---

### Task 6: User lookup company isolation

**Files:**
- Modify: `backend/src/db/queries/users.ts`
- Modify: `backend/src/routes/interviews.ts`

- [ ] **Step 1: Add scoped lookup to users.ts**

Open `backend/src/db/queries/users.ts`. Add a new function:

```typescript
export async function findUserByEmailInCompany(
  db: D1Database,
  email: string,
  companyId: string,
): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND company_id = ?')
    .bind(email, companyId)
    .first()
  return row ? toUser(row) : null
}
```

- [ ] **Step 2: Replace findUserByEmail in interviews.ts**

In `backend/src/routes/interviews.ts`, find where `findUserByEmail` is called to look up the interviewer. Replace with `findUserByEmailInCompany(c.env.DB, interviewerEmail, user.company_id)`.

Remove the subsequent cross-company check (it's now enforced at SQL level).

- [ ] **Step 3: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/db/queries/users.ts src/routes/interviews.ts
git commit -m "security: company-scoped user lookup prevents cross-tenant email enumeration (H5)"
```

---

### Task 7: Security headers — Next.js

**Files:**
- Modify: `frontend/next.config.mjs` (or `next.config.ts` — check which exists)

- [ ] **Step 1: Check what config file exists**

```bash
ls /Users/newpage/Documents/TS_CF_Hackathon/frontend/next.config*
```

- [ ] **Step 2: Add security headers**

Open the config file. Add a `headers()` export. If the file currently uses `const nextConfig = { ... }`, add the headers function:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Content-Security-Policy',
            // nonce-based CSP would be ideal but requires middleware integration;
            // this permissive policy blocks the most dangerous vectors
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next.js dev; tighten in prod
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'} https://api.synthire.io`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
  // keep existing config options here
}

export default nextConfig
```

- [ ] **Step 3: Verify Next.js builds without errors**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && git add next.config.mjs
git commit -m "security: add CSP, HSTS, X-Frame-Options, Referrer-Policy headers (H20)"
```

---

### Task 8: React Error Boundaries

**Files:**
- Create: `frontend/app/(recruiter)/error.tsx`
- Create: `frontend/app/(interviewer)/error.tsx`
- Create: `frontend/app/global-error.tsx`

- [ ] **Step 1: Create recruiter error boundary**

```typescript
// frontend/app/(recruiter)/error.tsx
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
    console.error('[RecruiterError]', error)
  }, [error])

  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '8px 20px',
          borderRadius: 8,
          background: 'var(--primary-3)',
          color: '#fff',
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

- [ ] **Step 2: Create interviewer error boundary**

Same content, different path:
```typescript
// frontend/app/(interviewer)/error.tsx
'use client'
// ... identical to above
```

- [ ] **Step 3: Create global error boundary**

```typescript
// frontend/app/global-error.tsx
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
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui', padding: 48, textAlign: 'center' }}>
        <h1>Synthire — Something went wrong</h1>
        <p>{error.message}</p>
        <button onClick={reset}>Reload</button>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && npm run typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend
git add app/\(recruiter\)/error.tsx app/\(interviewer\)/error.tsx app/global-error.tsx
git commit -m "feat: add React error boundaries for all route segments (H21)"
```

---

### Task 9: JWT hardening — iss, aud, clock tolerance

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Add iss and aud claims on sign**

In `backend/src/routes/auth.ts`, find the `new SignJWT({ ... }).sign(secret)` call. Add:
```typescript
new SignJWT({
  sub: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  company_id: user.company_id,
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setIssuer('https://api.synthire.io')      // <-- add
  .setAudience('https://app.synthire.io')     // <-- add
  .setExpirationTime(`${env.JWT_EXPIRY_SECONDS ?? 86400}s`)
  .sign(secret)
```

- [ ] **Step 2: Verify iss and aud on every request**

In `backend/src/middleware/auth.ts`, update `jwtVerify` call:
```typescript
const { payload } = await jwtVerify(token, secret, {
  issuer: 'https://api.synthire.io',
  audience: 'https://app.synthire.io',
  clockTolerance: 5, // 5-second tolerance for clock skew
})
```

- [ ] **Step 3: Validate JWT_SECRET length at startup**

In `backend/src/index.ts`, add a startup check:
```typescript
// After the app declaration, before route mounting:
if (!app.env?.JWT_SECRET || app.env.JWT_SECRET.length < 32) {
  // Can't validate env here easily in Hono; add to auth middleware instead
}
```

Better: add to `auth.ts` middleware at the top:
```typescript
const secret = c.env.JWT_SECRET
if (!secret || secret.length < 32) {
  throw new AppError('Server misconfiguration: JWT_SECRET too short', 500)
}
```

- [ ] **Step 4: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/routes/auth.ts src/middleware/auth.ts
git commit -m "security: add iss/aud claims + clock tolerance + JWT_SECRET length guard (C2)"
```

---

### Task 10: Per-account login rate limiting

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Add per-email rate limit to login handler**

In the `POST /login` handler, before calling `getUserByEmail`, add:

```typescript
const emailKey = `rl:login:${body.email.toLowerCase()}`
const raw = await c.env.KV_CACHE.get(emailKey)
const attempts = raw ? parseInt(raw, 10) : 0

if (attempts >= 5) {
  throw new AppError('Too many login attempts. Try again in 1 minute.', 429)
}

// After a failed password check:
// (in the "invalid credentials" branch)
await c.env.KV_CACHE.put(emailKey, String(attempts + 1), { expirationTtl: 60 })
throw new AppError('Invalid email or password', 401)

// After successful login, clear the counter:
await c.env.KV_CACHE.delete(emailKey)
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/routes/auth.ts
git commit -m "security: per-account login rate limit 5/min (H3)"
```

---

### Task 11: Email normalization — prevent duplicate accounts

**Files:**
- Modify: `backend/src/db/queries/users.ts`
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Normalize email to lowercase in createUser and getUserByEmail**

In `backend/src/db/queries/users.ts`:
```typescript
// In createUser:
email: data.email.trim().toLowerCase(),

// In getUserByEmail:
.prepare('SELECT * FROM users WHERE email = lower(?)')
.bind(email.trim())
```

- [ ] **Step 2: Normalize in signup and login routes**

In `backend/src/routes/auth.ts`, after Zod parsing:
```typescript
const normalizedEmail = body.email.trim().toLowerCase()
// Use normalizedEmail everywhere instead of body.email
```

- [ ] **Step 3: Write a DB migration to add COLLATE NOCASE and normalize existing data**

Create `backend/src/db/migrations/0005_email_normalize.sql`:
```sql
-- Normalize existing emails to lowercase
UPDATE users SET email = lower(email);

-- Re-create the unique index with case-insensitivity
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX idx_users_email ON users(lower(email));
```

- [ ] **Step 4: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/db/queries/users.ts src/routes/auth.ts src/db/migrations/0005_email_normalize.sql
git commit -m "fix: normalize emails to lowercase, prevent duplicate accounts (H4)"
```

---

### Task 12: Exempt webhook from rate limiter

**Files:**
- Modify: `backend/src/middleware/rate-limit.ts`

- [ ] **Step 1: Add path exclusions to rate-limit middleware**

Open `backend/src/middleware/rate-limit.ts`. At the start of the middleware handler, add:

```typescript
// Don't rate-limit webhook callbacks or health checks — they come from known infra IPs
const path = new URL(c.req.url).pathname
if (path === '/api/email/resend-callback' || path === '/health') {
  return next()
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck 2>&1 | grep "^src/"
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/middleware/rate-limit.ts
git commit -m "fix: exempt webhook and health endpoints from rate limiter (M16)"
```

---

### Final typecheck and summary

- [ ] **Run full typecheck on both projects**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run typecheck 2>&1 | grep "^src/"
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && npm run typecheck 2>&1 | tail -5
```

Both must return zero errors.

- [ ] **Audit what was fixed**

| Issue | Status |
|-------|--------|
| C4: CORS localhost in production | Fixed — Task 4 |
| C9: CSRF on unsubscribe | Fixed — Task 3 |
| C10: XSS in unsubscribe | Fixed — Task 3 |
| C11: XSS in email templates | Fixed — Task 2 |
| C2: JWT iss/aud/clock | Fixed — Task 9 |
| H3: Per-account login rate limit | Fixed — Task 10 |
| H4: Email normalization | Fixed — Task 11 |
| H5: Cross-tenant user lookup | Fixed — Task 6 |
| H20: CSP/HSTS/X-Frame headers | Fixed — Task 7 |
| H21: React Error Boundaries | Fixed — Task 8 |
| H27: Vectorize tenant isolation | Fixed — Task 5 |
| M16: Webhook rate-limit exemption | Fixed — Task 12 |
