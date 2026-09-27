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

**CI/CD** (`.github/workflows/ci.yml`). On every push to `main`/`feature/**` and PRs to `main`: backend lint + typecheck + tests (unit *and* integration) + coverage thresholds, frontend lint + typecheck.

**A push to `main` deploys automatically** — backend to Cloudflare Workers (migrations first), then the frontend to Pages. Set repository variable `DEPLOY_STAGING=true` to rehearse against staging first; unset means staging is skipped. A green run is not proof everything shipped — check the deploy jobs say `success`, not `skipped`.

---

## Testing

@TESTING.md

`TESTING_RULES.md` is the manual pre-release browser checklist. `TESTING.md` is
the automated strategy CI enforces — read that one before writing a test.

## Keeping these docs current

**Docs are part of the change, not a follow-up.** A PR that makes any of the
changes below and does not update the matching doc is incomplete — stale docs
are worse than none, because they get trusted.

| You changed | Update |
|---|---|
| Added a `components/ui/` primitive | primitive catalogue in `frontend/UI_CONVENTIONS.md` |
| Added anything reusable to `frontend/lib/` or `components/shared/` | `frontend/UI_CONVENTIONS.md` (§3 where things live, §6 formatting) |
| Changed an existing component's props or behaviour | `frontend/UI_CONVENTIONS.md`, and `frontend/CLAUDE.md` if a screen's data source moved |
| Added a route or a `hooks/queries/` hook | route map / hooks table in `frontend/CLAUDE.md` |
| Added a backend service, route, or `src/` folder | `backend/CLAUDE.md` |
| Added an env var or binding | `src/types/bindings.ts`, all three `wrangler.toml` env blocks, and `backend/CLAUDE.md` |
| Added a D1 migration | table list + count in `backend/CLAUDE.md` |
| Changed a guardrail or its default | guardrails table in `backend/CLAUDE.md` |
| Changed testing setup, tiers, or thresholds | `TESTING.md` |
| **Fixed** something in a "known drift" table | **delete that row** — the table must shrink as it is worked off |
| Wired up something previously listed as a placeholder | "Not yet wired" section below |

Two rules that keep this honest:

- **Verify before documenting.** Read the source, don't describe it from
  memory. Most stale lines in this repo came from trusting an older doc.
- **Delete rather than let a section rot.** A removed section is recoverable
  from git; a confidently wrong one costs an hour of someone's day.

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
| all | `@cf/meta/llama-3.1-8b-instruct-fp8` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |

**The fallback must be equal or stronger than the primary.** The chain exists for
invalid-JSON and schema failures, and a weaker model is less likely to fix those.
Falling back to `llama-3.2-3b` did exactly that and produced "All AI models
exhausted". **Workers AI removes models** — `llama-3.1-8b-instruct-awq` was
deprecated 2026-05-30 and broke JD parsing with error 5028. Verify names against
`npx wrangler ai models` before changing them.

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

### GitHub account — never switch globally

This repo belongs to the personal account **AdiGaikwad90**, but the machine's
default `gh` account is a work one. **Do not run `gh auth switch`** — it changes
the active account for every repository on the machine, and it silently reverts,
which has already caused a failed secret write and a 404 that looked like lost
branch protection.

Everything is scoped per-repo instead, and needs no switching:

| Concern | How it is pinned |
|---|---|
| Commit author | `git config --local user.name/user.email` → `AdiGaikwad90 <143449168+AdiGaikwad90@users.noreply.github.com>` |
| Push credentials | a **local** `credential.https://github.com.helper` that shells out to `gh auth token --user AdiGaikwad90` per request — no token is stored in the repo, and the keychain is not consulted |
| `gh` commands | prefix with a token override, below |

```bash
# Run any gh command against this repo without touching the global account:
GH_TOKEN=$(gh auth token --user AdiGaikwad90) gh <command>
```

The global `git` identity and the global `gh` active account must stay as they
are — they belong to work repositories. Verified: `git push` and `gh api`
both reach this repo while `gh auth status` still shows the work account
active.

> Pinning only `credential.username` is **not** enough — osxkeychain then looks
> for a credential filed under that user and fails with "Invalid username or
> token". The helper above is what actually supplies the token.
