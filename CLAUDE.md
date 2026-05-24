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
OPENROUTER_API_KEY=sk-or-<from openrouter.ai>
RESEND_API_KEY=re_<from resend.com>
RESEND_WEBHOOK_SECRET=<from Resend webhook dashboard>
```

### Backend — `backend/wrangler.toml` (checked in, IDs need filling after provisioning)

Three placeholder values must be replaced after running the provisioning commands:

```toml
[[d1_databases]]
database_id = "REPLACE_WITH_YOUR_DATABASE_ID"   # wrangler d1 create synthire-prod

[[kv_namespaces]]
id = "REPLACE_WITH_YOUR_KV_ID"                   # wrangler kv:namespace create KV_CACHE
preview_id = "REPLACE_WITH_YOUR_KV_PREVIEW_ID"  # wrangler kv:namespace create KV_CACHE --preview
```

R2 bucket and Vectorize index names match what's already in `wrangler.toml` — only the D1 and KV IDs need updating.

### Frontend — `frontend/.env.local` (gitignored, already created)

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

cd backend
wrangler d1 migrations apply synthire-prod --local
```

---

## Architecture

```
Request → Cloudflare Worker (Hono)
            ├── Auth middleware (JWT via jose)
            ├── Routes → DB queries (D1 prepared statements)
            ├── Resume upload → R2 storage
            │                → PDF/DOCX parse (mammoth/pdf-parse via nodejs_compat)
            │                → OpenRouter LLM parse
            │                → Workers AI embeddings → Vectorize upsert
            │                → Scoring pipeline → D1 update
            │                → SSE stream to client
            └── Cron (every 1 min) → processEmailQueue → Resend API
```

---

## Key files

| File | Purpose |
|---|---|
| `backend/src/index.ts` | Hono app entry, route mounting, scheduled handler |
| `backend/src/types/bindings.ts` | `Env` interface — all Cloudflare bindings + secrets |
| `backend/src/db/migrations/0001_initial.sql` | Full D1 schema (9 tables) |
| `backend/src/services/ai/fallback.ts` | OpenRouter retry chain (Qwen3 → Gemma 3 → GPT-4o-mini) |
| `backend/src/services/scoring/pipeline.ts` | Full candidate scoring orchestrator |
| `backend/src/services/email/queue.ts` | Cron email queue processor |
| `backend/src/services/email/templates/index.ts` | Email template dispatcher |
| `frontend/lib/api.ts` | Typed API client — all endpoint groups |
| `frontend/lib/auth.ts` | JWT localStorage + cookie helpers |
| `frontend/context/AuthContext.tsx` | Auth state, login/logout/signup |
| `frontend/middleware.ts` | Route protection via `synthire_token` cookie |
| `frontend/hooks/queries/` | React Query hooks for every API group |

---

## Database (D1)

9 tables — all JSON columns stored as `TEXT` and parsed in query helpers:

- `companies` — one per workspace
- `users` — recruiter / interviewer / admin, scoped to company
- `jobs` — job postings with scoring weights (must sum to 100)
- `candidates` — resume data + AI scores + processing status
- `interview_types` — configurable interview rounds per company
- `interviews` — scheduled interviews with email tracking columns
- `interview_feedback` — per-interviewer feedback per interview
- `email_logs` — Resend send log + delivery status
- `email_preferences` — per-user notification toggles + unsubscribe token
- `email_queue` — async send queue with retry/backoff

**Never** use `JSON.parse` without a try/catch on D1 text columns — see `src/db/queries/jobs.ts::toJob()` as the pattern.

---

## Auth

- JWT signed with `JWT_SECRET` (HS256 via `jose`)
- Payload: `{ sub, email, name, role, company_id, iat, exp }`
- Frontend: stored in `localStorage` (`synthire_token`) AND cookie (`synthire_token`) for Next.js middleware
- All `/api/*` routes except `/api/auth/*`, `/api/email/resend-callback`, `/api/email/unsubscribe` require `Authorization: Bearer <token>`
- Role values: `recruiter` | `interviewer` | `admin`
- Interviewers are scoped — they can only see their own interviews

---

## AI pipeline

Resume upload at `POST /api/candidates/upload` (multipart: `file`, `jobId`):

1. Validate file type (PDF/DOCX by magic bytes) + size
2. Upload to R2
3. Extract text (mammoth for DOCX, pdf-parse for PDF)
4. Parse resume structure via OpenRouter LLM (with KV cache)
5. Generate embedding via Workers AI `@cf/baai/bge-large-en-v1.5`
6. Upsert embedding to Vectorize
7. Score: cosine similarity (30%) + LLM dimension scores × job weights (70%)
8. Stream progress via SSE: `parsing` → `scoring` → `complete`

OpenRouter fallback chain: `qwen/qwen3-235b-a22b:free` → `google/gemma-3-27b-it:free` → `openai/gpt-4o-mini`. On 429: exponential backoff (2^attempt seconds). On invalid JSON: try next model.

---

## Email service

- Emails never send inline — they go into `email_queue` (D1) and the cron processes them
- `queueEmail()` in `src/db/queries/email.ts` is the entry point for queueing
- `processEmailQueue()` in `src/services/email/queue.ts` runs every minute via Wrangler cron
- Template rendering is in `src/services/email/templates/index.ts` — `renderTemplate(emailType, data)`
- Resend webhook (`POST /api/email/resend-callback`) updates delivery status — uses HMAC-SHA256 signature verification

Email types: `magic_link` | `resume_uploaded` | `interview_scheduled` | `feedback_reminder` | `interview_reminder`

---

## Frontend patterns

- **API calls:** use hooks from `hooks/queries/` — never call `apiFetch` directly in components
- **Auth:** `useAuth()` from `context/AuthContext.tsx` — provides `user`, `login`, `logout`, `signup`
- **Loading/error:** every data-dependent component has a loading guard — follow the pattern
- **Optimistic updates:** `useUpdateCandidateStage()` has optimistic rollback — follow this pattern for drag-drop
- **TypeScript:** `strict: false` — don't fight type warnings in existing components; do type new code properly

---

## What still uses mock data

`frontend/lib/data.ts` is kept but nothing imports it. It exists for demo/hackathon purposes only.

These features are not yet wired to real backend endpoints:
- Analytics **Sources** chart — returns hardcoded placeholder (source tracking not implemented)
- Analytics **Round Performance** chart — returns empty array
- **AI interview question generation** in InterviewConduct — button shows a placeholder message

---

## Typecheck

```bash
cd backend && npm run typecheck   # must be 0 errors
cd frontend && npm run typecheck  # must be 0 errors
```

The pre-existing `@cloudflare/workers-types` vs `@types/node` duplicate identifier warnings in `node_modules` are expected and harmless — ignore them. Only errors in `src/` matter.

---

## Git

- Branch: `feature/synthire-backend-implementation`
- All 13 implementation phases are committed
- Commit prefix convention: `feat:` / `fix:` / `chore:`
