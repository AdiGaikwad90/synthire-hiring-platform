# Synthire — Frontend

Next.js 15 (App Router) + TypeScript frontend for the Synthire AI-powered ATS. Deployed to Cloudflare Pages via `@cloudflare/next-on-pages`.

## Stack

- **Next.js 15** — App Router, `'use client'` on interactive surfaces, `export const runtime = "edge"` on all routes
- **TypeScript** — `strict: false`
- **Tailwind CSS** — design tokens in `app/globals.css`
- **React Query v5** — all server state; hooks in `hooks/queries/`
- **Cloudflare Pages** — hosting via `@cloudflare/next-on-pages`

## Local development

```bash
# 1. Create .env.local (one-time)
echo "NEXT_PUBLIC_API_URL=http://localhost:8787" > .env.local

# 2. Install and run
npm install
npm run dev    # http://localhost:3000
```

Backend must be running at `http://localhost:8787`. See root `README.md` for backend setup.

`.env.local` is read automatically by `next dev` — no changes needed between sessions.

## Build for Cloudflare Pages (production)

`NEXT_PUBLIC_API_URL` is a build-time variable — Next.js bakes it into the bundle during `next build`. The deploy script reads it from `.env.production` automatically.

```bash
# One-time: set your production backend URL
echo "NEXT_PUBLIC_API_URL=https://your-worker.workers.dev" > .env.production

# Deploy (reads .env.production automatically)
npm run deploy
```

**How env vars work across environments:**

| Command | Reads from | URL used |
|---|---|---|
| `npm run dev` | `.env.local` | `http://localhost:8787` |
| `npm run deploy` | `.env.production` | your deployed worker |

You never need to manually set or swap URLs.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000, reads `.env.local` |
| `npm run build` | Standard Next.js build (for local testing) |
| `npm run build:cf` | Cloudflare Pages build via `@cloudflare/next-on-pages` |
| `npm run deploy` | `build:cf` + `wrangler pages deploy` (set `NEXT_PUBLIC_API_URL` first) |
| `npm run typecheck` | `tsc --noEmit` — target 0 errors |
| `npm run lint` | ESLint |

## Folder structure

```
app/
├── layout.tsx                  # Root layout — fonts, providers, globals.css
├── globals.css                 # ALL design tokens + component styles
├── providers.tsx               # QueryClientProvider → AuthProvider → ToastProvider
├── page.tsx                    # / → Landing
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (recruiter)/                # Route group with Sidebar + Topbar layout
│   ├── layout.tsx
│   ├── dashboard/page.tsx
│   ├── jobs/page.tsx
│   ├── jobs/new/page.tsx
│   ├── jobs/[jobId]/page.tsx
│   ├── candidates/page.tsx
│   ├── candidates/[candidateId]/page.tsx
│   ├── pipeline/page.tsx
│   ├── interviews/page.tsx
│   ├── analytics/page.tsx
│   └── settings/page.tsx
└── (interviewer)/
    ├── interviewer/page.tsx
    └── interviews/[interviewId]/page.tsx

components/
├── ui/                         # Design-system primitives (Button, Card, Modal, …)
├── shared/                     # Sidebar, Navigation, CommandPalette, TweaksPanel
├── (auth)/                     # LoginForm, SignupForm
├── (recruiter)/                # All recruiter screen components
└── (interviewer)/              # InterviewConduct, FeedbackForm

hooks/queries/
├── useJobs.ts
├── useCandidates.ts
├── useInterviews.ts
├── useAnalytics.ts
├── useSettings.ts
└── useEmail.ts

lib/
├── api.ts          # Typed API client — all endpoint groups
├── auth.ts         # Token helpers (localStorage + cookie sync)
├── types.ts        # Domain types
├── utils.ts        # cn(), initials(), formatDate()
└── icons.tsx       # Inline SVG icon set
```

## Typecheck

```bash
npm run typecheck    # tsc --noEmit — target 0 errors
```
