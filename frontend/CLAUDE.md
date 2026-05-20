# CLAUDE.md — Synthire Frontend

This file is the orientation document for Claude Code (or any AI/human contributor) joining this repository. It explains what's been built, where it lives, the conventions in play, and the seams where the backend plugs in.

If you only read one section, read **§3 (Folder Structure)** and **§7 (Backend Wiring Map)**.

---

## 1. What this is

**Synthire** is an AI-native Applicant Tracking System (ATS) for high-volume hiring. This repository is the **frontend only** — a Next.js 14 (App Router) + TypeScript application that ships the full UI surface for two personas:

- **Recruiters** — create jobs, screen candidates, run pipelines, schedule interviews, view analytics.
- **Interviewers** — see assigned interviews, conduct them, submit feedback.

The frontend was originally built as a single-file HTML prototype (~13 screens) and has been refactored into the Next.js structure documented below. **All UI is implemented; all data is currently mocked.** Backend integration is the next step.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14** (App Router) | RSC where possible, `'use client'` on interactive surfaces |
| Language | **TypeScript 5** | `strict: false` initially — tighten as you wire types |
| Styling | **Custom CSS** in `app/globals.css` + **Tailwind** configured but minimally used | All design tokens live as CSS custom properties; Tailwind is set up for adding utility classes later |
| Icons | **Inline SVG icon set** in `lib/icons.tsx` (lucide-style API) | `lucide-react` is also installed — swap per-icon if you prefer |
| State | **`useState` only** | No Zustand/Redux/React Query yet — add when wiring APIs |
| Forms | **Native + local state** | No react-hook-form yet |
| Class utils | `clsx` + `tailwind-merge` via `lib/utils.ts::cn()` | shadcn-style helper |

**No backend yet.** All data comes from `lib/data.ts`.

---

## 3. Folder structure

