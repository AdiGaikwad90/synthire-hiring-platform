# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this project is

**Synthire** — an AI-powered ATS. Two subprojects side by side:

- `backend/` — Cloudflare Workers API (Hono, D1, R2, KV, Vectorize, Workers AI)
- `frontend/` — Next.js 15 App Router UI

Both are wired end to end. `frontend/lib/data.ts` is dead mock data kept for demo reference — nothing imports it.

**Deeper docs load automatically when you work in those directories** — read them instead of re-deriving:

- `backend/CLAUDE.md` — config tiers, bindings, every route, service internals
- `frontend/CLAUDE.md` — folder layout, hooks, component conventions
- `frontend/FE_DESIGN_GUIDELINES.md` — visual/design rules for UI work

---

## Commands

```bash
cd backend  && npm run dev        # wrangler dev on :8787
cd frontend && npm run dev        # next dev on :3000

cd backend  && npm run typecheck  # must be 0 errors in src/
cd frontend && npm run typecheck  # must be 0 errors in src/
cd backend  && npm test           # vitest (run once); npm run test:watch to watch
cd backend  && npm run lint       # eslint (flat config, typescript-eslint) — clean
cd frontend && npm run lint       # next lint — has pre-existing findings, not a gate

cd backend  && npm run deploy     # applies D1 migrations, then deploys production
cd backend  && npm run deploy:staging
cd frontend && npm run deploy     # next-on-pages build + wrangler pages deploy
```

Before first run, copy `backend/.dev.vars.example` → `backend/.dev.vars` and fill it in, and set `NEXT_PUBLIC_API_URL=http://localhost:8787` in `frontend/.env.local`. Cloudflare resource IDs are already provisioned and committed in `backend/wrangler.toml`.

Both tsconfigs set `skipLibCheck: true`, so `typecheck` reports only your own code — a non-zero exit is a real error in `src/`, not dependency noise. Don't turn it off: `unpdf`, `mammoth`, and `tinybench` ship `.d.ts` files that produce ~88 errors under this repo's `lib`/`types` settings.

**CI** (`.github/workflows/ci.yml`, on push to `main`/`feature/**` and PRs to `main`): backend typecheck + test, frontend typecheck. Don't push work that fails these.

---

## Testing

@TESTING_RULES.md

---

## Gotchas

- **Never `JSON.parse` a D1 text column without a try/catch.** All JSON columns are stored as `TEXT`. Follow `backend/src/db/queries/jobs.ts::toJob()`.
- **Emails never send inline.** Everything goes into the `email_queue` D1 table; a cron (every minute) drains it via `processEmailQueue()`. Queue with `queueEmail()` in `src/db/queries/email.ts`. Atomic dequeue uses `UPDATE...RETURNING` — don't replace it with select-then-update.
- **Resume upload returns 202 immediately.** `POST /api/candidates/upload` creates the row, stores to R2, returns `{ candidateId }`; parsing/scoring runs in `waitUntil`. The client polls `GET /api/candidates/:id` for `processing_status`. Don't make the upload synchronous.
- **Cloudflare bindings are not env vars.** `env.DB`, `env.RESUME_BUCKET`, `env.KV_CACHE`, `env.VECTORIZE`, `env.AI` are injected objects declared in `wrangler.toml` — there is no `D1_DATABASE_ID` at runtime.
- **Frontend `strict: false`.** Don't fight type warnings in existing components; do type new code properly.
- **Never call `apiFetch` directly in components** — use the hooks in `frontend/hooks/queries/`.

---

## Auth

- Access token: JWT HS256 (`jose`), **15-minute** expiry. Refresh token: 30-day opaque token, stored hashed in `refresh_tokens`, rotated on use via `POST /api/auth/refresh`.
- **Primary auth is the `Authorization: Bearer` header** (token in `localStorage`). The `synthire_token` cookie is secondary — it exists so `frontend/middleware.ts` can gate routes, and only works same-domain.
- Roles: `recruiter` | `interviewer` | `admin`. **Interviewers are scoped** — they may only see their own interviews. Preserve this in any new query.
- Unauthenticated routes: `/api/auth/*`, `/api/email/resend-callback`, `/api/email/unsubscribe`, `/health`.

---

## AI pipeline

LLM calls go through Workers AI (not OpenRouter) with a two-model fallback chain set in `wrangler.toml`:

| Env | Primary | Fallback |
|---|---|---|
| production / dev | `@cf/meta/llama-3.1-8b-instruct-awq` | `@cf/meta/llama-3.2-3b-instruct` |
| staging | `@cf/meta/llama-3.1-8b-instruct` | `@cf/meta/llama-3.2-3b-instruct` |

Invalid JSON or schema failure → next model. Hard stop at `NEURONS_DAILY_LIMIT` (10000/day prod) → throws 503. See `backend/src/services/ai/fallback.ts`.

Resume text extraction: `unpdf` for PDF, `mammoth` for DOCX (file type validated by magic bytes, not extension).
Embeddings: `@cf/baai/bge-large-en-v1.5` → 1024-dim → Vectorize. Score = cosine similarity (30%) + LLM dimension scores (70%). Scoring is v2: each dimension's importance is set independently 0–100 and the backend normalizes by weighted average — there is **no** "must sum to 100" rule.

---

## Not yet wired to real endpoints

Leave these as-is unless asked — they are known placeholders, not bugs:

- Analytics **Sources** chart — `GET /api/analytics/sources` returns all-zero stubs; nothing tracks candidate source, and the frontend doesn't render it
- Analytics **Round Performance** chart — no per-round aggregation endpoint

AI interview question generation **is** wired (`POST /api/candidates/:id/questions`, KV-cached, `useGenerateQuestions` in InterviewConduct) — earlier docs called it a placeholder.

---

## Git

Commit prefix convention: `feat:` / `fix:` / `chore:`
