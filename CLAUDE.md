# CLAUDE.md — Synthire Codebase Guide

This file is loaded automatically by Claude Code. Read it before making any changes.

---

## What this project is

**Synthire** is an AI-powered ATS (Applicant Tracking System). Two subprojects live side by side:

- `backend/` — Cloudflare Workers API built with Hono
- `frontend/` — Next.js 14 App Router UI

The backend is complete and production-ready. The frontend is fully wired to the backend — no mock data remains in use (though `lib/data.ts` is kept as a demo reference).

---

## Running the project

```bash
# Backend (port 8787)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

Before first run, see **Configuration** below.

---

## Configuration

### Backend — `backend/.dev.vars` (gitignored, copy from `.dev.vars.example`)

```ini
JWT_SECRET=<min 32 chars, generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
RESEND_API_KEY=re_<from resend.com>
RESEND_WEBHOOK_SECRET=<from Resend webhook dashboard>
SENDGRID_API_KEY=SG.<from sendgrid.com>
SENTRY_DSN=<optional, from sentry.io>
```

> Note: OpenRouter is no longer used. LLM calls go through Workers AI directly.

### Backend — `backend/wrangler.toml` (checked in, IDs need filling after provisioning)

Three placeholder values must be replaced after running the provisioning commands:

```toml
[[d1_databases]]
database_id = "REPLACE_WITH_YOUR_DATABASE_ID"   # wrangler d1 create synthire-prod

[[kv_namespaces]]
id = "REPLACE_WITH_YOUR_KV_ID"                   # wrangler kv:namespace create KV_CACHE
preview_id = "REPLACE_WITH_YOUR_KV_PREVIEW_ID"  # wrangler kv:namespace create KV_CACHE --preview
```

### Frontend — `frontend/.env.local` (gitignored)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8787
```

Change to your deployed worker URL when deploying to production.

---

## One-time provisioning (Cloudflare resources)

```bash
wrangler login
wrangler d1 create synthire-prod
wrangler kv:namespace create KV_CACHE
wrangler kv:namespace create KV_CACHE --preview
wrangler r2 bucket create synthire-resumes
wrangler vectorize create synthire-embeddings --dimensions=1024 --metric=cosine
# Required: create companyId metadata index for Vectorize tenant isolation
wrangler vectorize create-metadata-index synthire-embeddings --property-name=companyId --type=string

cd backend
wrangler d1 migrations apply synthire-prod --local
```

---

## Architecture

```
Request → Cloudflare Worker (Hono)
            ├── CORS middleware
            ├── Rate-limit middleware (KV-backed, per-IP)
            ├── Logger middleware (structured JSON)
            ├── Auth middleware (JWT Bearer token via jose)
            ├── Routes → DB queries (D1 prepared statements)
            ├── Resume upload → R2 storage
            │                → PDF/DOCX parse (mammoth/pdf-parse via nodejs_compat)
            │                → Workers AI LLM parse (background via waitUntil)
            │                → Workers AI embeddings → Vectorize upsert
            │                → Scoring pipeline → D1 update
            │                (client polls GET /api/candidates/:id for status)
            └── Cron (every 1 min) → processEmailQueue → SendGrid/Resend API
```

---

## Key files

| File | Purpose |
|---|---|
| `backend/src/index.ts` | Hono app entry, route mounting, scheduled handler |
| `backend/src/types/bindings.ts` | `Env` interface — all Cloudflare bindings + secrets |
| `backend/src/db/migrations/` | D1 schema migrations (0001–0007) |
| `backend/src/services/ai/fallback.ts` | Workers AI fallback chain (Nemotron → Llama) |
| `backend/src/services/scoring/pipeline.ts` | Full candidate scoring orchestrator |
| `backend/src/services/email/queue.ts` | Cron email queue processor (atomic dequeue) |
| `backend/src/services/email/templates/index.ts` | Email template dispatcher |
| `backend/src/middleware/auth.ts` | JWT verify + cookie builders + refresh token helpers |
| `backend/src/middleware/logger.ts` | Structured JSON request logger |
| `backend/src/routes/health.ts` | `GET /health` — probes D1 + KV |
| `frontend/lib/api.ts` | Typed API client — Bearer token + 401 refresh interceptor |
| `frontend/lib/auth.ts` | JWT localStorage + cookie helpers |
| `frontend/context/AuthContext.tsx` | Auth state, login/logout/signup |
| `frontend/middleware.ts` | Route protection via `synthire_token` cookie |
| `frontend/hooks/queries/` | React Query hooks for every API group |

---

## Database (D1)

11 tables — all JSON columns stored as `TEXT` and parsed in query helpers:

- `companies` — one per workspace
- `users` — recruiter / interviewer / admin, scoped to company
- `jobs` — job postings with scoring weights (must sum to 100)
- `candidates` — resume data + AI scores + processing status
- `interview_types` — configurable interview rounds per company
- `interviews` — scheduled interviews with email tracking columns
- `interview_feedback` — per-interviewer feedback per interview
- `email_logs` — send log + delivery status
- `email_preferences` — per-user notification toggles + unsubscribe token
- `email_queue` — async send queue with retry/backoff; `status` + `claimed_at` columns for atomic dequeue
- `refresh_tokens` — long-lived refresh tokens with rotation; `token_hash`, `expires_at`, `revoked_at`

