# TalentScout AI — Frontend

Next.js 14 (App Router) + TypeScript frontend for the TalentScout AI applicant tracking system. Built as a complete UI scaffold ready for backend wiring.

## Stack

- **Next.js 14** — App Router, RSC where appropriate, `'use client'` on interactive surfaces
- **TypeScript** — `strict: false` initially so the prototype compiles; tighten as you wire types
- **Tailwind CSS** — configured with the design tokens; co-exists with the custom CSS in `app/globals.css`
- **Lucide React** — listed as a dependency. The prototype currently ships an inline icon set in `lib/icons.tsx` so it works offline; swap to `lucide-react` per-icon as you go.
- **No state library** — pages use `useState` / props for now. Add Zustand, Redux Toolkit, or React Query when you wire APIs.

## Folder structure

```
app/
├── layout.tsx                              # Root layout: <html>, fonts, providers, globals.css
├── globals.css                             # Design tokens + all UI styles
├── page.tsx                                # Marketing landing
├── providers.tsx                           # Toast + Tweaks providers
│
├── (auth)/                                 # Route group — no shared layout chrome
│   ├── login/page.tsx
│   └── signup/page.tsx
│
├── (recruiter)/                            # Route group with sidebar + top nav
│   ├── layout.tsx                          # RecruiterLayout — Sidebar + Topbar + CommandPalette
│   ├── dashboard/page.tsx
│   ├── jobs/
│   │   ├── page.tsx
│   │   ├── new/page.tsx                    # Job wizard
│   │   └── [jobId]/page.tsx                # Job detail = candidate list
│   ├── candidates/
│   │   ├── page.tsx
│   │   └── [candidateId]/page.tsx
│   ├── pipeline/page.tsx                   # Kanban
│   ├── interviews/page.tsx                 # Recruiter interview list
│   ├── analytics/page.tsx
│   └── settings/page.tsx
│
└── (interviewer)/                          # Route group for interviewer surfaces
    ├── interviewer/page.tsx                # Interviewer portal (today's interviews)
    └── interviews/[interviewId]/page.tsx   # Conduct interview + feedback

components/
├── ui/                                     # Design-system primitives (Button, Card, Modal, …)
├── shared/                                 # Sidebar, Navigation, CommandPalette, Logo, TweaksPanel
├── (auth)/                                 # AuthLayout
├── (recruiter)/                            # CandidateCard, JobForm (wizard), PipelineKanban, FilterPanel, ScoreDisplay, screen sections
└── (interviewer)/                          # InterviewConduct, FeedbackForm

lib/
├── data.ts                                 # Mock data — replace with API calls
├── icons.tsx                               # Inline SVG icon set (Icon.X)
├── types.ts                                # Domain types (Candidate, Job, …)
└── utils.ts                                # cn() helper
```

## Backend wiring map

The places to wire are concentrated:

| Surface | What to replace |
|---|---|
| Mock data | `lib/data.ts` — replace each export with a fetch from your API |
| Login | `app/(auth)/login/page.tsx` — calls `setRoute("dashboard")`; replace with your auth flow |
| JD upload | `components/(recruiter)/JDUploadModal.tsx` — animated stub; wire `handleFiles` to a real upload + parse endpoint |
| Batch resume upload | `components/(recruiter)/ResumeBatchModal.tsx` — same: wire `handleFiles` to your bulk parse + score endpoint |
| Score-against-job filter | `components/(recruiter)/FilterPanel.tsx` — pure client-side filtering on the mock list; replace with API-backed query |
| Interview scheduling | `components/(recruiter)/ScheduleModal.tsx` — collects state but doesn't post |
| Feedback submission | `components/(interviewer)/FeedbackForm.tsx` — toast on submit; wire to your API |

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- The CSS is in one large `app/globals.css` rather than CSS modules — that keeps the design-token system contained. You can split it later.
- All interactive components carry `'use client'`. Pages that just compose are server components.
- `tsconfig.json` is intentionally loose (`strict: false`, `noImplicitAny: false`) to keep the prototype compiling. Tighten as you wire real types.
