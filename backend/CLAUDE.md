# CLAUDE.md — Synthire Backend

Cloudflare Workers API for the Synthire AI-powered ATS. Built with Hono, D1, R2, KV, Vectorize, and Workers AI.

---

## Running locally

```bash
cd backend
npm install
npm run dev        # starts wrangler dev on http://localhost:8787
```

Health check: `curl http://localhost:8787/health`

---

## Configuration

Synthire uses two tiers of configuration:

| Tier | Where | Examples |
|---|---|---|
| **Secrets** | `.dev.vars` locally → `wrangler secret put` in production | API keys, JWT secret |
| **Runtime vars** | `wrangler.toml [vars]` | Model names, thresholds, TTLs — safe to commit |
| **CF bindings** | `wrangler.toml [[d1_databases]]` etc. | D1, R2, KV, Vectorize, AI — NOT env vars at runtime |

> **Cloudflare bindings are not environment variables.** D1_DATABASE_ID, ACCOUNT_ID, ZONE_ID are never accessible inside a Worker at runtime. D1/R2/KV/Vectorize are injected as typed binding objects (`env.DB`, `env.RESUME_BUCKET` etc.) configured in `wrangler.toml`. ACCOUNT_ID/ZONE_ID are wrangler CLI credentials only.

---

### Secrets — `backend/.dev.vars` (gitignored)

Copy from `.dev.vars.example` and fill in:

```ini
JWT_SECRET=           # min 32 chars; node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
RESEND_API_KEY=       # re_... from resend.com → API Keys
RESEND_WEBHOOK_SECRET= # whsec_... from Resend → Webhooks (leave blank for local dev)
```

For production, use `wrangler secret put <NAME>` instead of `.dev.vars`.

---

### Runtime vars — `wrangler.toml [vars]`

All non-secret configuration lives here. Defaults are already set. The full list:

```toml
[vars]
# App
ENVIRONMENT = "development"
FRONTEND_ORIGIN = "http://localhost:3000"   # change in [env.production.vars]

# Auth
JWT_EXPIRY_SECONDS = "86400"               # 24 hours

# File upload
MAX_UPLOAD_BYTES = "10485760"              # 10 MB
ALLOWED_FILE_TYPES = "pdf,docx"

# LLM — Workers AI native models (change in wrangler.toml without touching code)
LLM_MODEL_PRIMARY  = "@cf/meta/llama-3.1-8b-instruct"
LLM_MODEL_FALLBACK = "@cf/meta/llama-3.2-3b-instruct"
LLM_TEMPERATURE = "0.1"
LLM_MAX_TOKENS = "2000"
NEURONS_DAILY_LIMIT = "10000"   # hard stop — AI calls blocked when reached

# Scoring composition — must sum to 1.0
SCORE_LLM_WEIGHT = "0.70"          # weight for LLM dimension scores
SCORE_SEMANTIC_WEIGHT = "0.30"     # weight for cosine similarity score
SCORE_HIGH_THRESHOLD = "80"        # ≥80 = "strong match" in UI
SCORE_MEDIUM_THRESHOLD = "60"      # ≥60 = "medium match" in UI

# KV cache TTLs (seconds)
CACHE_PARSE_TTL = "2592000"        # 30 days — parsed resume structure
CACHE_EMBED_TTL = "2592000"        # 30 days — embeddings
CACHE_SCORE_TTL = "604800"         # 7 days — candidate scores

# Email queue
RESEND_FROM_EMAIL = "noreply@synthire.io"
RESEND_FROM_NAME = "Synthire"
EMAIL_QUEUE_BATCH_SIZE = "10"      # emails processed per cron tick
EMAIL_MAX_RETRIES = "3"
EMAIL_RETRY_BACKOFF_SECONDS = "60" # base for exponential backoff

# Rate limiting (KV-backed, fixed window, per IP)
RATE_LIMIT_ENABLED = "true"
RATE_LIMIT_REQUESTS = "100"        # requests per window
RATE_LIMIT_WINDOW_SECONDS = "60"
```

Production overrides live in `[env.production.vars]` in `wrangler.toml` — `RATE_LIMIT_REQUESTS = "200"` is already set there.

---

### Cloudflare bindings — `wrangler.toml` (IDs to fill after provisioning)

```toml
[[d1_databases]]
database_id = "REPLACE_WITH_YOUR_DATABASE_ID"   # from: wrangler d1 create synthire-prod

[[kv_namespaces]]
id = "REPLACE_WITH_YOUR_KV_ID"                   # from: wrangler kv:namespace create KV_CACHE
preview_id = "REPLACE_WITH_YOUR_KV_PREVIEW_ID"  # from: wrangler kv:namespace create KV_CACHE --preview
```

R2 bucket name (`synthire-resumes`) and Vectorize index name (`synthire-embeddings`) are already correct — they match what the provisioning commands create.

