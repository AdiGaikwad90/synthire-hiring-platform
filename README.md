# Synthire — AI-Powered Applicant Tracking System

Synthire (Synthetic + Hire) is a production-grade ATS built entirely on Cloudflare's developer platform. It uses AI to parse resumes, score candidates against job requirements, and automate recruiter communications.

---

## Architecture

```
TS_CF_Hackathon/
├── backend/        Cloudflare Workers API (Hono framework)
└── frontend/       Next.js 15 App Router → Cloudflare Pages
```

| Layer | Technology |
|---|---|
| Backend runtime | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 |
| Caching | Cloudflare KV |
| Vector search | Cloudflare Vectorize |
| Embeddings | Workers AI (`@cf/baai/bge-large-en-v1.5`) |
| AI / LLM | OpenRouter (configurable model chain, defaults to free models) |
| Email | Resend or SendGrid (switchable via `EMAIL_PROVIDER`) |
| Frontend | Next.js 15, React Query v5, TypeScript |
| Frontend hosting | Cloudflare Pages (via `@cloudflare/next-on-pages`) |

---

## Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — `npm i -g wrangler`
- Cloudflare account (free tier works)
- [OpenRouter](https://openrouter.ai/) API key (free models available)
- [Resend](https://resend.com/) or [SendGrid](https://sendgrid.com/) API key

---

## Local Development Setup

### Step 1 — Provision Cloudflare resources (one-time)

```bash
wrangler login

# D1 database → copy the printed database_id
wrangler d1 create synthire-prod

# KV namespace → copy id and preview_id
wrangler kv:namespace create KV_CACHE
wrangler kv:namespace create KV_CACHE --preview

# R2 bucket (no ID needed, name already in wrangler.toml)
wrangler r2 bucket create synthire-resumes

# Vectorize index (no ID needed)
wrangler vectorize create synthire-embeddings --dimensions=1024 --metric=cosine
```

> Workers AI is a built-in binding — no provisioning needed.

### Step 2 — Fill in `backend/wrangler.toml`

Replace the three placeholders with IDs from Step 1:

```toml
[[d1_databases]]
database_id = "paste-your-d1-id-here"

[[kv_namespaces]]
id = "paste-your-kv-id-here"
preview_id = "paste-your-kv-preview-id-here"
```

### Step 3 — Create `backend/.dev.vars`

```bash
cp backend/.dev.vars.example backend/.dev.vars
```

Fill in all values:

```ini
JWT_SECRET=          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OPENROUTER_API_KEY=  # sk-or-... from openrouter.ai → Dashboard → API Keys
RESEND_API_KEY=      # re_... from resend.com → API Keys (leave blank if using SendGrid)
RESEND_WEBHOOK_SECRET=  # leave blank for local dev
SENDGRID_API_KEY=    # SG.xxx... from sendgrid.com (leave blank if using Resend)
```

**Email provider choice** — set in `backend/wrangler.toml`:
```toml
EMAIL_PROVIDER = "sendgrid"   # or "resend"
```

> **Resend note:** `onboarding@resend.dev` only delivers to the Resend account owner's email. To send to any address, verify a domain at resend.com/domains or use SendGrid.
>
> **SendGrid note:** Go to app.sendgrid.com → Settings → Sender Authentication → Single Sender Verification → verify your from-address before sending.

### Step 4 — Create `frontend/.env.local`

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8787" > frontend/.env.local
```

This is the only variable needed for local development. `npm run dev` reads it automatically — you never need to change it.

### Step 5 — Apply database schema locally

```bash
cd backend
wrangler d1 migrations apply synthire-prod --local
```

### Step 6 — Install dependencies and run

```bash
cd backend && npm install
cd ../frontend && npm install
```

Open two terminals:

```bash
# Terminal 1 — backend on http://localhost:8787
cd backend && npm run dev

# Terminal 2 — frontend on http://localhost:3000
cd frontend && npm run dev
```

Health check: `curl http://localhost:8787/health`

Open http://localhost:3000, sign up, and start using the app.

---

## Production Deployment

> **Important:** The backend uses a named Wrangler environment (`production`). Always pass `--env=production` to every wrangler command targeting production, and always use `npm run deploy` (not `wrangler deploy`) since the npm script includes the flag automatically.

### Step 1 — Provision Cloudflare resources (skip if already done for local dev)

```bash
wrangler login

# D1 database → copy the printed database_id into wrangler.toml
wrangler d1 create synthire-prod

# KV namespace → copy id and preview_id into wrangler.toml
wrangler kv:namespace create KV_CACHE
wrangler kv:namespace create KV_CACHE --preview

# R2 bucket (no ID needed)
wrangler r2 bucket create synthire-resumes

# Vectorize index (no ID needed)
wrangler vectorize create synthire-embeddings --dimensions=1024 --metric=cosine
```

Fill the three placeholder IDs into `backend/wrangler.toml`:

```toml
[[d1_databases]]
database_id = "paste-your-d1-id-here"

[[kv_namespaces]]
id = "paste-your-kv-id-here"
preview_id = "paste-your-kv-preview-id-here"
```

### Step 2 — Apply database migrations to production

```bash
cd backend
wrangler d1 migrations apply synthire-prod --remote --env=production
```

> Always use `--remote` for production. Without it, migrations only apply to your local SQLite copy.

### Step 3 — Set ALL production secrets

Secrets must be set with `--env=production` and take effect immediately — no redeploy needed.

```bash
cd backend

# Generate a JWT secret first:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

wrangler secret put JWT_SECRET --env=production
# paste the generated hex string above

wrangler secret put OPENROUTER_API_KEY --env=production
# paste your sk-or-v1-... key from openrouter.ai

wrangler secret put SENDGRID_API_KEY --env=production
# paste your SG.xxx... key from sendgrid.com

wrangler secret put RESEND_API_KEY --env=production
# paste your re_... key, or press Enter to skip if using SendGrid

wrangler secret put RESEND_WEBHOOK_SECRET --env=production
# press Enter to skip (only needed for delivery tracking webhooks)
```

Verify all secrets are saved before continuing:
```bash
wrangler secret list --env=production
```

Expected output — all 5 should be listed:
```
JWT_SECRET
OPENROUTER_API_KEY
SENDGRID_API_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
```

> **Common mistake:** Running `wrangler secret put` without `--env=production` sets the secret on the wrong (top-level) worker. Always include the flag.

### Step 4 — Deploy the backend

```bash
cd backend
npm run deploy
# expands to: wrangler deploy --env=production
```

Output will show your worker URL:
```
https://synthire-backend-production.<your-subdomain>.workers.dev
```

Save this URL — you need it in the next steps.

Verify it works:
```bash
curl https://synthire-backend-production.<your-subdomain>.workers.dev/health
# → {"success":true,"data":{"status":"ok"},...}
```

### Step 5 — Create Cloudflare Pages project (one-time)

```bash
cd frontend

# Create the Pages project in your Cloudflare account
wrangler pages project create synthire-frontend
# Choose: No framework preset / static (the build step handles this)
```

### Step 6 — Configure production vars in `backend/wrangler.toml`

Update the `[env.production.vars]` section with your Pages URL:

```toml
[env.production.vars]
ENVIRONMENT = "production"
FRONTEND_ORIGIN = "https://synthire-frontend.pages.dev"   # ← your Pages URL
EMAIL_PROVIDER = "sendgrid"                                # or "resend"
SENDGRID_FROM_EMAIL = "your-verified@email.com"            # must be verified in SendGrid
```

Redeploy the backend to apply the CORS change:
```bash
cd backend && npm run deploy
```

### Step 7 — Deploy the frontend to Cloudflare Pages

`NEXT_PUBLIC_API_URL` is a build-time variable — Next.js bakes it into the bundle during `next build`. Update `frontend/.env.production` with your backend URL, then deploy:

```bash
# 1. Set your production backend URL in frontend/.env.production
echo "NEXT_PUBLIC_API_URL=https://synthire-backend-production.<your-subdomain>.workers.dev" > frontend/.env.production

# 2. Deploy (reads .env.production automatically)
cd frontend && npm run deploy
```

Your frontend is now live at `https://synthire-frontend.pages.dev`.

> **How env vars work across environments:**
> - `npm run dev` → reads `.env.local` → `http://localhost:8787` (your local backend)
> - `npm run deploy` → reads `.env.production` → your deployed worker URL
>
> You never need to change anything manually. Each command reads the right file for its environment.

### Step 8 — Verify the full stack

```bash
# Backend health
curl https://synthire-backend-production.<your-subdomain>.workers.dev/health

# Watch live backend logs
wrangler tail --env=production
```

Open `https://synthire-frontend.pages.dev/signup`, create an account, and test the full flow.

### Re-deploying after code changes

```bash
# Backend only
cd backend && npm run deploy

# Frontend only (reads .env.production automatically)
cd frontend && npm run deploy

# Both
cd backend && npm run deploy && cd ../frontend && npm run deploy
```

### Updating an environment variable after deploy

```bash
# For a backend secret (API key, JWT secret):
wrangler secret put SECRET_NAME --env=production

# For a backend non-secret var (FRONTEND_ORIGIN, EMAIL_PROVIDER, etc.):
# Edit backend/wrangler.toml → [env.production.vars] → then redeploy:
cd backend && npm run deploy

# For the frontend API URL:
# Re-run the frontend deploy command in Step 7 with the updated URL
```

---

## Common Deployment Issues

| Problem | Fix |
|---|---|
| `Cannot read properties of undefined (reading 'prepare')` in cron | D1/KV/R2 bindings missing from `[env.production]` — the `[[env.production.d1_databases]]` block must exist in `wrangler.toml` |
| `Missing Authentication header` from OpenRouter | `OPENROUTER_API_KEY` secret not set — run `wrangler secret put OPENROUTER_API_KEY --env=production` |
| `Imported HMAC key length (0)` on signup/login | `JWT_SECRET` not set — run `wrangler secret put JWT_SECRET --env=production` |
| `The from address does not match a verified Sender Identity` | SendGrid from-email not verified — go to app.sendgrid.com → Settings → Sender Authentication → verify your `SENDGRID_FROM_EMAIL` address |
| CORS errors in browser | `FRONTEND_ORIGIN` in `[env.production.vars]` doesn't exactly match your Pages URL (no trailing slash) |
| D1 errors on first load | Migrations not applied to remote — run `wrangler d1 migrations apply synthire-prod --remote --env=production` |
| Resume upload fails | R2 bucket name must be exactly `synthire-resumes` |
| Vectorize errors on first deploy | Index takes ~2 min to become available after creation |
| Secrets applied to wrong worker | You ran `wrangler secret put` without `--env=production` — re-run with the flag |
| Workers AI unavailable locally | Workers AI requires live Cloudflare connection — embeddings/scoring degrade gracefully in local dev |
| `Login failed` on Pages deployment | `NEXT_PUBLIC_API_URL` not passed at build time — re-run `build:cf` with `NEXT_PUBLIC_API_URL=...` prefix |
| Pages build fails with peer dep errors | Run `npm install` in `frontend/` — `.npmrc` sets `legacy-peer-deps=true` |

---

## Runtime Configuration

All non-secret configuration lives in `backend/wrangler.toml` under `[vars]`. Change any value without touching code — just update and redeploy.

### LLM Models

```toml
OPENROUTER_MODEL_PRIMARY   = "qwen/qwen3-235b-a22b:free"
OPENROUTER_MODEL_FALLBACK1 = "google/gemma-3-27b-it:free"
OPENROUTER_MODEL_FALLBACK2 = "openai/gpt-4o-mini"
LLM_TEMPERATURE = "0.1"
LLM_MAX_TOKENS  = "2000"
```

### Scoring

```toml
SCORE_LLM_WEIGHT       = "0.70"
SCORE_SEMANTIC_WEIGHT  = "0.30"
SCORE_HIGH_THRESHOLD   = "80"
SCORE_MEDIUM_THRESHOLD = "60"
```

### Email

```toml
EMAIL_PROVIDER          = "resend"            # "resend" or "sendgrid"
RESEND_FROM_EMAIL       = "noreply@synthire.io"
RESEND_FROM_NAME        = "Synthire"
SENDGRID_FROM_EMAIL     = ""                  # only needed when EMAIL_PROVIDER = "sendgrid"
EMAIL_QUEUE_BATCH_SIZE  = "10"
EMAIL_MAX_RETRIES       = "3"
EMAIL_RETRY_BACKOFF_SECONDS = "60"
```

### Rate Limiting

```toml
RATE_LIMIT_ENABLED        = "true"
RATE_LIMIT_REQUESTS       = "100"
RATE_LIMIT_WINDOW_SECONDS = "60"
```

---

## First Use Flow

1. **Sign up** at `/signup` — creates your company workspace
2. **Create a job** at `/jobs/new` — set title, requirements, and scoring weights
3. **Upload resumes** — open a job → click "Upload resumes" → drop PDFs/DOCX
4. Backend parses each file, scores against the job with AI, streams progress via SSE
5. **View scored candidates** in the job's candidate list, sorted by AI score
6. **Drag candidates** on `/pipeline` to move through hiring stages
7. **Schedule interviews** from a candidate's detail page — emails send automatically
8. Check `/analytics` for funnel data and hiring metrics

---

## API Endpoints

All protected endpoints require `Authorization: Bearer <token>` header.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create account + company |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✓ | Current user info |
| GET | `/api/jobs` | ✓ | List company jobs |
| POST | `/api/jobs` | ✓ | Create job |
| GET | `/api/jobs/:id` | ✓ | Get job |
| PATCH | `/api/jobs/:id` | ✓ | Update job |
| DELETE | `/api/jobs/:id` | ✓ | Soft-delete job |
| GET | `/api/jobs/:id/jd` | ✓ | Stream original JD PDF from R2 |
| POST | `/api/candidates/upload` | ✓ | Upload resume (SSE stream) |
| GET | `/api/candidates` | ✓ | List candidates |
| GET | `/api/candidates/:id` | ✓ | Get candidate |
| PATCH | `/api/candidates/:id` | ✓ | Update candidate stage |
| GET | `/api/candidates/:id/resume` | ✓ | Stream original resume from R2 |
| POST | `/api/candidates/:id/questions` | ✓ | Generate AI interview questions |
| GET | `/api/interviews` | ✓ | List interviews (role-scoped) |
| POST | `/api/interviews` | ✓ | Schedule interview + queue emails |
| PATCH | `/api/interviews/:id` | ✓ | Update interview |
| POST | `/api/interviews/:id/feedback` | ✓ | Submit feedback |
| GET | `/api/interviews/:id/feedback` | ✓ | Get submitted feedback |
| GET | `/api/interview-types` | ✓ | List interview rounds |
| POST | `/api/interview-types` | ✓ | Create interview round |
| PATCH | `/api/interview-types/:id` | ✓ | Update interview round |
| DELETE | `/api/interview-types/:id` | ✓ | Delete interview round |
| GET | `/api/analytics/summary` | ✓ | Dashboard KPIs |
| GET | `/api/analytics/funnel` | ✓ | Stage funnel counts |
| GET | `/api/analytics/time-to-hire` | ✓ | Time-to-hire by month |
| GET | `/api/analytics/activity` | ✓ | Recent stage changes |
| GET | `/api/analytics/email-stats` | ✓ recruiter | Email delivery stats |
| GET | `/api/email/logs` | ✓ recruiter | Email delivery logs |
| GET | `/api/email/preferences` | ✓ | Notification preferences |
| PATCH | `/api/email/preferences` | ✓ | Update preferences |
| POST | `/api/email/resend-callback` | webhook | Resend delivery webhook |
| GET | `/api/email/unsubscribe` | token | One-click unsubscribe |
| GET | `/health` | — | Health check |

---

## Email Service

Five transactional email templates triggered automatically:

| Template | Trigger | Recipient |
|---|---|---|
| Magic link | Interview scheduled | Interviewer |
| Resume uploaded | Candidate scored | Recruiter |
| Interview scheduled | Interview scheduled | Candidate |
| Feedback reminder | 24 h after interview, no feedback | Interviewer |
| Interview reminder | 24 h before interview | Interviewer + Candidate |

Emails queue in D1 and process every minute via Wrangler cron. For Resend webhook delivery tracking, point your endpoint to:
```
https://<your-worker>.workers.dev/api/email/resend-callback
```

---

## Project Structure

```
backend/src/
├── index.ts                    # Hono app entry + scheduled handler
├── middleware/
│   ├── auth.ts                 # JWT verification (jose)
│   ├── cors.ts                 # CORS + preflight
│   ├── error.ts                # Global error handler
│   └── rate-limit.ts           # KV-backed IP rate limiter
├── routes/
│   ├── auth.ts                 # /api/auth/*
│   ├── jobs.ts                 # /api/jobs/*
│   ├── candidates.ts           # /api/candidates/* + SSE upload
│   ├── interviews.ts           # /api/interviews/*
│   ├── interview-types.ts      # /api/interview-types/*
│   ├── analytics.ts            # /api/analytics/*
│   ├── email.ts                # /api/email/*
│   └── settings.ts             # /api/settings/*
├── services/
│   ├── ai/                     # OpenRouter client + configurable fallback chain
│   ├── embeddings/             # Workers AI + Vectorize helpers
│   ├── email/                  # Resend + SendGrid clients, templates, queue processor
│   ├── parsing/                # PDF + DOCX text extraction
│   ├── scoring/                # Skill matcher + score aggregator + pipeline
│   └── storage/                # R2 helpers
├── db/
│   ├── migrations/             # D1 SQL schema
│   └── queries/                # Typed D1 query helpers
└── types/                      # TypeScript interfaces (Env, DB rows, API, email)

frontend/
├── app/                        # Next.js App Router pages
├── components/
│   ├── (auth)/                 # Login, Signup, Landing
│   ├── (recruiter)/            # All recruiter screens
│   ├── (interviewer)/          # Interviewer screens
│   ├── shared/                 # Sidebar, Navigation, CommandPalette
│   └── ui/                     # Design system primitives
├── context/AuthContext.tsx     # JWT auth state
├── hooks/queries/              # React Query hooks (6 files)
├── lib/
│   ├── api.ts                  # Typed API client
│   ├── auth.ts                 # Token storage helpers (localStorage + cookie)
│   ├── types.ts                # Domain types
│   └── utils.ts                # cn(), initials(), formatDate()
├── middleware.ts               # Route protection (reads synthire_token cookie)
└── wrangler.toml               # Cloudflare Pages config
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| Raw D1 queries (no ORM) | Drizzle adds ~50 KB bundle; 9 tables doesn't justify it |
| `bcryptjs` not `bcrypt` | `bcrypt` uses native bindings that crash in Workers |
| Workers AI for embeddings | Built-in binding, no API round-trip, no rate limits |
| Async email queue | Keeps API responses fast; emails process in background cron |
| JWT in localStorage + cookie | localStorage for API calls; cookie for Next.js middleware |
| SSE for resume upload | Streams real-time parse/score progress to the UI |
| All config in wrangler.toml | Model names, thresholds, TTLs — tunable without code changes |
| KV-backed rate limiting | Works on free tier; self-cleaning keys via TTL |
| Native fetch for Resend/SendGrid | Avoids Node.js npm dependencies that don't run in Workers |
| Cloudflare Pages for frontend | Entire stack on Cloudflare — no Vercel dependency |
| `@cloudflare/next-on-pages` | Converts Next.js App Router to Cloudflare Pages Worker format |
| `NEXT_PUBLIC_API_URL` at build time | Next.js bakes public env vars into bundle — set explicitly for production builds |
