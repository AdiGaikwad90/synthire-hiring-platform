# CLAUDE.md — Synthire Frontend

Next.js 15 App Router UI (React 18) for the Synthire ATS. Fully wired to the Workers backend — no mock data in active use.

---

## Commands

```bash
npm run dev        # http://localhost:3000 — backend must be up on :8787
npm run typecheck  # tsc --noEmit — must exit 0
npm run lint       # next lint — currently clean, keep it that way
npm run deploy     # next-on-pages build + wrangler pages deploy
```

Only one env var, in `.env.local` (gitignored): `NEXT_PUBLIC_API_URL=http://localhost:8787`.

> `next lint` is deprecated and removed in Next.js 16. Migrate with `npx @next/codemod@canary next-lint-to-eslint-cli .` when convenient — the backend already uses the flat-config ESLint CLI.

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
- **Never call `lib/api.ts` auth functions directly** — `useAuth()` is the only entry point for `login` / `logout` / `signup`.
- Every data-dependent component needs a loading and an error guard:
  ```tsx
  const { data, isLoading, isError } = useJobs()
  if (isLoading) return <Skeleton />
  if (isError)   return <ErrorState />
  ```
- Imports use the `@/` alias; UI primitives come from the `@/components/ui` barrel.
- Every file in `components/` is `'use client'`; pages under `app/` are server components and export `runtime = "edge"` (19 of them — required by next-on-pages).
- `strict: false` — don't fight `any` in existing components, but type new code properly.
- Styling: prefer existing `ts*` class names, inline `style={{}}` for one-offs, new classes go in `app/globals.css`.
- `CandidateCard`, `FilterPanel`, `JobCard`, `FeedbackForm`, `ScoreDisplay` are thin re-export stubs whose bodies live in the screen file they're named after. **Do not add more** — import from the real file. They are listed as drift in `UI_CONVENTIONS.md` §9 and should be deleted when touched.

---

## Auth

- **Primary**: JWT in `localStorage` under `synthire_token`, sent as `Authorization: Bearer`.
- **Secondary**: a non-HttpOnly cookie of the same name, written by `setToken()`. It exists solely so `middleware.ts` can gate routes server-side; it only works same-domain.
- `lib/api.ts` injects the Bearer header, and on a 401 attempts `POST /api/auth/refresh` **once** (coalesced across concurrent requests) before redirecting to `/login`.
- `middleware.ts` redirects to `/login?from=<path>` when the cookie is absent; matcher excludes `_next/*`, `favicon.ico`, and `api`.
- `AuthContext` verifies the session on mount via `GET /api/auth/me`.

---

## Data fetching

React Query v5. Cache keys, stale times, and invalidation live inside the hooks in `hooks/queries/`:

| Hook file | Exports |
|---|---|
| `useJobs.ts` | `useJobs`, `useJob`, `useCreateJob`, `useUpdateJob` |
| `useCandidates.ts` | `useCandidates`, `useCandidate`, `useUpdateCandidateStage`, `useGenerateQuestions`, `useInterviewQuestions` |
| `useInterviews.ts` | `useInterviews`, `useInterview`, `useScheduleInterview`, `useSubmitFeedback`, `useInterviewFeedback` |
| `useAnalytics.ts` | `useFunnel`, `useTimeToHire`, `useAnalyticsSummary`, `useActivity`, `useEmailStats` |
| `useSettings.ts` | `useInterviewTypes` + create/update/delete |
| `useEmail.ts` | `useEmailLogs`, `useEmailPreferences`, `useUpdateEmailPreferences` |

`useActivity()` refetches every 30s. `useUpdateCandidateStage()` does an optimistic update with rollback on error — copy that pattern for any mutation needing instant feedback.

---

## Async backend operations

Both long-running backend calls return a job id at 202 and are polled from the client — neither uses SSE:

- **Resume upload** — `ResumeBatchModal` posts to `POST /api/candidates/upload`, gets `{ candidateId }`, then polls `GET /api/candidates/:id` every 2s until `processing_status` settles (60 ticks / 2 min timeout). Per-file state: `queued` → `parsing` → `scoring` → `done` / `error`.
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
| `/candidates/[candidateId]` | `CandidateDetail` | `useCandidate(id)` |
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
| `lib/data.ts` | Dead mock data, kept for demo reference — nothing imports it |
| `components/(recruiter)/InterviewsList.tsx` | Dead — not imported anywhere; `/interviews` renders `InterviewerHome` instead |
