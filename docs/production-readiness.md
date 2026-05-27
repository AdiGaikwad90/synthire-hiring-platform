# Synthire — SaaS Production Readiness

Full audit conducted across backend (Cloudflare Workers / Hono / D1) and frontend (Next.js 14). Implementation plans are in `docs/superpowers/plans/`.

---

## Plan A — Security & Auth  
`docs/superpowers/plans/2026-05-27-plan-a-security-auth.md`

| # | Issue | File | Severity |
|---|-------|------|----------|
| A1 | No RBAC — any user can hit any route | `middleware/role.ts` (new), all routes | 🔴 Critical |
| A2 | Interviewer can access recruiter pages in frontend | `frontend/middleware.ts`, layouts | 🔴 Critical |
| A3 | Sidebar / CommandPalette shows all routes regardless of role | `Sidebar.tsx`, `CommandPalette.tsx` | 🔴 Critical |
| A4 | Shortlist / Reject / Schedule buttons visible to interviewers | `CandidateDetail.tsx` | 🔴 Critical |
| A5 | LLM prompts vulnerable to prompt injection via resume text | `parse-resume.ts`, `score-candidate.ts` | 🔴 High |
| A6 | Refresh token reuse not detected — token can be replayed | `routes/auth.ts` | 🔴 High |
| A7 | Resume file served without `Content-Disposition: attachment` | `routes/candidates.ts` | 🔴 High |
| A8 | No per-company upload rate limiting | `routes/candidates.ts` | 🟠 High |
| A9 | No signup rate limiting (only login is rate-limited) | `routes/auth.ts` | 🟠 High |
| A10 | Resend webhook has no timestamp/replay check | `routes/email.ts` | 🟠 High |
| A11 | Token expiry not tracked — localStorage token lives forever | `lib/auth.ts`, `AuthContext.tsx` | 🟠 High |
| A12 | `expiresIn` not returned by login/signup | `routes/auth.ts` | 🟡 Medium |

---

## Plan B — Core UX + Missing Features  
`docs/superpowers/plans/2026-05-27-plan-b-core-ux-features.md`

| # | Issue | File | Severity |
|---|-------|------|----------|
| B1 | No forgot-password / reset-password flow | New backend routes + frontend pages | 🔴 Critical |
| B2 | No team invite flow — can't add recruiters or interviewers | `routes/team.ts` (new), `Settings.tsx` | 🔴 Critical |
| B3 | Avatar click immediately logs user out (no dropdown) | `Navigation.tsx` | 🔴 Critical |
| B4 | Settings — 4 of 5 tabs show "Pretend this is configured" | `Settings.tsx` | 🔴 Critical |
| B5 | Recruiter `/interviews` shows interviewer component | `interviews/page.tsx`, new `InterviewsList.tsx` | 🔴 High |
| B6 | Dashboard hardcodes "Welcome back, Sarah" | `Dashboard.tsx` | 🔴 High |
| B7 | Dashboard stat cards show fake trend percentages | `Dashboard.tsx` | 🔴 High |
| B8 | No profile settings (can't change name/email/password) | `routes/settings.ts`, `Settings.tsx` | 🟠 High |
| B9 | OAuth buttons navigate to /dashboard (no real auth) | `LoginForm.tsx` | 🟠 High |
| B10 | "Forgot?" link is dead | `LoginForm.tsx` | 🟠 High |
| B11 | Terms / Privacy links go nowhere | `LoginForm.tsx`, `SignupForm.tsx` | 🟡 Medium |
| B12 | Search bar has `onChange={() => {}}` — no-op | `Navigation.tsx` | 🟡 Medium |
| B13 | Breadcrumb shows raw job ID | `Navigation.tsx` | 🟡 Medium |
| B14 | Pipeline "Add candidate" buttons do nothing | `PipelineKanban.tsx` | 🟡 Medium |
| B15 | Settings hardcodes fake template names ("used by 8 jobs") | `Settings.tsx` | 🟡 Medium |

---

## Plan C — Data Integrity & Reliability  
`docs/superpowers/plans/2026-05-27-plan-c-data-integrity-reliability.md`

| # | Issue | File | Severity |
|---|-------|------|----------|
| C1 | Parse prompt uses wrong field names (school/year/technologies) | `parse-resume.ts`, `CandidateDetail.tsx` | 🔴 Critical |
| C2 | Parse prompt returns sentences instead of keywords for skills | `parse-resume.ts` | 🔴 Critical |
| C3 | Strengths/Concerns always empty (never extracted from LLM) | `score-candidate.ts`, `pipeline.ts`, `CandidateDetail.tsx` | 🔴 Critical |
| C4 | `ai_analysis` JSON parse can throw and crash CandidateDetail | `db/queries/candidates.ts`, `CandidateDetail.tsx` | 🔴 Critical |
| C5 | Analytics source chart is fully hardcoded (fake %) | `Analytics.tsx` | 🔴 Critical |
| C6 | Analytics time-to-hire spinner never resolves | `Analytics.tsx` | 🟠 High |
| C7 | R2 file not deleted when pipeline fails (orphaned files) | `routes/candidates.ts` | 🟠 High |
| C8 | No error state shown when `processing_status = 'error'` | `CandidateDetail.tsx` | 🟠 High |
| C9 | Shortlist/Reject buttons have no loading state or toast | `Candidates.tsx`, `CandidateDetail.tsx` | 🟠 High |
| C10 | API refresh logs out on network errors (should retry) | `lib/api.ts` | 🟠 High |
| C11 | Interview feedback scores have no range validation | `routes/interviews.ts`, migration 0010 | 🟡 Medium |
| C12 | Upload polling has no timeout — can hang forever | `ResumeBatchModal.tsx` | 🟡 Medium |
| C13 | No circuit breaker — LLM failures cascade forever | `services/ai/fallback.ts` | 🟡 Medium |
| C14 | Analytics trend badges show even when no prior-period data | `Analytics.tsx`, `Dashboard.tsx` | 🟡 Medium |

---

## Plan D — Performance, Scalability & Observability  
`docs/superpowers/plans/2026-05-27-plan-d-performance-scalability.md`

| # | Issue | File | Severity |
|---|-------|------|----------|
| D1 | No composite DB indexes — full scans on every page load | Migration 0011 | 🟠 High |
| D2 | N+1 query — job title fetched per-candidate on list view | `db/queries/candidates.ts` | 🟠 High |
| D3 | Neurons budget is global — one company can exhaust all others | `middleware/neurons.ts` (new) | 🟠 High |
| D4 | No audit log — can't trace who changed what | Migration 0012, `db/queries/audit.ts` (new) | 🟠 High |
| D5 | `/health` doesn't expose Neurons usage or D1 latency | `routes/health.ts` | 🟡 Medium |
| D6 | No Sentry — production errors are invisible | `index.ts`, `@sentry/cloudflare` | 🟡 Medium |
| D7 | Activity feed not wired to real audit data | `useAnalytics.ts`, `Dashboard.tsx` | 🟡 Medium |

---

## Execution order

Run plans in parallel where possible:

```
Week 1-2:  Plan A (security) + Plan B tasks B1-B5 (critical UX)
Week 2-3:  Plan B remainder + Plan C tasks C1-C5 (critical data)
Week 3-4:  Plan C remainder + Plan D
```

Plans A and C can be executed entirely in parallel. Plan B depends on B1 (forgot password) before B8 (change password shares the same reset-token infrastructure).
