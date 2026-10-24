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
| **Secrets** | `.dev.vars` locally → `wrangler secret put` in prod | `JWT_SECRET`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN` (optional). Production currently holds only `JWT_SECRET` + `SENDGRID_API_KEY` — `RESEND_WEBHOOK_SECRET` is unset, so the Resend webhook would 401 if `EMAIL_PROVIDER` were switched to resend. |
| **Runtime vars** | `wrangler.toml [vars]` | model names, thresholds, TTLs — safe to commit |
| **CF bindings** | `wrangler.toml [[d1_databases]]` etc. | `env.DB`, `env.RESUME_BUCKET`, `env.KV_CACHE`, `env.VECTORIZE`, `env.AI`, `env.RESUME_QUEUE` |

> **Cloudflare bindings are not environment variables.** There is no `D1_DATABASE_ID`, `ACCOUNT_ID`, or `ZONE_ID` at runtime — D1/R2/KV/Vectorize/AI arrive as typed binding objects. Those IDs are wrangler CLI concerns only.

All resource IDs are already committed in `wrangler.toml` for dev, staging, and production, but the resources themselves — the resume queue + DLQ, the dev Vectorize index, its `companyId`/`jobId` metadata indexes, and the R2 `jd-pending/` lifecycle rule — are provisioned separately by `scripts/provision.sh` (see below), not by `wrangler deploy`. `src/types/bindings.ts` is the authoritative list of every var with its default — read it rather than duplicating it here.

---

## Gotchas

- **`authMiddleware` is registered inside each route file**, not in `src/index.ts`. Hono's `path/*` matcher does not match the bare `path`, which once silently bypassed auth on list endpoints like `GET /api/candidates`. Any new protected router must call `router.use('*', authMiddleware)` itself.
- **Never `JSON.parse` a D1 text column without try/catch.** Follow `src/db/queries/jobs.ts::toJob()`. Every query file exports a `toX()` deserializer; routes call those and never write raw SQL.
- **`candidates.ai_analysis` is JSON TEXT** — `{ summary, strengths, concerns }`, written by `pipeline.ts`. Parse it with try/catch like every JSON column. `candidates.score_attribution` is the same (a `ScoreAttribution` snapshot).
- **Emails never send inline.** Routes call `queueEmail()`; the every-minute cron drains `email_queue`.
- **`bcryptjs`, not `bcrypt`** — native bindings crash in Workers.
- **`nodejs_compat` is required** by the PDF/DOCX parsers for Buffer support.

---

## Database (D1)

13 tables across migrations `0001`–`0009`: `companies`, `users`, `jobs`, `candidates`, `interview_types`, `interviews`, `interview_feedback`, `email_logs`, `email_preferences`, `email_queue`, `refresh_tokens`, `quota_usage`, `candidate_skill_matches`.

Notable migrations: `0003` rebuilt `interviews` to make `interviewer_id` nullable (via `interviews_new` + rename), `0006` added `status` + `claimed_at` to `email_queue` for atomic dequeue, `0007` added `refresh_tokens`, `0008` added `quota_usage` (daily D1/KV counters — kept in D1 rather than KV so counting a write does not itself spend the KV write budget), `0009` added `candidate_skill_matches` (per-skill verdicts, NOCASE-unique per candidate) and `candidates.score_attribution`.

---

## Auth

- HS256 via `jose`; issuer `https://api.synthire.io`, audience `https://app.synthire.io`
- Payload: `{ sub, email, name, role, company_id, iat, exp }`
- Access token 15 min (`JWT_EXPIRY_SECONDS`); refresh token 30 days, stored SHA-256 hashed in `refresh_tokens`, rotated on every use by `POST /api/auth/refresh`
- Middleware reads the **`synthire_token` cookie first**, falling back to `Authorization: Bearer` (the reverse of what this file used to claim — check `src/middleware/auth.ts`).
- **Cookies use `SameSite=Lax` unless `Secure` can be set** (`sameSitePolicy()` in `middleware/auth.ts`). `SameSite=None` *requires* `Secure`; over plain http in local dev the browser rejected every auth cookie outright, including the refresh token, so an expired access token could never be renewed.
- **`POST /api/auth/refresh` returns the new access token in the body**, not only as a cookie. The client stores it for the `Authorization` header; a cookie-only refresh silently fails wherever the browser declines to keep the cookie.
- Login/signup return `{ user, token }` in the body **and** set HttpOnly cookies
- **Role guards live in `src/middleware/authorize.ts`** — `requireRecruiter()`, `requireAdmin()`, `requireOwnInterview()`. Use them; do not hand-roll `if (user.role === 'interviewer')` again. They are fail-closed allowlists, so an unrecognised role is denied.
- **Interviewers are scoped to their own interviews** — 403, not 404. The whole `/api/analytics` router is recruiter/admin only via a router-level `requireRecruiter`, registered **after** `authMiddleware` (`c.get('user')` is empty before it). A new analytics endpoint inherits the guard automatically.
- Signup auto-creates `email_preferences` with a random `unsubscribe_token`
- Login rate limit: `LOGIN_MAX_ATTEMPTS` (5) per `LOGIN_ATTEMPT_WINDOW_SECONDS` (60) per email, KV key `rl:login:{email}`. **No kill switch by design** — it is a security control, not a quota guard.

Public routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/email/resend-callback`, `GET /api/email/unsubscribe`, `GET /health`. Everything else under `/api/*` requires a JWT.

---

## AI — Workers AI fallback chain

`src/services/ai/fallback.ts`. Models come from `wrangler.toml`, so changing them needs no code edit:

| Used for | Primary | Fallback | Vars |
|---|---|---|---|
| Parsing, questions | `@cf/meta/llama-3.1-8b-instruct-fp8` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `LLM_MODEL_*` |
| Candidate scoring | `@cf/openai/gpt-oss-120b` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `LLM_SCORE_MODEL_*` |

Scoring uses `buildScoringLlmConfig()`. Picked by a live benchmark (two resumes
× 3 runs): gpt-oss-120b got 18/18 skill verdicts right, identical every run, at
~105 Neurons a resume; llama-3.3-70b 16/18 at ~97; the 8B model never produced a
`transferable` verdict. gpt-oss replies in chat-completions shape (`choices[0]`,
no `response`) — `callWorkersAI()` reads both. DeepSeek V4 Flash and GLM-5.3
Flash need the paid Workers plan.

The fallback is deliberately **stronger** than the primary — the chain fires on
invalid JSON or schema failure, which a weaker model is less likely to resolve.
Check `npx wrangler ai models` before changing a name; Workers AI deprecates
models and a dead name fails with error 5028, not a fallback.

Local dev needs migrations applied to the local D1 or `[quota] flush failed:
no such table: quota_usage` warnings appear on every request:
`npx wrangler d1 migrations apply synthire-prod --local`

- Bad JSON, failed Zod validation, or any error → try next model. Exhausted → `AppError(503)`.
- **Token budgets are per-operation** (`MAX_TOKENS_BY_OPERATION` in `fallback.ts`):
  `LLM_PARSE` 4000, `LLM_SCORE` 4000, `LLM_QUESTIONS` 1500. A single global
  `LLM_MAX_TOKENS` does not work — it was 800, which truncated resume JSON
  mid-object. That surfaces as **"returned invalid JSON"**, not as an obvious
  truncation, and JD parsing kept working because its output is small. If you
  see that error, check the log for `hit the N-token budget and was truncated`
  before blaming the model.
- **Do not add Workers AI JSON Mode** (`response_format: json_schema`). The docs
  list "Llama 3.1 8B variants" as supported, but both models here reject it:
  the 8B returns error 5025 "doesn't support JSON Schema", the 70B returns an
  upstream internal error. Valid JSON comes from an adequate budget plus
  `extractJson()` and Zod validation.
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

**Skill matching and attribution.** The same LLM call also returns a verdict per job skill — `evidenced` / `claimed` / `transferable` / `missing` (`services/scoring/skill-matches.ts`). At most 25 skills, required first. The model is **not** told dimension weights; scores stay independent and weighting stays arithmetic. Output is normalised fail-closed (unknown verdict → `missing`; nothing usable → `[]`, shown as "not available") and written to `candidate_skill_matches` via `replaceSkillMatches()` (one `db.batch()`, delete-then-insert). `aggregateScore()` also returns `contributions` that sum to the unrounded overall; `buildAttribution()` snapshots them into `candidates.score_attribution` at score time so later weight edits cannot break the breakdown. `GET /api/candidates/:id` returns `skill_matches` and `score_attribution`; `GET /api/jobs/:id/skill-gaps` (recruiter/admin) aggregates verdicts per skill over candidates that have rows.

---

## Resume upload pipeline

`POST /api/candidates/upload` validates (magic bytes, size), creates the row as `queued`, stores the file in R2, records `resume_url`, sends a `process-resume` message to `RESUME_QUEUE`, and returns **202** `{ candidateId }`. The client polls `GET /api/candidates/:id`.

The `queue()` consumer (`src/queue/`) runs `processResume`: parse (8B) → score (gpt-oss-120b) → `complete`. It is idempotent (finished or deleted candidates are skipped) and resumable (a candidate with `parsed_resume` skips parsing). `classifyFailure` decides: permanent (unreadable/missing file, missing job) → `error` + ack; AI budget exhausted → retry at the UTC reset; anything else → retry after 30 s / 120 s / 600 s. After 3 retries the message goes to the DLQ, whose consumer marks the row `error`. Any retry puts the row back to `queued`. Statuses: `queued` → `parsing` → `scoring` → `complete` | `error`.

`DELETE /api/candidates/:id` deletes the row and sends `purge-candidate`; `purgeCandidateArtifacts` removes the R2 file (with accounting), the vector and `questions:{id}`. If the send fails it purges inline.

A pipeline that dies mid-way (abandoned in a retry wait) would leave the row in `parsing`/`scoring` or `queued` for ever. The every-minute cron runs `failStaleProcessing()`, which marks rows in `pending`/`parsing`/`scoring` untouched for 10 minutes (`STALE_PROCESSING_MINUTES`) as `error`, and `queued` rows untouched for 25 hours (`QUEUED_STALE_HOURS`) as `error`, both with an "interrupted — upload again" message.

**JD files.** `POST /api/jobs/parse-jd` stores the upload at `jd-pending/{company}/{parseId}.{ext}` (expired by an R2 lifecycle rule after 1 day) and keeps a tenant-tagged record in KV for 24 h. The client creates the job with `jd_parse_id`, never a storage path; the server checks the record belongs to the caller's company (422 otherwise), moves the file to `jd/{company}/{jobId}.{ext}` and sets `jd_url`. If the pending file expired in between, the job is still created and the response carries `jd_attached: false`. A `jd-pending/` upload is counted in R2 storage accounting as soon as it's written; the lifecycle rule that deletes it after 1 day does **not** decrement that count — a small known overstatement in `GET /api/analytics/r2-usage`, not a leak of the real object.

### Infrastructure not created by `wrangler deploy`

`scripts/provision.sh dev|staging|production` (idempotent) creates the resume
queue and its DLQ, the dev Vectorize index `synthire-embeddings-dev`, the
`companyId` and `jobId` metadata indexes, and the R2 lifecycle rule that expires
`jd-pending/` after 1 day. Run it before the first deploy that binds them;
`wrangler deploy` fails if a bound queue is missing. Dev Vectorize writes go to
`synthire-embeddings-dev` — the top-level config must never name a production
resource that has no local simulator.

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
