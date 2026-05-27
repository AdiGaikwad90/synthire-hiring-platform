# CLAUDE.md — Synthire Frontend

Next.js 14 App Router UI for the Synthire AI-powered ATS. Fully wired to the Cloudflare Workers backend — no mock data is in active use.

---

## Running locally

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

Backend must be running at `http://localhost:8787` (see `backend/CLAUDE.md`).

---

## Configuration

### `frontend/.env.local` (gitignored)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8787
```

That is the only variable needed. Copy from `.env.example`:
```bash
cp .env.example .env.local
```

For production, change the value to your deployed worker URL.

---

## Folder structure

```
frontend/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root layout — fonts, providers, globals.css
│   ├── globals.css                     # ALL design tokens + component styles (~80 KB)
│   ├── providers.tsx                   # QueryClientProvider → AuthProvider → ToastProvider
│   ├── page.tsx                        # / → Landing
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (recruiter)/                    # Route group — Sidebar + Topbar layout
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── jobs/page.tsx
│   │   ├── jobs/new/page.tsx
│   │   ├── jobs/[jobId]/page.tsx       # passes jobId → <Candidates jobId={...} />
│   │   ├── candidates/page.tsx
│   │   ├── candidates/[candidateId]/page.tsx  # passes candidateId → <CandidateDetail>
│   │   ├── pipeline/page.tsx
│   │   ├── interviews/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── settings/page.tsx
│   └── (interviewer)/
│       ├── layout.tsx
│       ├── interviewer/page.tsx
│       └── interviews/[interviewId]/page.tsx  # passes interviewId → <InterviewConduct>
│
├── components/
│   ├── ui/                             # Design system primitives (barrel: @/components/ui)
│   ├── shared/
│   │   ├── Sidebar.tsx                 # NAV_ITEMS (exported, used by CommandPalette)
│   │   ├── Navigation.tsx              # Top bar — real user name from useAuth()
│   │   ├── CommandPalette.tsx          # ⌘K — uses useJobs() + useCandidates()
│   │   └── TweaksPanel.tsx             # Theme/density switcher (localStorage)
│   ├── (auth)/
│   │   ├── LoginForm.tsx               # useAuth().login()
│   │   └── SignupForm.tsx              # useAuth().signup()
│   ├── (recruiter)/
│   │   ├── Dashboard.tsx               # useAnalyticsSummary, useFunnel, useActivity, useInterviews
│   │   ├── Jobs.tsx                    # useJobs()
│   │   ├── JobForm.tsx                 # 4-step wizard → useCreateJob() on final step
│   │   ├── Candidates.tsx              # useCandidates(filters) + useJob(id); accepts jobId prop
│   │   ├── CandidateDetail.tsx         # useCandidate(id); accepts candidateId prop
│   │   ├── PipelineKanban.tsx          # useCandidates() + useUpdateCandidateStage() (optimistic)
│   │   ├── Analytics.tsx               # useFunnel, useTimeToHire, useAnalyticsSummary
│   │   ├── Settings.tsx                # useInterviewTypes + mutation hooks
│   │   ├── ScheduleModal.tsx           # useInterviewTypes + useScheduleInterview
│   │   └── ResumeBatchModal.tsx        # SSE fetch to POST /api/candidates/upload
│   └── (interviewer)/
│       ├── InterviewerHome.tsx         # useInterviews() — filtered by role
│       └── InterviewConduct.tsx        # useInterview(id) + useSubmitFeedback; accepts interviewId prop
│
├── context/
│   └── AuthContext.tsx                 # AuthProvider + useAuth() hook
├── hooks/queries/
│   ├── useJobs.ts                      # useJobs, useJob, useCreateJob, useUpdateJob
│   ├── useCandidates.ts                # useCandidates, useCandidate, useUpdateCandidateStage
│   ├── useInterviews.ts                # useInterviews, useInterview, useScheduleInterview, useSubmitFeedback
│   ├── useAnalytics.ts                 # useFunnel, useTimeToHire, useAnalyticsSummary, useActivity, useEmailStats
│   ├── useSettings.ts                  # useInterviewTypes, useCreateInterviewType, useUpdateInterviewType, useDeleteInterviewType
│   └── useEmail.ts                     # useEmailLogs, useEmailPreferences, useUpdateEmailPreferences
├── lib/
│   ├── api.ts                          # Typed API client — all endpoint groups + ApiError
│   ├── auth.ts                         # getToken/setToken/removeToken + cookie sync
│   ├── types.ts                        # Domain types (Job, Candidate, Stage, …)
│   ├── utils.ts                        # cn(), initials(), formatDate()
│   ├── icons.tsx                       # Inline SVG icon set
│   └── data.ts                         # Mock data — kept for demo reference; nothing imports it
├── middleware.ts                        # Route protection via synthire_token cookie
└── .env.example                        # → copy to .env.local
```

---

## Auth

- **Primary storage**: JWT in `localStorage` key `synthire_token` — sent as `Authorization: Bearer <token>` on every request
- **Secondary storage**: non-HttpOnly cookie `synthire_token` written by `setToken()` — used only by Next.js middleware for server-side route protection
- **`lib/auth.ts`**: `getToken()` reads localStorage; `setToken()` writes localStorage + cookie; `removeToken()` clears both
- **`lib/api.ts`**: `apiFetch` reads token from localStorage via `getToken()` and injects Bearer header. On 401, tries `POST /api/auth/refresh` once (coalesced), then redirects to `/login`
- **`context/AuthContext.tsx`**: on login/signup, receives `token` in response body and calls `setToken(token)`. Verifies session on mount via `GET /api/auth/me`
- **`middleware.ts`**: reads cookie `synthire_token`; redirects to `/login?from=<path>` if missing; protects all recruiter + interviewer routes
- **`useAuth()`** is the only place to call `login`, `logout`, `signup` — never call `api.ts` functions directly from components

---

## Data fetching

All API calls go through hooks in `hooks/queries/`. Never call `apiFetch` directly from a component.

```typescript
// Pattern for every data-dependent component
const { data, isLoading, isError } = useJobs()
if (isLoading) return <Skeleton />
if (isError)   return <ErrorState />
```

**React Query v5** — cache keys, stale times, and invalidation are managed inside the hooks. `useActivity()` refetches every 30 s.

### Optimistic updates

`useUpdateCandidateStage()` applies optimistic updates on drag-drop and rolls back on error. Follow this pattern for any other mutation that needs immediate UI feedback.

---

## API client — `lib/api.ts`

`apiFetch<T>(path, options)`:
- Adds `Authorization: Bearer <token>` header
- On 401: calls `removeToken()` then `router.push('/login')`
- Throws `ApiError` (extends Error, has `.status`) on non-2xx

Grouped exports: `authApi`, `jobsApi`, `candidatesApi`, `interviewsApi`, `analyticsApi`, `settingsApi`, `emailApi`

Key exported types: `PaginatedData<T>`, `ApiJob`, `ApiCandidate`, `ApiInterview`, `ApiInterviewType`, `AnalyticsSummary`, `ActivityItem`, `EmailStats`, `ApiEmailLog`, `ApiEmailPreferences`

---

## Resume upload (polling)

`ResumeBatchModal` posts to `POST /api/candidates/upload` (multipart: `file`, `jobId`), receives `{ candidateId }` immediately (202), then polls `GET /api/candidates/:id` every 2 seconds until `processing_status` is `complete` or `failed` (or 60 ticks = 2 minutes timeout).

File state progression: `queued` → `parsing` → `scoring` → `done` / `error`. Stage advances to "done" when all files settle.

---

## Route map

| URL | Component | Data source |
|---|---|---|
| `/` | `Landing` | Static |
| `/login` | `LoginForm` | `useAuth().login()` |
| `/signup` | `SignupForm` | `useAuth().signup()` |
| `/dashboard` | `Dashboard` | `useAnalyticsSummary`, `useFunnel`, `useActivity`, `useInterviews` |
| `/jobs` | `Jobs` | `useJobs()` |
| `/jobs/new` | `JobForm` | `useCreateJob()` |
| `/jobs/[jobId]` | `Candidates` | `useCandidates({ job_id })` |
| `/candidates` | `Candidates` | `useCandidates()` |
| `/candidates/[candidateId]` | `CandidateDetail` | `useCandidate(id)` |
| `/pipeline` | `PipelineKanban` | `useCandidates()` + `useUpdateCandidateStage()` |
| `/analytics` | `Analytics` | `useFunnel`, `useTimeToHire`, `useAnalyticsSummary` |
| `/settings` | `Settings` | `useInterviewTypes()` |
| `/interviewer` | `InterviewerHome` | `useInterviews()` |
| `/interviews/[interviewId]` | `InterviewConduct` | `useInterview(id)` + `useSubmitFeedback` |

---

## What is NOT wired (known gaps)

| Feature | Status |
|---|---|
| Analytics Sources chart | Hardcoded placeholder — source tracking not implemented in backend |
| Analytics Round Performance | Returns empty array — no per-round aggregation in backend |
| AI interview question generation | Button shows placeholder message — `generate-questions.ts` prompt exists but no route |
| JD upload (`JDUploadModal`) | Simulated with setTimeout — no `/api/jobs/parse-jd` endpoint |

---

## Design system

All tokens are CSS custom properties in `app/globals.css`. Components use the `ts*` class prefix. Themes and density switch via `data-theme` and `data-density` on `<html>`, persisted in `localStorage` by `TweaksPanel`.

AI-surface utilities: `.ai-text` (gradient text), `.ai-border` (gradient ring), `.ai-surface` (glow background).

---

## Conventions

- **Imports**: use `@/` alias; UI primitives from `@/components/ui` (barrel)
- **Client components**: all `components/` files are `'use client'`; app pages are server components
- **TypeScript**: `strict: false` — don't fight existing `any` props; type new code properly
- **Styling**: prefer existing `ts*` class names; inline `style={{}}` for one-offs; add new classes to `globals.css`
- **Re-exports**: `CandidateCard`, `FilterPanel`, `JobCard`, `FeedbackForm`, `ScoreDisplay` are thin re-export stubs — the actual component bodies live inside the screen file they're named after

---

## Typecheck

```bash
npm run typecheck    # tsc --noEmit — target 0 errors
```
