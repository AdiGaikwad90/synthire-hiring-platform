# CLAUDE.md — Synthire Frontend

Next.js 15 App Router UI (React 18) for the Synthire ATS. Fully wired to the Workers backend — no mock data in active use.

---

## Commands

```bash
npm run dev        # http://localhost:3000 — backend must be up on :8787
npm run typecheck  # tsc --noEmit — must exit 0
npm run lint       # eslint . (flat config) — clean, keep it that way
npm test           # vitest — LOGIC only (lib/, middleware). No component rendering.
npm run test:coverage
npm run deploy     # next-on-pages build + wrangler pages deploy
```

Only one env var, in `.env.local` (gitignored): `NEXT_PUBLIC_API_URL=http://localhost:8787`.

> Migrated off `next lint` (removed in Next 16). Both projects now run the
> ESLint 9 flat-config CLI. `eslint-config-next` still ships legacy
> `.eslintrc`-shaped configs, so `eslint.config.mjs` bridges it through
> `FlatCompat` — importing it directly gives a CJS/ESM resolution error.

---

## Conventions

**Read `UI_CONVENTIONS.md` before adding or changing UI.** It is the binding
reference for which primitive to reach for, where a component belongs
(`ui/` vs `shared/` vs a role folder), styling and token rules, and the
new-screen checklist. `FE_DESIGN_GUIDELINES.md` covers visual direction;
`UI_CONVENTIONS.md` covers structure.

If you add a `components/ui/` primitive, add anything reusable to `lib/`, or
change an existing component's API, **update `UI_CONVENTIONS.md` in the same
PR** — see "Keeping these docs current" in the root `CLAUDE.md`.

- **Never call `apiFetch` directly from a component** — always go through `hooks/queries/`.
- **Never hand-roll `Authorization: Bearer` with raw `fetch`.** Binary downloads go through `apiFetchBlob()`; everything else through the hooks. Four components used to attach the header themselves, which skipped refresh-on-401 — so the resume viewer and interview recordings broke silently the moment the 15-minute access token expired, showing an empty panel.
- **Never call `lib/api.ts` auth functions directly** — `useAuth()` is the only entry point for `login` / `logout` / `signup`.
- Every data-dependent component needs a loading and an error guard:
  ```tsx
  const { data, isLoading, isError } = useJobs()
  if (isLoading) return <Skeleton />
  if (isError)   return <ErrorState />
  ```
- Imports use the `@/` alias; UI primitives come from the `@/components/ui` barrel.
- Every file in `components/` is `'use client'`; pages under `app/` are server components and export `runtime = "edge"` (19 of them — required by next-on-pages). The one route handler, `app/api/auth/[...path]/route.ts`, is edge too.
- `strict: false` — don't fight `any` in existing components, but type new code properly.
- Styling: prefer existing `ts*` class names, inline `style={{}}` for one-offs, new classes go in `app/globals.css`.
- **No thin re-export stubs.** The five that existed are deleted — import components from the file that defines them.
- **Dates go through `formatDate` / `formatDateLong` / `formatTime` / `formatDateTime`** in `@/lib/utils`. Never call `toLocaleDateString()` in a component — a bare call follows the viewer's browser locale.
- **Candidate stages come from `@/lib/stages`** (`STAGES`, `STAGE_LABELS`, `STAGE_FILTER_OPTIONS`, `stageLabel()`, `stageTone()`). Never hand-write a list of stages or capitalise a raw value: the Candidates filter once offered "Applied" and "Interviewing", which are not stages, and matched nothing (SYN-006). The list mirrors `CANDIDATE_STAGES` in `backend/src/types/api.ts`; the API answers 422 to anything else.
- **Icon-only buttons use `IconButton`**, which requires a `label` and applies it as `aria-label`.

---

## Auth