### One-time Cloudflare resource provisioning

```bash
wrangler login
wrangler d1 create synthire-prod              # → copy database_id into wrangler.toml
wrangler kv:namespace create KV_CACHE         # → copy id into wrangler.toml
wrangler kv:namespace create KV_CACHE --preview  # → copy preview_id into wrangler.toml
wrangler r2 bucket create synthire-resumes    # name is already in wrangler.toml
wrangler vectorize create synthire-embeddings --dimensions=1024 --metric=cosine

# Apply schema locally before first run
wrangler d1 migrations apply synthire-prod --local
```

---

## Project structure

```
src/
├── index.ts                          # Hono app entry + scheduled handler
├── middleware/
│   ├── auth.ts                       # JWT verify (jose); attaches user to context
│   ├── cors.ts                       # CORS + preflight; reads FRONTEND_ORIGIN
│   └── error.ts                      # Global error → standard JSON response
├── routes/
│   ├── auth.ts                       # POST /api/auth/signup|login|logout, GET /api/auth/me
│   ├── jobs.ts                       # CRUD /api/jobs
│   ├── candidates.ts                 # /api/candidates + SSE upload endpoint
│   ├── interviews.ts                 # /api/interviews + /api/interviews/:id/feedback
│   ├── interview-types.ts            # /api/interview-types CRUD
│   ├── analytics.ts                  # /api/analytics/* (6 endpoints)
│   ├── email.ts                      # /api/email/* (public webhook + protected routes)
│   └── settings.ts                   # /api/settings (placeholder)
├── services/
│   ├── ai/
│   │   ├── workers-ai.ts             # Native Workers AI binding wrapper
│   │   ├── fallback.ts               # 2-model fallback chain with Neurons budget guard
│   │   └── prompts/
│   │       ├── parse-resume.ts       # LLM prompt + Zod validation for resume parsing
│   │       ├── score-candidate.ts    # LLM prompt + Zod validation for scoring
│   │       └── generate-questions.ts # Interview question generation (unused in routes)
│   ├── parsing/
│   │   ├── detector.ts               # Magic-byte MIME detection (PDF / DOCX)
│   │   ├── pdf.ts                    # pdf-parse wrapper
│   │   └── docx.ts                   # mammoth wrapper
│   ├── scoring/
│   │   ├── aggregator.ts             # Weighted score formula
│   │   ├── skill-matcher.ts          # Exact skill intersection helper
│   │   └── pipeline.ts               # Full orchestrator: embed → cosine → LLM → aggregate
│   ├── embeddings/
│   │   ├── generator.ts              # Workers AI bge-large-en-v1.5 → 1024-dim vector
│   │   ├── vectorize.ts              # Vectorize upsert + query
│   │   └── similarity.ts             # Cosine similarity (dot product on unit vectors)
│   ├── email/
│   │   ├── resend.ts                 # Resend send via native fetch + D1 log write
│   │   ├── queue.ts                  # Cron processor: dequeue → render → send
│   │   ├── preferences.ts            # shouldSendEmail() check
│   │   └── templates/
│   │       ├── index.ts              # renderTemplate() dispatcher (exhaustive switch)
│   │       ├── magic-link.ts         # Template: interviewer interview link
│   │       ├── resume-uploaded.ts    # Template: new candidate scored → recruiter
│   │       ├── interview-scheduled.ts # Template: interview confirmed → candidate
│   │       ├── feedback-reminder.ts  # Template: feedback due → interviewer
│   │       └── interview-reminder.ts # Template: 24h reminder → interviewer + candidate
│   └── storage/
│       └── r2.ts                     # R2 put/delete; key pattern: resumes/{co}/{job}/{cand}.{ext}
├── db/
│   ├── migrations/
│   │   └── 0001_initial.sql          # Full schema — 9 tables
│   └── queries/
│       ├── users.ts                  # getUserByEmail, createUser, getUserById
│       ├── jobs.ts                   # toJob() + CRUD helpers
│       ├── candidates.ts             # toCandidate() + CRUD + score update helpers
│       ├── interviews.ts             # Interview + InterviewType + feedback CRUD
│       ├── analytics.ts              # Funnel, time-to-hire, activity queries
│       └── email.ts                  # queueEmail, logEmail, preferences CRUD
└── types/
    ├── bindings.ts                   # Env interface (all CF bindings + secrets + vars)
    ├── api.ts                        # apiResponse, paginatedResponse, AppError, Zod schemas
    ├── auth.ts                       # JWTPayload interface
    ├── db.ts                         # Row types matching D1 schema columns
    └── email.ts                      # EmailType union + template data shapes
```

---

## Route protection