**Never** use `JSON.parse` without a try/catch on D1 text columns — see `src/db/queries/jobs.ts::toJob()` as the pattern.

---

## Auth

- Access token: JWT HS256 via `jose`, **15-minute expiry** (`JWT_EXPIRY_SECONDS = "900"`)
- Refresh token: 30-day opaque token stored hashed in `refresh_tokens` D1 table
- JWT payload: `{ sub, email, name, role, company_id, iat, exp }` — issuer `https://api.synthire.io`, audience `https://app.synthire.io`
- **Primary auth**: `Authorization: Bearer <token>` header (token stored in `localStorage`)
- **Secondary auth**: HttpOnly cookie `synthire_token` (set by login response, works same-domain only)
- Login/signup responses return `{ user, token }` in body — frontend stores token in `localStorage` + non-HttpOnly cookie for middleware
- All `/api/*` routes except `/api/auth/*`, `/api/email/resend-callback`, `/api/email/unsubscribe`, `/health` require auth
- Role values: `recruiter` | `interviewer` | `admin`
- Interviewers are scoped — they can only see their own interviews
- Refresh: `POST /api/auth/refresh` reads `synthire_refresh` cookie, rotates token, issues new pair
- Rate limit on login: 5 attempts per 60s per email (KV key `rl:login:{email}`)

---

## AI pipeline

Resume upload at `POST /api/candidates/upload` (multipart: `file`, `jobId`):

1. Validate file type (PDF/DOCX by magic bytes) + size
2. Create candidate row (`processing_status = 'parsing'`)
3. Upload to R2
4. Return `{ candidateId }` immediately (202) — client polls `GET /api/candidates/:id`
5. Background (`waitUntil`): extract text → parse via Workers AI LLM → update DB → score → update DB

**Workers AI LLM fallback chain** (configured in `wrangler.toml`):
- Production: `@cf/nvidia/nemotron-3-120b-a12b` → `@cf/meta/llama-3.1-8b-instruct-awq`
- Dev: `@cf/nvidia/nemotron-3-120b-a12b` → `@cf/meta/llama-3.1-8b-instruct`
- Staging: `@cf/meta/llama-3.1-8b-instruct` → `@cf/meta/llama-3.2-3b-instruct`
- On invalid JSON or schema failure: try next model
- Hard stop at `NEURONS_DAILY_LIMIT` (default 10000/day) — throws 503

Embeddings: Workers AI `@cf/baai/bge-large-en-v1.5` → 1024-dim vectors → Vectorize.
Score: cosine similarity (30%) + LLM dimension scores × job weights (70%).

---

## Email service

- Emails never send inline — they go into `email_queue` (D1) and the cron processes them
- Email provider controlled by `EMAIL_PROVIDER` env var: `"sendgrid"` (production) or `"resend"` (staging/dev)
- Atomic dequeue via `UPDATE...RETURNING` prevents double-send on concurrent cron executions
- `queueEmail()` in `src/db/queries/email.ts` is the entry point for queueing
- `processEmailQueue()` in `src/services/email/queue.ts` runs every minute via Wrangler cron

Email types: `magic_link` | `resume_uploaded` | `interview_scheduled` | `feedback_reminder` | `interview_reminder`

---

## Frontend patterns

- **API calls:** use hooks from `hooks/queries/` — never call `apiFetch` directly in components
- **Auth:** `useAuth()` from `context/AuthContext.tsx` — provides `user`, `login`, `logout`, `signup`
- **Loading/error:** every data-dependent component has a loading guard — follow the pattern
- **Optimistic updates:** `useUpdateCandidateStage()` has optimistic rollback — follow this pattern for drag-drop
- **TypeScript:** `strict: false` — don't fight type warnings in existing components; do type new code properly

---

## What still uses mock data / placeholders

`frontend/lib/data.ts` is kept but nothing imports it. It exists for demo reference only.

These features are not yet wired to real backend endpoints:
- Analytics **Sources** chart — hardcoded placeholder (source tracking not implemented)
- Analytics **Round Performance** chart — returns empty array
- **AI interview question generation** in InterviewConduct — placeholder message

---

## Typecheck

```bash
cd backend && npm run typecheck   # must be 0 errors
cd frontend && npm run typecheck  # must be 0 errors
```

The pre-existing `@cloudflare/workers-types` vs `@types/node` duplicate identifier warnings in `node_modules` are expected and harmless — ignore them. Only errors in `src/` matter.

---

## Deployment

```bash
# Backend — auto-applies D1 migrations then deploys
cd backend && npm run deploy            # production
cd backend && npm run deploy:staging    # staging

# Frontend
cd frontend && npm run deploy
```

Secrets (set once via wrangler):
```bash
wrangler secret put JWT_SECRET
wrangler secret put SENDGRID_API_KEY    # or RESEND_API_KEY for staging
wrangler secret put RESEND_WEBHOOK_SECRET
```

---

## Git

- Commit prefix convention: `feat:` / `fix:` / `chore:`