```
frontend/
├── app/                                    # Next.js App Router
│   ├── layout.tsx                          # Root layout — fonts, providers, globals.css, Tweaks panel
│   ├── globals.css                         # ⚠️ ALL design tokens + ALL component styles (~80 KB)
│   ├── providers.tsx                       # ToastProvider wrapper
│   ├── page.tsx                            # / → Landing (marketing page)
│   │
│   ├── (auth)/                             # Route group, no shared layout
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   │
│   ├── (recruiter)/                        # Route group with Sidebar + Topbar
│   │   ├── layout.tsx                      # Sidebar + Navigation + CommandPalette
│   │   ├── dashboard/page.tsx
│   │   ├── jobs/
│   │   │   ├── page.tsx                    # /jobs — list
│   │   │   ├── new/page.tsx                # /jobs/new — wizard (Step 3 = scoring weights)
│   │   │   └── [jobId]/page.tsx            # /jobs/:id — job detail = candidate list
│   │   ├── candidates/
│   │   │   ├── page.tsx                    # /candidates — list w/ filters
│   │   │   └── [candidateId]/page.tsx      # /candidates/:id — resume + AI breakdown
│   │   ├── pipeline/page.tsx               # Drag-drop Kanban
│   │   ├── interviews/page.tsx             # Recruiter view of upcoming/past interviews
│   │   ├── analytics/page.tsx              # KPIs + 4 charts
│   │   └── settings/page.tsx               # Interview rounds configurator
│   │
│   └── (interviewer)/                      # Interviewer surfaces
│       ├── layout.tsx                      # Top nav only (no sidebar)
│       ├── interviewer/page.tsx            # Today / upcoming / pending feedback
│       └── interviews/[interviewId]/page.tsx  # Conduct interview + feedback form
│
├── components/
│   ├── ui/                                 # Design-system primitives (16 files + index.ts barrel)
│   │   ├── button.tsx, card.tsx, badge.tsx, avatar.tsx
│   │   ├── input.tsx (Input + Textarea), slider.tsx
│   │   ├── toggle.tsx (Toggle + Checkbox)
│   │   ├── score.tsx (ScoreRing + ScoreBar + ScorePill)
│   │   ├── tabs.tsx, modal.tsx, toast.tsx, tooltip.tsx
│   │   ├── icon-button.tsx, stage-pill.tsx
│   │   ├── search-input.tsx, ai-pill.tsx
│   │   └── index.ts                        # Barrel: import { Button, Card, ... } from "@/components/ui"
│   │
│   ├── shared/                             # Cross-persona components
│   │   ├── Sidebar.tsx                     # Recruiter sidebar; uses Next Link + usePathname
│   │   ├── Navigation.tsx                  # Top bar (breadcrumbs + search + user menu)
│   │   ├── Logo.tsx
│   │   ├── CommandPalette.tsx              # ⌘K palette
│   │   ├── TweaksPanel.tsx                 # Floating panel for theme + density (localStorage)
│   │   └── NotificationToast.tsx           # Re-exports ToastProvider/useToast from ui/toast
│   │
│   ├── (auth)/
│   │   ├── AuthLayout.tsx                  # Two-pane shell for login/signup
│   │   ├── LoginForm.tsx
│   │   ├── SignupForm.tsx
│   │   └── Landing.tsx                     # Marketing site (lives here as it's pre-auth)
│   │
│   ├── (recruiter)/                        # Recruiter-facing components
│   │   ├── Dashboard.tsx                   # Main screen + exports StatCard, AIInsightsCard, FunnelChart, LineChart, ActivityRow
│   │   ├── Jobs.tsx                        # Jobs list + JobCard + JobPipelineBar
│   │   ├── JobCard.tsx                     # Re-export from Jobs
│   │   ├── JobForm.tsx                     # ⭐ Job creation wizard (Step 3 = scoring weights with sliders)
│   │   ├── Candidates.tsx                  # Candidate list + filter rail (defines CandidateCard, FilterPanel inside)
│   │   ├── CandidateCard.tsx               # Re-export from Candidates
│   │   ├── FilterPanel.tsx                 # Re-export from Candidates
│   │   ├── CandidateDetail.tsx             # Resume preview + AI breakdown + tabs
│   │   ├── PipelineKanban.tsx              # Drag-and-drop Kanban
│   │   ├── ScheduleModal.tsx               # 4-step interview scheduling (side modal)
│   │   ├── JDUploadModal.tsx               # PDF→JD parsing flow
│   │   ├── ResumeBatchModal.tsx            # Bulk resume upload + scoring
│   │   ├── Dropzone.tsx                    # Shared dropzone + FileRow primitives for upload modals
│   │   ├── ScoreDisplay.tsx                # Re-exports ScoreRing/ScoreBar/ScorePill from ui
│   │   ├── Analytics.tsx                   # KPIs + 4 charts + AI insights row
│   │   └── Settings.tsx                    # Interview rounds CRUD + templates
│   │
│   └── (interviewer)/
│       ├── InterviewerHome.tsx             # Today / upcoming / pending / past
│       ├── InterviewConduct.tsx            # Split-pane: resume / JD / AI questions + notes + scoring
│       └── FeedbackForm.tsx                # Re-export from InterviewConduct
│
├── lib/
│   ├── data.ts                             # 🔌 MOCK DATA — replace with API calls
│   ├── icons.tsx                           # Inline SVG icon set (lucide-style)
│   ├── types.ts                            # Domain types: Job, Candidate, Stage, Recommendation, …
│   └── utils.ts                            # cn(), initials(), formatDate()
│
├── package.json
├── tsconfig.json                           # strict: false
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── .env.example                            # Backend URL, auth secret, upload bucket, AI service
├── .gitignore
├── README.md                               # Quick-start
└── CLAUDE.md                               # This file
```

### Why the `(name)` parens?

Next.js **route groups**. Folders wrapped in `()` don't appear in the URL but allow grouping pages by persona/layout. So `app/(recruiter)/dashboard/page.tsx` renders at `/dashboard`, not `/recruiter/dashboard`.

We use the same pattern under `components/` purely as **organizational sugar** — `(recruiter)` and `(interviewer)` group components by who uses them. There's no Next.js semantic on `components/` folders.

---

## 4. Routing map