```
Public:
  POST /api/auth/signup
  POST /api/auth/login
  POST /api/email/resend-callback   (HMAC-SHA256 signature check inside route)
  GET  /api/email/unsubscribe       (token-based, no JWT)
  GET  /health

JWT required (authMiddleware):
  All /api/jobs/*
  All /api/candidates/*
  All /api/interviews/*
  All /api/interview-types/*
  All /api/analytics/*
  All /api/settings/*
  GET  /api/email/logs
  GET  /api/email/preferences
  PATCH /api/email/preferences
```

`authMiddleware` reads `Authorization: Bearer <token>`, verifies with `jose`, and writes the payload into `c.get('user')` (`JWTPayload`).

---

## Database (D1)

9 tables in `src/db/migrations/0001_initial.sql`:

| Table | Purpose |
|---|---|
| `companies` | One row per workspace |
| `users` | `role`: `recruiter` \| `interviewer` \| `admin` |
| `jobs` | Postings; `scoring_weights` must sum to 100 |
| `candidates` | Resume data + AI scores + processing status |
| `interview_types` | Configurable rounds per company |
| `interviews` | Scheduled interviews; tracks email send times |
| `interview_feedback` | Per-interviewer feedback; unique per (interview, interviewer) |
| `email_logs` | Resend send log + delivery status (updated by webhook) |
| `email_preferences` | Per-user notification toggles + unsubscribe token |
| `email_queue` | Async send queue with retry/backoff |

### D1 JSON pattern

All array/object columns are stored as `TEXT`. Always wrap `JSON.parse` in try/catch with a safe fallback:

```typescript
// Correct pattern — see src/db/queries/jobs.ts::toJob()
try { required_skills = JSON.parse(row.required_skills) } catch { required_skills = [] }
```

`ai_analysis` in `candidates` is a plain string — **do not** `JSON.stringify` or `JSON.parse` it.

### Query helpers

Each query file exports a `toX()` deserializer (e.g. `toJob`, `toCandidate`) that handles all JSON parsing. Routes call helpers from `src/db/queries/` and never write raw SQL themselves.

---

## Auth

- Algorithm: HS256 via `jose`
- JWT payload: `{ sub, email, name, role, company_id, iat, exp }`
- Expiry: `JWT_EXPIRY_SECONDS` from `wrangler.toml` (default 86400 = 24 h)
- Role scoping: interviewers can only read their own interviews (routes enforce this with a 403, not 404)
- Signup auto-creates `email_preferences` with all notifications enabled and a random `unsubscribe_token`

---

## Resume upload pipeline

`POST /api/candidates/upload` (multipart: `file`, `jobId`)

Streams SSE events back to the client:

```
data: {"candidateId":"x","status":"parsing"}\n\n
data: {"candidateId":"x","status":"scoring"}\n\n
data: {"candidateId":"x","status":"complete","score":87,"candidate":{...}}\n\n
```

Internal steps:

1. Validate MIME type via magic bytes + file size (`MAX_UPLOAD_BYTES`)
2. Create D1 candidate row (`processing_status = 'parsing'`)
3. Upload file to R2 → `resume_url`
4. Extract text (mammoth for DOCX, pdf-parse for PDF) — requires `nodejs_compat` flag
5. Parse resume structure via LLM (Workers AI fallback chain)
6. Update D1 with parsed fields (`processing_status = 'scoring'`)
7. Generate embedding via Workers AI
8. Upsert embedding to Vectorize
9. Run scoring pipeline → update D1 with scores (`processing_status = 'complete'`)
10. Queue `resume_uploaded` email to recruiter
11. Send SSE `complete` event

---

## AI — Workers AI fallback chain

```
src/services/ai/fallback.ts

Model chain (from wrangler.toml — change without touching code):
  1. LLM_MODEL_PRIMARY  = @cf/meta/llama-3.1-8b-instruct
  2. LLM_MODEL_FALLBACK = @cf/meta/llama-3.2-3b-instruct

Budget guard: checkNeuronBudget() hard-stops at NEURONS_DAILY_LIMIT (default 10000/day)
On budget exceeded: throw AppError(503) with reset time — does NOT try next model
temperature = LLM_TEMPERATURE   (default: 0.1)
max_tokens  = LLM_MAX_TOKENS    (default: 2000)

On bad JSON:  try next model
On invalid schema (Zod):  try next model
On other error:  try next model

Exhausted:  throw AppError('All AI models exhausted without a valid response', 503)
```

Call sites use `buildLlmConfig(env)` to read model names and params from the environment, then pass the config as the 4th argument to `callWithFallback`. The `validateFn` is a Zod validator exported from the relevant prompt file.

---

## Scoring formula

