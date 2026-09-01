# CLAUDE.md — Synthire Backend

Cloudflare Workers API for the Synthire ATS. Hono + D1 + R2 + KV + Vectorize + Workers AI.

---

## Commands

```bash
npm run dev          # wrangler dev on http://localhost:8787
npm run typecheck    # tsc --noEmit — must exit 0
npm test             # vitest run   — must exit 0
npm run lint         # eslint src   — must exit 0
npm run deploy       # applies prod D1 migrations, then deploys --env production
npm run deploy:staging
```

Health check: `curl http://localhost:8787/health` — probes D1 and KV, returns 503 if either is down.

CI (`.github/workflows/ci.yml`) gates on `typecheck` + `test`. `tsconfig.json` sets `skipLibCheck: true`, so a non-zero typecheck exit is a real error in `src/` — don't disable it, `unpdf`/`mammoth`/`tinybench` ship `.d.ts` files that produce ~88 errors under this repo's `lib`/`types` settings.

---

## Configuration — three tiers

| Tier | Where | Examples |
|---|---|---|
| **Secrets** | `.dev.vars` locally → `wrangler secret put` in prod | `JWT_SECRET`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN` (optional) |
| **Runtime vars** | `wrangler.toml [vars]` | model names, thresholds, TTLs — safe to commit |
| **CF bindings** | `wrangler.toml [[d1_databases]]` etc. | `env.DB`, `env.RESUME_BUCKET`, `env.KV_CACHE`, `env.VECTORIZE`, `env.AI` |

> **Cloudflare bindings are not environment variables.** There is no `D1_DATABASE_ID`, `ACCOUNT_ID`, or `ZONE_ID` at runtime — D1/R2/KV/Vectorize/AI arrive as typed binding objects. Those IDs are wrangler CLI concerns only.

All resource IDs are already provisioned and committed for dev, staging, and production. `src/types/bindings.ts` is the authoritative list of every var with its default — read it rather than duplicating it here.

---

## Gotchas

- **`authMiddleware` is registered inside each route file**, not in `src/index.ts`. Hono's `path/*` matcher does not match the bare `path`, which once silently bypassed auth on list endpoints like `GET /api/candidates`. Any new protected router must call `router.use('*', authMiddleware)` itself.
- **Never `JSON.parse` a D1 text column without try/catch.** Follow `src/db/queries/jobs.ts::toJob()`. Every query file exports a `toX()` deserializer; routes call those and never write raw SQL.
- **`candidates.ai_analysis` is a plain string** — do not `JSON.stringify` or `JSON.parse` it.
- **Emails never send inline.** Routes call `queueEmail()`; the every-minute cron drains `email_queue`.
- **`bcryptjs`, not `bcrypt`** — native bindings crash in Workers.
- **`nodejs_compat` is required** by the PDF/DOCX parsers for Buffer support.

---

## Database (D1)

12 tables across migrations `0001`–`0008`: `companies`, `users`, `jobs`, `candidates`, `interview_types`, `interviews`, `interview_feedback`, `email_logs`, `email_preferences`, `email_queue`, `refresh_tokens`, `quota_usage`.

Notable migrations: `0003` rebuilt `interviews` to make `interviewer_id` nullable (via `interviews_new` + rename), `0006` added `status` + `claimed_at` to `email_queue` for atomic dequeue, `0007` added `refresh_tokens`, `0008` added `quota_usage` (daily D1/KV counters — kept in D1 rather than KV so counting a write does not itself spend the KV write budget).

---

## Auth

- HS256 via `jose`; issuer `https://api.synthire.io`, audience `https://app.synthire.io`
- Payload: `{ sub, email, name, role, company_id, iat, exp }`
- Access token 15 min (`JWT_EXPIRY_SECONDS`); refresh token 30 days, stored SHA-256 hashed in `refresh_tokens`, rotated on every use by `POST /api/auth/refresh`
- Middleware reads `Authorization: Bearer` first, falls back to the `synthire_token` cookie
- Login/signup return `{ user, token }` in the body **and** set HttpOnly cookies
- **Interviewers are scoped to their own interviews** — routes enforce this with 403, not 404. Preserve it in new queries.
- Signup auto-creates `email_preferences` with a random `unsubscribe_token`
- Login rate limit: `LOGIN_MAX_ATTEMPTS` (5) per `LOGIN_ATTEMPT_WINDOW_SECONDS` (60) per email, KV key `rl:login:{email}`. **No kill switch by design** — it is a security control, not a quota guard.

Public routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/email/resend-callback`, `GET /api/email/unsubscribe`, `GET /health`. Everything else under `/api/*` requires a JWT.

---

## AI — Workers AI fallback chain

`src/services/ai/fallback.ts`. Models come from `wrangler.toml`, so changing them needs no code edit:

| Env | Primary | Fallback |
|---|---|---|
| production / dev | `@cf/meta/llama-3.1-8b-instruct-awq` | `@cf/meta/llama-3.2-3b-instruct` |
| staging | `@cf/meta/llama-3.1-8b-instruct` | `@cf/meta/llama-3.2-3b-instruct` |

- Bad JSON, failed Zod validation, or any error → try next model. Exhausted → `AppError(503)`.
- `extractJson()` strips ``` fences and finds the first balanced `{...}`/`[...]` — smaller models routinely wrap JSON in prose.
- **Neurons budget** (`src/services/budget/neurons.ts`): checked *before* any model runs, deducted only on success. Costs per call — `LLM_PARSE` 100, `LLM_SCORE` 150, `LLM_QUESTIONS` 80, `EMBEDDING` 3. Daily key `neurons:daily:YYYY-MM-DD`, expires at midnight UTC. Over budget throws 503 and does **not** fall through to the next model.

Embeddings: `@cf/baai/bge-large-en-v1.5` → 1024-dim → Vectorize (`synthire-embeddings`, cosine), metadata `{ candidateId, jobId, companyId }`. The `companyId` metadata index must exist for tenant isolation:

```bash
wrangler vectorize create-metadata-index synthire-embeddings --property-name=companyId --type=string
```

---

## Scoring (v2)

`src/services/scoring/dimensions.ts` + `aggregator.ts`.

```
dimension_score = weighted_avg(sub_dimension_scores, sub_dimension_importance)
component_score = weighted_avg(dimension_scores,     dimension_importance)
overall         = component_score * SCORE_LLM_WEIGHT + semantic * SCORE_SEMANTIC_WEIGHT
                  (defaults 0.70 / 0.30, both from env)
```

**There is no "weights must sum to 100" rule.** The weighted average normalizes by total importance, so each dimension's importance is set independently 0–100. Four dimensions — `skills`, `experience`, `education`, `achievements` — each with sub-dimensions (see `DEFAULT_SCORING_DIMENSIONS`).

If the LLM ignores the v2 sub-dimension structure, `rollupDimension()` falls back to the legacy flat `{id}_score` field. Keep that fallback.

---

## Resume upload pipeline

`POST /api/candidates/upload` (multipart: `file`, `jobId`) returns `{ candidateId }` at **202** immediately; the client polls `GET /api/candidates/:id` until `processing_status` is `complete` or `failed`.

Background via `ctx.waitUntil`: validate magic bytes + size → create row (`parsing`) → R2 → extract text (`unpdf` for PDF, `mammoth` for DOCX) → LLM parse → update DB (`scoring`) → embed → Vectorize upsert → score → update DB (`complete`) → queue `resume_uploaded` email.

---

## Email

Queue-only. `queueEmail()` inserts into `email_queue` (`status = 'pending'`); the cron runs `processEmailQueue()` every minute:

1. Atomic `UPDATE...RETURNING` claims up to 10 rows (`status → 'claimed'`) — this is what prevents double-sends across concurrent cron runs. Don't replace it with select-then-update.
2. `renderTemplate()` → `sendEmail()`, routed by `EMAIL_PROVIDER` to SendGrid (dev + production) or Resend (staging).
3. Log to `email_logs`; on failure back off exponentially until `EMAIL_MAX_RETRIES`.

Types: `magic_link`, `interview_scheduled`, `interview_reminder`, `resume_uploaded`, `feedback_reminder`. `renderTemplate()` uses an exhaustive switch with a `never` default — adding a type means updating `EmailType` in `src/types/email.ts` too.

`POST /api/email/resend-callback` verifies the HMAC-SHA256 `Resend-Signature` **before** any DB write; 401 on mismatch.

---

## Guardrails

Every guardrail follows the same shape: an `*_ENABLED` kill switch that stops
**enforcement** while counters keep incrementing, so usage snapshots stay honest
with a limit turned off. All switches are **fail-closed** via
`isGuardrailEnabled()` in `src/utils/env.ts` — only an explicit `"false"`
disables, so a typo can never silently uncap billing.

| Guard | Module | Switch | Free-tier ceiling |
|---|---|---|---|
| Neurons (Workers AI) | `services/budget/neurons.ts` | `LLM_LIMITS_ENABLED` | `NEURONS_DAILY_LIMIT`, 10k/day |
| D1 + KV daily ops | `services/budget/quotas.ts` | `QUOTA_LIMITS_ENABLED` | D1 5M read / 100k write; KV 100k read / **1k write** |
| R2 storage + ops | `services/storage/r2-limits.ts` | `R2_LIMITS_ENABLED` | 10 GB, 1M Class A, 10M Class B / month |
| Request rate | `middleware/rate-limit.ts` | `RATE_LIMIT_ENABLED` | native `[[ratelimits]]` binding |
| Login brute force | `routes/auth.ts` | **none, by design** | `LOGIN_MAX_ATTEMPTS` / `LOGIN_ATTEMPT_WINDOW_SECONDS` |

**KV writes (1,000/day) are the tightest constraint in the whole app.** Consumers:
the neuron counter, R2 op/storage tracking, the login limiter, the JD-parse and
question caches, and the webhook replay guard. Think before adding a `kv.put` to
a hot path.

- **Rate limiting uses Cloudflare's native `[[ratelimits]]` binding, not KV** — a
  KV counter costs one write per request and would drain the daily KV budget in
  1,000 requests. Counters are per-colo, so the effective global limit is looser
  than configured; that is fine for abuse control. `GET /api/candidates/:id` and
  `GET /api/jobs/parse-jd/:id` are **exempt** — the frontend opens one 2s poller
  per uploaded file, which would trip any sane limit on its own.
- **D1/KV metering** (`services/budget/meters.ts`): `env.DB` and `env.KV_CACHE` are
  wrapped in Proxies in `src/index.ts` against a **fresh env spread per request**
  (never mutate the isolate-shared `env`). This counts all ~81 `.prepare()` sites
  with zero call-site changes. One aggregate upsert to `quota_usage` is flushed
  per request via `waitUntil`, using the **raw** DB handle — metering the flush
  would make the counter count itself.
- Inspect live usage: `GET /api/analytics/r2-usage` and `GET /api/analytics/quota-usage`.

---

## Response shape

```json
{ "success": true,  "data": {...}, "error": null,      "timestamp": "...", "request_id": "abc" }
{ "success": false, "data": null,  "error": "message", "timestamp": "..." }
```

Paginated responses nest `{ items, pagination: { total, page, limit, pages, has_more } }` inside `data`. `AppError(message, status)` → `errorHandler` → structured JSON; `ZodError` → 422.

`apiResponse(data)` takes one argument — set the HTTP status on `c.json(apiResponse(x), 202)`, not on `apiResponse`.

---

## Key decisions

| Decision | Reason |
|---|---|
| Raw D1 queries, no ORM | Drizzle adds ~50 KB to the bundle; 11 tables doesn't justify it |
| Workers AI for embeddings | Built-in binding — no API round-trip, no external rate limit |
| Native `fetch` for Resend/SendGrid | Their npm packages pull in Node.js deps |
| Async email queue | Keeps API responses fast; cron absorbs provider latency |