| URL | File | Persona | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` | Public | Marketing landing |
| `/login` | `app/(auth)/login/page.tsx` | Public | Currently routes to `/dashboard` on submit |
| `/signup` | `app/(auth)/signup/page.tsx` | Public | Currently routes to `/dashboard` on submit |
| `/dashboard` | `app/(recruiter)/dashboard/page.tsx` | Recruiter | Stats, AI insights, funnel, today's interviews |
| `/jobs` | `app/(recruiter)/jobs/page.tsx` | Recruiter | Table + grid views |
| `/jobs/new` | `app/(recruiter)/jobs/new/page.tsx` | Recruiter | 4-step wizard; step 3 = scoring weights |
| `/jobs/[jobId]` | `app/(recruiter)/jobs/[jobId]/page.tsx` | Recruiter | Job detail = candidate list (uses `Candidates` component) |
| `/candidates` | `app/(recruiter)/candidates/page.tsx` | Recruiter | Filter rail + scored candidate cards |
| `/candidates/[candidateId]` | `app/(recruiter)/candidates/[candidateId]/page.tsx` | Recruiter | Resume preview + AI breakdown + tabs |
| `/pipeline` | `app/(recruiter)/pipeline/page.tsx` | Recruiter | Drag-drop Kanban (7 stages) |
| `/interviews` | `app/(recruiter)/interviews/page.tsx` | Recruiter | Reuses `InterviewerHome` for now |
| `/analytics` | `app/(recruiter)/analytics/page.tsx` | Recruiter | Funnel, time-to-hire, sources, round perf |
| `/settings` | `app/(recruiter)/settings/page.tsx` | Recruiter | Interview rounds configurator + templates |
| `/interviewer` | `app/(interviewer)/interviewer/page.tsx` | Interviewer | Today's interviews + pending feedback |
| `/interviews/[interviewId]` | `app/(interviewer)/interviews/[interviewId]/page.tsx` | Interviewer | Conduct page + feedback modal |

**Navigation is done via `useRouter().push()` from `next/navigation`** and `<Link>` from `next/link`. The original prototype used hash routing with a `setRoute()` callback prop — that's been fully refactored away.

Page params (`[jobId]`, `[candidateId]`, `[interviewId]`) are declared in the page signatures but the inner components currently ignore them and use the first mock record. **Wire `useParams()` in each component when you connect the backend.**

---

## 5. Design system

### 5.1 Tokens (live in `app/globals.css`)

All design tokens are CSS custom properties on `:root`. Themes swap via `[data-theme="light"]` on `<html>`. Density swaps via `[data-density="compact"]`.

```css
--primary: #6366F1
--primary-2: #3B82F6
--ai-grad: linear-gradient(135deg, #A855F7 0%, #6366F1 50%, #3B82F6 100%);
--bg / --bg-2 / --surface / --surface-2 / --surface-3
--text / --text-2 / --muted / --faint
--success / --warning / --danger / --info
--stage-new / --stage-shortlisted / --stage-scheduled /
--stage-inprogress / --stage-feedback / --stage-hired / --stage-rejected
```

Typography: **Geist** (UI) and **Geist Mono** (numbers/scores), loaded via Google Fonts in `globals.css`.

### 5.2 Component classes

All components use the `ts*` class prefix (e.g. `tsBtn`, `tsCard`, `tsCandCard`). Styles are co-located in `globals.css` under labeled sections (search for `/* ===== screens/X.css ===== */`).

### 5.3 AI surfaces

Components that should "feel AI" use these utility classes:
- `.ai-text` — animated gradient on text
- `.ai-border` — animated gradient ring around a card
- `.ai-surface` — soft gradient background with conic glow

The `AIPill` and `Sparkles` icon mark anything AI-generated.

### 5.4 Tweaks panel

Floating button bottom-right opens a panel for **theme (dark/light)** and **density (comfortable/compact)**. Preferences persist to `localStorage` under key `synthire-tweaks`. Implemented in `components/shared/TweaksPanel.tsx`.

---

## 6. Data model

Domain types are in `lib/types.ts`. The main shapes:

```ts
type Stage = "new" | "shortlisted" | "scheduled" | "inprogress"
           | "feedback" | "hired" | "rejected";

interface Candidate {
  id; jobId; name; title; currentCompany; location; email;
  score;                                  // 0-100 overall
  skillsScore; expScore; eduScore; achScore;  // 0-100 each dimension
  skills: string[]; years; stage: Stage;
  education: { school; degree; year }[];
  experience: { company; role; from; to; desc; stack }[];
  strengths: string[]; concerns: string[];
  avatar: string; initials: string;       // UI render hints
}

interface Job {
  id; title; department; location; status;
  posted; applicants; shortlisted; interviewing; hired;
  type; level; salary;
}

interface InterviewRound {
  id; num; name; duration; interviewer; purpose; required;
}

interface Feedback {
  candidateId; interviewerId; round;
  scores: { tech; comm; problem; culture };  // 1-5 each
  strengths; gaps; impact;
  recommendation: "strongYes" | "yes" | "maybe" | "no" | "strongNo";
}
```

Mock data lives in `lib/data.ts` as named exports: `JOBS`, `CANDIDATES`, `INTERVIEW_ROUNDS`, `TEAM`, `ACTIVITY`, `FUNNEL`, `TIME_TRENDS`, `SOURCES`, `ROUND_PERF`, `TODAY_INTERVIEWS`, `NAMES`, `SKILLS`.

---

## 7. Backend wiring map

**Every place that imports from `@/lib/data` is a wiring point.** Replace each named import with an API call (React Query, RSC `fetch`, or your preferred pattern). The key handlers to wire:

| Component | File | Action | Suggested endpoint |
|---|---|---|---|
| Login | `(auth)/LoginForm.tsx::submit` | `router.push("/dashboard")` after delay | `POST /auth/login` |
| Signup | `(auth)/SignupForm.tsx::submit` | Same | `POST /auth/signup` |
| Create job | `(recruiter)/JobForm.tsx` | "Continue" button — currently routes to `/jobs` | `POST /jobs` |
| Upload JD | `(recruiter)/JDUploadModal.tsx::handleFiles` | Simulated parse via `setTimeout` | `POST /jobs/parse-jd` (multipart) |
| Upload resumes (batch) | `(recruiter)/ResumeBatchModal.tsx::handleFiles` | Simulated parse + score per file | `POST /candidates/bulk` (multipart) + score against `jobId` |
| Candidate filters | `(recruiter)/Candidates.tsx::filtered` | Client-side filter on `CANDIDATES` | `GET /candidates?jobId=&minScore=&skills=…` |
| Drag candidate to stage | `(recruiter)/PipelineKanban.tsx::onDrop` | Mutates local state | `PATCH /candidates/:id { stage }` |
| Schedule interview | `(recruiter)/ScheduleModal.tsx` | Collects state; toast on submit | `POST /interviews` |
| Submit feedback | `(interviewer)/InterviewConduct.tsx::FeedbackForm` | Toast on submit | `POST /interviews/:id/feedback` |
| Add interview round | `(recruiter)/Settings.tsx::save` | Mutates local list | `POST /settings/interview-rounds` |
| Analytics charts | `(recruiter)/Analytics.tsx` | Reads `FUNNEL`, `TIME_TRENDS`, etc. | `GET /analytics/*` |

### Suggested patterns

- **Use Server Components** for read-only data (analytics, jobs list, candidate list initial load). Mark only interactive pieces `'use client'`.
- **Use React Query** for mutations (drag-drop, schedule, feedback) — gives optimistic updates for free.
- **Streaming** is a great fit for the upload modals' "live extraction" UI — they're already designed around progressive disclosure. Use Vercel AI SDK or server-sent events.

### Auth recommendation

The auth screens currently just `router.push("/dashboard")` on submit. Recommended setup:
1. Add NextAuth, Clerk, or Supabase Auth.
2. Wrap `(recruiter)` and `(interviewer)` route groups with a middleware check (`middleware.ts`).
3. Replace `Sarah Chen` placeholder in `Sidebar.tsx`/`Navigation.tsx` with `session.user`.

---

## 8. Conventions

### Imports

- Use the `@/` alias for project root: `import { Button } from "@/components/ui"`.
- UI primitives are barrel-exported: prefer `from "@/components/ui"` over `from "@/components/ui/button"`.
- Cross-component imports stay within the same persona folder when possible — `(recruiter)` files reference each other freely, but try not to import from `(interviewer)`.

### `'use client'`

- All files in `components/` are `'use client'` because they all have local state or callbacks.
- Files in `app/` are server components by default; `(recruiter)/layout.tsx` and `(interviewer)/layout.tsx` are client because they hold sidebar collapse state and the command palette.

### Type safety

- `tsconfig.json` has `strict: false` and `noImplicitAny: false`. This is **intentional for the prototype phase** — many props are typed `any` to keep migrations fast. Tighten file-by-file as you wire backends.
- Inner helper components in screen files often have `({ ... }: any)` props. Replace with real interfaces as you go.

### Styling

- **Prefer the `ts*` class names** that already exist in `globals.css` — they're consistent and tokenized.
- If you need a one-off style, inline `style={{ ... }}` is fine for a single use; otherwise add a new class to `globals.css`.
- Tailwind is configured but mostly unused — add utility classes as needed; the design tokens are exposed under `theme.extend.colors`.

### Naming

- **Files**: PascalCase for React components (`CandidateCard.tsx`), kebab-case for UI primitives (`score-bar.tsx`) per shadcn convention.
- **CSS classes**: `tsXxx-yyy` (BEM-ish with `ts` namespace).
- **Routes**: lowercase, kebab-case if multi-word.

---

## 9. Workflows (end-to-end)

### 9.1 Recruiter creates a job and screens candidates

1. `/dashboard` → click **Create job** → `/jobs/new`
2. **Wizard step 3**: Adjust 4 scoring sliders (Skills / Experience / Education / Achievements) so they sum to 100%. Optional: click **Upload JD instead** to pre-fill from a PDF (`JDUploadModal`).
3. Wizard "Continue" → `/jobs` (in mock; in real app would `POST /jobs` and navigate to the new job).
4. From `/jobs` → click a job → `/jobs/[jobId]` (renders `Candidates` component, scoped to that job).
5. Click **Upload resumes** → `ResumeBatchModal` opens. Drop PDFs (or click "Try with sample batch"). Each file moves through queued → parsing → scoring → done, sorted by score.
6. Click **Add N to pipeline** → toast confirms; candidates appear under the job.
7. On any candidate card: **Shortlist** / **Reject** / **Open**. Open → `/candidates/[candidateId]`.

### 9.2 Candidate detail review

1. Left pane: resume preview (zoomable).
2. Right pane has 4 tabs:
   - **Overview** — score ring, skills heatmap, experience timeline, education, red/green flags
   - **Resume breakdown** — every parsed section, color-coded match status
   - **AI analysis** — AI-generated summary + 4 tailored interview questions
   - **Activity** — timeline of changes
3. Top-right: **Schedule interview** → opens `ScheduleModal` (side panel, 4 steps: round → interviewers → date/time → meeting details + email preview).

### 9.3 Pipeline drag-and-drop

1. `/pipeline` shows 7 columns: New / Shortlisted / Scheduled / Technical / Culture Fit / Hired / Rejected.
2. Drag a card between columns — local state updates immediately. **Wire `PATCH /candidates/:id { stage }` here.**
3. Click any card → `/candidates/[candidateId]`.

### 9.4 Interviewer flow

1. Interviewer lands on `/interviewer`. Sees today's interviews + pending feedback.
2. Click **Prep & conduct** → `/interviews/[interviewId]`.
3. Split layout: left has Resume / JD / **AI questions** / Previous feedback tabs. Right has notes (auto-save) + live scoring (4 sliders, 1-5 stars).
4. Click **Complete feedback** → opens `FeedbackForm` modal.
5. Fill star ratings, strengths/gaps/impact text, optional **Generate AI summary**, pick recommendation (Strong Yes / Yes / Maybe / No / Strong No).
6. Submit → toast → returns to interviewer portal. **Wire `POST /interviews/:id/feedback` here.**

---

## 10. Things to know before changing things

- **`globals.css` is large (~80 KB)** and contains every screen's styles. It's structured into sections (`/* ===== screens/X.css ===== */`). When refactoring, you can split per-screen later, but be careful — many class names are shared across screens.
- **Re-export files are stubs**: `CandidateCard.tsx`, `FilterPanel.tsx`, `JobCard.tsx`, `FeedbackForm.tsx`, `ScoreDisplay.tsx` are currently `export { X } from "./Y"` re-exports. The actual function bodies live inside the screen files. If you want true file-per-component, lift the function out — 5 minutes per component.
- **`AIInsightsCard`, `StatCard`, `FunnelChart`, `LineChart`, `ActivityRow`** are defined inside `Dashboard.tsx` and exported by name. `Analytics.tsx` imports `FunnelChart` and `LineChart` from `./Dashboard`. `CandidateDetail.tsx` imports `ActivityRow` from `./Dashboard`. If you split Dashboard later, update these imports.
- **The `ScheduleModal` import path**: `CandidateDetail.tsx` and `Candidates.tsx` both open it; it's a sibling file under `(recruiter)/`. Don't move it without updating callers.
- **`useParams()` is not yet used** in any page — the `[jobId]`, `[candidateId]`, `[interviewId]` params are declared but ignored. Add `const { jobId } = useParams()` when wiring backends.
- **`Sidebar.tsx`** is the routing source of truth for the nav menu — `NAV_ITEMS` is exported and reused by `CommandPalette`. Add new routes there.
- **Mock counts in `NAV_ITEMS`** (e.g. "Jobs (12)", "Candidates (247)") are hardcoded. Replace with a small server query when wiring.

---

## 11. Running locally

```bash
cd frontend
cp .env.example .env.local       # edit if you have a backend already
npm install
npm run dev
```

Open <http://localhost:3000>.

Scripts:
- `npm run dev` — Next.js dev server
- `npm run build` — production build (warning: type errors won't block; `strict: false`)
- `npm run start` — production server
- `npm run lint` — Next/ESLint
- `npm run typecheck` — `tsc --noEmit`

---

## 12. Open questions / known gaps

These are intentional gaps for the backend integration phase:

- [ ] **No auth** — login form submits and navigates; no session, no middleware guards
- [ ] **No API client** — every component reads from `lib/data.ts`
- [ ] **No real PDF parsing** — `JDUploadModal` and `ResumeBatchModal` use `setTimeout` to fake the parse stream
- [ ] **No real AI** — "AI insights", "AI summary", "AI questions" are hardcoded strings tailored to the mock candidate
- [ ] **No file upload bucket** — `Dropzone` accepts files but does nothing with them
- [ ] **No persistence** — drag-drop on Kanban, candidate stage changes, feedback submissions all live in client state and disappear on refresh
- [ ] **No real-time** — no websockets/SSE for "Live extraction" UI; it's all timer-based
- [ ] **No tests** — no Jest/Vitest/Playwright config yet
- [ ] **No CI** — no GitHub Actions, no preview deployments configured
- [ ] **Lucide swap pending** — `lucide-react` is installed but `lib/icons.tsx` ships an inline set; either is fine, pick one and stick

---

## 13. Useful starting tasks for a contributor

If you're a new contributor (or Claude Code starting from this repo), good first tasks:

1. **Wire one endpoint end-to-end** — pick `GET /jobs` and replace `JOBS` import in `(recruiter)/Jobs.tsx` with a real fetch. Use React Query. Get the loading/error states right.
2. **Add `useParams()` to the dynamic pages** — `[jobId]`, `[candidateId]`, `[interviewId]`. Read the id and pass it into the component.
3. **Hook up auth** — drop in NextAuth or Clerk; add `middleware.ts` to gate `(recruiter)` and `(interviewer)` routes.
4. **Tighten one screen's types** — pick `Candidates.tsx`, remove the `: any` annotations, derive types from `lib/types.ts`. Repeat per screen.
5. **Split a re-export file** — move `CandidateCard` from inside `Candidates.tsx` into its own file. Tests the boundaries.
6. **Replace one mock with streaming** — `ResumeBatchModal::handleFiles` is the best demo target — its UI is already designed for streaming progress.

---

## 14. Contact map / ownership

| Area | File entry points |
|---|---|
| Design system | `app/globals.css`, `components/ui/*` |
| Routing | `app/**/page.tsx`, `components/shared/Sidebar.tsx::NAV_ITEMS` |
| Mock data | `lib/data.ts`, `lib/types.ts` |
| Recruiter workflow | `components/(recruiter)/*` |
| Interviewer workflow | `components/(interviewer)/*` |
| Auth | `components/(auth)/*`, `app/(auth)/**/page.tsx` |
| Theming | `components/shared/TweaksPanel.tsx`, CSS custom properties in `globals.css` |

---

_Last updated: refactor from single-file HTML prototype to Next.js App Router complete. Ready for backend wiring._