```typescript
// src/services/scoring/aggregator.ts
componentScore = (
  llm.skills_score       * weights.skills      +
  llm.experience_score   * weights.experience  +
  llm.education_score    * weights.education   +
  llm.achievements_score * weights.achievements
) / 100                          // weights sum to 100, normalises to 0-100

overall = componentScore * SCORE_LLM_WEIGHT + semanticScore * SCORE_SEMANTIC_WEIGHT
// default: 0.70 LLM + 0.30 semantic
// clamped: Math.max(0, Math.min(100, Math.round(overall)))
```

`semanticScore` = cosine similarity between resume embedding and job description embedding × 100.

Both weights are read from `env.SCORE_LLM_WEIGHT` and `env.SCORE_SEMANTIC_WEIGHT` at runtime — change them in `wrangler.toml` without touching code.

---

## Embeddings

- Model: Workers AI `@cf/baai/bge-large-en-v1.5` → 1024-dimensional vectors
- Vectorize index: `synthire-embeddings`, cosine metric
- Upsert metadata: `{ candidateId, jobId, companyId }`
- KV cache keys: `embed:{sha256(text)}` (TTL 30 days)

---

## Email service

Emails are **never sent inline** — they go into `email_queue` (D1) and the cron processes them every minute.

### Sending flow

```
Route calls queueEmail(db, { recipientEmail, emailType, templateData, scheduledFor? })
  → INSERT into email_queue

Cron (every 1 min) runs processEmailQueue(env):
  → SELECT up to 10 pending rows where scheduled_for <= now
  → renderTemplate(emailType, templateData) → { subject, html }
  → sendEmail(env, ...) → POST to Resend API → log to email_logs
  → On failure: exponential backoff, max_retries exhausted → mark failed_at
```

### Email triggers

| Email type | Triggered by |
|---|---|
| `magic_link` | `POST /api/interviews` → interviewer |
| `interview_scheduled` | `POST /api/interviews` → candidate |
| `interview_reminder` | Queued 24h before interview → interviewer + candidate |
| `resume_uploaded` | Upload pipeline completes → recruiter |
| `feedback_reminder` | Scheduled 24h after interview if no feedback → interviewer |

### Template rendering

`renderTemplate(emailType: EmailType, data: TemplateData)` in `src/services/email/templates/index.ts` uses an exhaustive switch with a `never` default. Adding a new email type requires updating both `EmailType` in `src/types/email.ts` and the switch.

### Resend webhook

`POST /api/email/resend-callback` — verifies HMAC-SHA256 signature from `Resend-Signature` header using `RESEND_WEBHOOK_SECRET` **before** any DB writes. Returns 401 on mismatch. Updates `email_logs` status on `email.delivered`, `email.bounced`, `email.complained`.

---

## Rate limiting

`src/middleware/rate-limit.ts` — KV-backed fixed-window rate limiter applied to all `/api/*` routes.

- Key: `rl:{CF-Connecting-IP}:{window}` (window = floor(now / windowSeconds))
- On over-limit: 429 + `Retry-After` header
- Response headers on every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Disabled by setting `RATE_LIMIT_ENABLED = "false"` in `wrangler.toml`
- Uses KV `expirationTtl = windowSeconds * 2` so keys self-clean

Production default (`[env.production.vars]`): 200 requests/60 s. Dev default: 100/60 s.

---

## Standard response shape

All endpoints return:

```json
// success
{ "success": true, "data": {...}, "error": null, "timestamp": "...", "request_id": "abc123" }

// error
{ "success": false, "data": null, "error": "message", "timestamp": "..." }
```

Paginated responses nest `{ items, pagination: { total, page, limit, pages, has_more } }` inside `data`.

`AppError(message, statusCode)` thrown anywhere → caught by `errorHandler` middleware → structured JSON.
`ZodError` → 422 with validation details.

---

## Typecheck

```bash
npm run typecheck    # tsc --noEmit — must be 0 errors in src/
```

Duplicate-identifier warnings from `node_modules` (`@cloudflare/workers-types` vs `@types/node`) are expected and harmless — ignore them.

---

## Deployment

```bash
# Set production secrets (interactive prompts)
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_WEBHOOK_SECRET

# Apply schema to production D1
wrangler d1 migrations apply synthire-prod

# Deploy
wrangler deploy
```

Update `FRONTEND_ORIGIN` in `wrangler.toml` `[env.production.vars]` to your Vercel URL before deploying.

---

## Key decisions

| Decision | Reason |
|---|---|
| `bcryptjs` not `bcrypt` | `bcrypt` uses native bindings — crashes in Workers |
| Raw D1 queries, no ORM | Drizzle adds ~50 KB bundle; 9 tables doesn't justify it |
| Workers AI for embeddings | Built-in binding, no API round-trip, no external rate limits |
| Native `fetch` for Resend | Resend npm package has Node.js dependencies; native fetch is sufficient |
| Async email queue | Keeps API responses fast; emails process in background cron |
| `nodejs_compat` flag | Required by pdf-parse and mammoth for Buffer/stream support |