- **Primary**: JWT in `localStorage` under `synthire_token`, sent as `Authorization: Bearer`. It is the only credential the browser presents to the API.
- **Route gate**: the `synthire_session` cookie — the **role only**, never a token — written by `setToken()` / `markSession()` in `lib/auth.ts`, 30 days (as long as the refresh token), renewed on every refresh and whenever `/api/auth/me` confirms the session. `middleware.ts` reads it; anything but `recruiter` / `interviewer` / `admin` counts as signed out. It is a UX guard, not a security boundary.
- **Never name a frontend cookie `synthire_token` or `synthire_refresh`** — those are the API's. The gate used to be called `synthire_token`; on localhost (cookies ignore the port) the API's HttpOnly 15-minute cookie of that name shadowed it and users were bounced to `/login` after 15 minutes (SYN-007).
- **Login, signup, refresh and logout go to the app's own origin**: `lib/api.ts` sends those four paths to `/api/auth/*`, where `app/api/auth/[...path]/route.ts` forwards them to the API. The app and the API are different sites, so a cookie the API sets directly is third-party; Safari never stores it, and sessions died when the 15-minute access token did. The forwarder passes only those four calls and only the refresh cookie (rewritten to `SameSite=Lax`), and drops the API's access cookie. Everything else — including `/api/auth/me` — goes straight to the API with the Bearer header. Forwarded calls share one rate-limit bucket at the API (they all arrive from Cloudflare's address), so do not route more calls through it.
- `lib/api.ts` injects the Bearer header, and on a 401 attempts `POST /api/auth/refresh` **once** (coalesced across concurrent requests) before redirecting to `/login`. The replay rebuilds its headers so it carries the **new** token. A 401 from login/signup/logout is that call's own answer (wrong password) and never triggers a refresh.
- `/login` and `/signup` forward an already signed-in visitor (`useForwardSignedIn()` in `context/AuthContext.tsx`) to `postLoginPath(from)` — a path on this site, else `/dashboard`; `//host` style values are refused.
- `middleware.ts` redirects to `/login?from=<path>` when the gate cookie is absent; matcher excludes `_next/*`, `favicon.ico`, and `api`. It also sets the security headers (CSP, framing, HSTS, nosniff) from `lib/security-headers.ts` on every page response, redirects included — `next.config.mjs` `headers()` is ignored by the Cloudflare Pages build, so headers must not live there (`UI_CONVENTIONS.md` §4b).
- `AuthContext` verifies the session on mount via `GET /api/auth/me`.

---

## Data fetching

React Query v5. Cache keys, stale times, and invalidation live inside the hooks in `hooks/queries/`:

| Hook file | Exports |
|---|---|
| `useJobs.ts` | `useJobs`, `useJob`, `useCreateJob`, `useUpdateJob` |
| `useCandidates.ts` | `useCandidates`, `useCandidate`, `useUploadResume`, `useUploadProgress`, `useUpdateCandidateStage`, `useGenerateQuestions`, `useInterviewQuestions` |
| `useInterviews.ts` | `useInterviews`, `useInterview`, `useScheduleInterview`, `useSubmitFeedback`, `useInterviewFeedback` |
| `useAnalytics.ts` | `useFunnel`, `useTimeToHire`, `useAnalyticsSummary`, `useActivity`, `useEmailStats` |
| `useSettings.ts` | `useInterviewTypes` + create/update/delete |
| `useEmail.ts` | `useEmailLogs`, `useEmailPreferences`, `useUpdateEmailPreferences` |

`useActivity()` refetches every 30s. **`useCandidates()` re-checks every 10 s while any listed candidate is still being processed** and stops when all are finished or failed (`candidateListPollInterval()` in `lib/scoring.ts`) — so a list never needs a reload to show an upload's result, whoever uploaded it. A mutation that adds or changes candidates must also invalidate the job counts and `['analytics']`; `useUploadResume()` shows how. `useUpdateCandidateStage()` does an optimistic update with rollback on error — copy that pattern for any mutation needing instant feedback.

---

## Async backend operations

Both long-running backend calls return a job id at 202 and are polled from the client — neither uses SSE:

- **Resume upload** — `ResumeBatchModal` uploads through `useUploadResume()` (`POST /api/candidates/upload` → `{ candidateId }`) and follows each file with `useUploadProgress()`, which polls every 2 s for up to 2 min. The dialog owns no timers and no row state: each row is derived by `uploadRow()` in `lib/upload-status.ts` — `uploading` → `queued` → `parsing` → `scoring` → `done` / `error` (with the reason); after the window a still-running file shows "Still processing" (`background`) — processing runs on a queue and can take longer. Lists, job counts and dashboard numbers are refreshed when a file is accepted and again each time one settles (SYN-005).
- **JD parsing** — `JDUploadModal` posts to `POST /api/jobs/parse-jd`, gets `{ parseId }`, then polls `GET /api/jobs/parse-jd/:parseId` until it stops returning `{ status: 'processing' }`.

---

## Route map

| URL | Component | Data |
|---|---|---|
| `/` | `Landing` | static |
| `/login` · `/signup` | `LoginForm` · `SignupForm` | `useAuth()` |
| `/dashboard` | `Dashboard` | `useAnalyticsSummary`, `useFunnel`, `useActivity`, `useInterviews` |
| `/jobs` | `Jobs` | `useJobs()` |
| `/jobs/new` | `JobForm` | `useCreateJob()` |
| `/jobs/[jobId]` | `Candidates` | `useCandidates({ job_id })` |
| `/jobs/[jobId]/edit` | `JobEditForm` | `useJob()` + `useUpdateJob()` |
| `/candidates` | `Candidates` | `useCandidates()` |
| `/candidates/[candidateId]` | `CandidateDetail` | `useCandidate(id)` (incl. `skill_matches`, `score_attribution`), `useJob(job_id)` |
| `/pipeline` | `PipelineKanban` | `useCandidates()` + `useUpdateCandidateStage()` |
| `/interviews` | `InterviewerHome` (reused by the recruiter route) | `useInterviews()` |
| `/analytics` | `Analytics` | `useFunnel`, `useTimeToHire`, `useAnalyticsSummary` |
| `/settings` | `Settings` | `useInterviewTypes()` |
| `/interviewer` | `InterviewerHome` | `useInterviews()` — role-filtered |
| `/interviews/[interviewId]` | `InterviewConduct` | `useInterview(id)`, `useCandidate`, `useGenerateQuestions` |

`app/(recruiter)/layout.tsx` wraps recruiter routes in Sidebar + Topbar; `app/(interviewer)/layout.tsx` bounces recruiters to `/dashboard` unless the path starts with `/interviews/`.

Provider order in `app/providers.tsx`: `QueryClientProvider` → `AuthProvider` → `ToastProvider`.

---

## Design system

Tokens are CSS custom properties in `app/globals.css` (~80 KB, holds all component styles). Themes and density switch via `data-theme` / `data-density` on `<html>`, persisted to localStorage by `TweaksPanel`. AI-surface utilities: `.ai-text`, `.ai-border`, `.ai-surface`.

See `FE_DESIGN_GUIDELINES.md` for visual direction and `UI_CONVENTIONS.md` for structure before building new UI.

---

## Known gaps

| Feature | Status |
|---|---|
| Analytics **Sources** chart | `GET /api/analytics/sources` exists but returns all-zero stubs; no source tracking in the pipeline. The frontend doesn't render it. |
| Analytics **Round Performance** | No per-round aggregation endpoint |
