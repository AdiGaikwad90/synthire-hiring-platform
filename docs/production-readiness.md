# Synthire — Production Readiness Issues

Issues that must be resolved before the app goes live. Grouped by category and severity.

---

## 🔴 Security Vulnerabilities

### S1. Role-based access control not enforced
**Risk: High** — An interviewer who knows the URL can access any recruiter route (`/dashboard`, `/jobs`, `/candidates`, `/analytics`, etc.) without restriction.

- `frontend/middleware.ts` only checks that a token exists — it does not check `role`
- `Sidebar.tsx` shows all recruiter nav items to interviewers
- `CandidateDetail.tsx` shows Shortlist / Reject / Schedule buttons to interviewers
- `CommandPalette.tsx` exposes all recruiter routes to interviewers

**Fix:**
- Decode JWT payload in `middleware.ts`, redirect interviewers away from `/dashboard`, `/jobs`, etc. → `/interviewer`
- Filter `NAV_ITEMS` in `Sidebar.tsx` by `user.role`
- Guard action buttons in `CandidateDetail.tsx` with `user.role === 'recruiter'`

---

### S2. Fake OAuth buttons bypass authentication
**Risk: High** — "Continue with Google" and "Continue with LinkedIn" buttons on the login page navigate directly to `/dashboard` without any authentication. Any user can click these to enter the app without credentials.

- `frontend/components/(auth)/LoginForm.tsx` — both buttons call `router.push('/dashboard')`

**Fix:** Remove the buttons entirely, or wire them to a real OAuth provider. A "Coming soon" toast is acceptable only if the buttons do **not** navigate anywhere — they must be fully inert.

---

### S3. Accidental logout on user avatar click
**Risk: Medium** — The entire avatar + name area in the top nav calls `logout()` on click. Any accidental click on the user's own name immediately ends the session with no confirmation.

- `frontend/components/shared/Navigation.tsx` — `onClick={logout}` on the outer div

**Fix:** Replace with a dropdown showing Profile / Settings / Logout. Only the Logout menu item should call `logout()`.

---

### S4. No CSRF protection on state-mutating endpoints
**Risk: Medium** — The API uses Bearer tokens (safe from CSRF by default) but also accepts cookies as a fallback. If a future change re-enables cookie-only auth without a CSRF token, all POST/PATCH/DELETE endpoints become vulnerable to cross-site request forgery.

**Fix:** Keep Bearer token as the primary and only auth path in production. If cookies are ever re-enabled as primary auth, add a `Csrf-Token` double-submit cookie pattern.

---

### S5. No account lockout on signup (only login is rate-limited)
**Risk: Low–Medium** — Login is rate-limited to 5 attempts per 60s per email. Signup has no rate limiting — an attacker can create unlimited accounts for a given domain, exhausting the D1 row budget or Neurons daily limit.

- `backend/src/routes/auth.ts` — `POST /signup` has no rate limit

**Fix:** Apply the same KV-backed rate limiter to signup: max 3 signups per IP per hour.

---

## 🟠 Data Integrity / Correctness

### D1. Strengths and Concerns always empty
Candidate cards and detail pages always show empty Strengths / Concerns sections. The scoring prompt returns only a `summary` string — it never extracts these fields.

- `frontend/components/(recruiter)/CandidateDetail.tsx` — `strengths: []`, `concerns: []` hardcoded
- `backend/src/services/ai/prompts/score-candidate.ts` — no `strengths`/`concerns` in schema

**Fix:** Add `strengths: string[]` + `concerns: string[]` to the scoring prompt and store them in `ai_analysis` as JSON.

---

### D2. Resume parsing field name mismatch
Parsed education shows blank because the AI prompt returns `school` + `year` but the frontend reads `institution` + `from`/`to`. Experience shows blank stack because the prompt returns `technologies[]` but the frontend reads `stack[]`.

- `backend/src/services/ai/prompts/parse-resume.ts`
- `frontend/components/(recruiter)/CandidateDetail.tsx`

**Fix:** Align field names in the prompt schema: use `institution`, `from`, `to`, `stack`.

---

### D3. Analytics shows hardcoded fake data
Stat cards show fake trend percentages (+15%, +8%, etc.) and hardcoded subtexts ("9 accepted, 1 declined", "5.2 per role on avg") regardless of real data. The Source Effectiveness chart always shows fake percentages.

- `frontend/components/(recruiter)/Analytics.tsx`
- `frontend/components/(recruiter)/Dashboard.tsx`

**Fix:** Show `—` or hide trend badges when no prior-period data exists. Remove all hardcoded subtext strings.

---

### D4. "Pretend this is configured" placeholder text visible to users
Four of five Settings sections render debug text: `"Pretend this is configured. Switch to Interview rounds to see the deep-dive."` — this is hard-coded and ships to production.

- `frontend/components/(recruiter)/Settings.tsx`

**Fix:** Replace with proper "Coming soon" empty states.

---

## 🟡 Functional Gaps

### F1. Forgot password flow missing
The "Forgot?" link on the login page does nothing. Users who forget their password have no recovery path.

- `frontend/components/(auth)/LoginForm.tsx`

**Fix:** Implement a password reset flow via email (`magic_link` email type already exists in the backend), or show a "Coming soon" toast and **disable** the link so it is not a dead end.

---

### F2. Terms of Service and Privacy Policy links go nowhere
Login and Signup pages reference Terms and Privacy Policy with no `href`. Shipping a product with unlinked legal pages is a compliance risk.

- `frontend/components/(auth)/LoginForm.tsx`
- `frontend/components/(auth)/SignupForm.tsx`

**Fix:** Add placeholder policy pages at `/terms` and `/privacy`, or remove the links for MVP.

---

### F3. Recruiter Interviews page shows wrong component
`/interviews` renders `<InterviewerHome />` — designed for interviewers showing only their own assignments. Recruiters see "Your interviews" and see all company interviews by accident with no scheduling CTA.

- `frontend/app/(recruiter)/interviews/page.tsx`

**Fix:** Create a recruiter-scoped `InterviewsList` component with a table layout, filter tabs (All / Today / Upcoming / Completed), and a "Schedule interview" button.

---

### F4. Pipeline "Add candidate" buttons do nothing
All seven "Add candidate" buttons at the bottom of Kanban columns have no `onClick` handler.

- `frontend/components/(recruiter)/PipelineKanban.tsx`

**Fix:** Link to `/candidates?job_id=...` filtered for that job, or remove the buttons.

---

## 🔵 Infrastructure / Operational

### I1. Sentry DSN not configured in production
`SENTRY_DSN` is optional — if unset, errors in production are invisible. No alerting, no stack traces, no error grouping.

**Fix:** Create a Sentry project, run `wrangler secret put SENTRY_DSN`, and verify errors appear in the Sentry dashboard after deploy.

---

### I2. Neurons daily limit may be too low for production load
`NEURONS_DAILY_LIMIT = "10000"` is a hard stop. A recruiter uploading 50 resumes in one session can consume a significant fraction of the daily budget, blocking all AI calls for the rest of the day.

**Fix:** Monitor actual Neurons consumption for the first week of production use and increase the limit in `wrangler.toml` accordingly. Add a KV key that exposes current usage via `GET /health` so it can be monitored.

---

### I3. Staging D1 / KV IDs not provisioned
`wrangler.toml` still has `REPLACE_WITH_STAGING_DATABASE_ID` and `REPLACE_WITH_STAGING_KV_ID` placeholders. Any deploy to staging will fail.

**Fix:**
```bash
wrangler d1 create synthire-staging
wrangler kv:namespace create KV_CACHE_STAGING
```
Then fill in the IDs in `wrangler.toml`.

---

### I4. No health check monitoring
`GET /health` exists but nothing calls it. A silent Worker crash or D1 outage would go undetected until a user reports it.

**Fix:** Set up an uptime monitor (Cloudflare Healthchecks, Better Uptime, or UptimeRobot) pointing to `https://synthire-backend-production.adigaikwad4321.workers.dev/health`.

---

## Priority Order

| # | Issue | Severity |
|---|-------|----------|
| 1 | S2 — Fake OAuth bypasses auth | 🔴 Critical |
| 2 | S1 — No role-based access control | 🔴 Critical |
| 3 | S3 — Avatar click logs out instantly | 🔴 Critical |
| 4 | D4 — "Pretend this is configured" text | 🔴 Critical |
| 5 | D2 — Resume field name mismatch | 🔴 Critical |
| 6 | D1 — Strengths/Concerns always empty | 🔴 Critical |
| 7 | D3 — Fake analytics data | 🔴 Critical |
| 8 | F3 — Wrong component on Interviews page | 🟠 High |
| 9 | F1 — No forgot password flow | 🟠 High |
| 10 | S5 — No signup rate limit | 🟠 High |
| 11 | F2 — Terms/Privacy links dead | 🟡 Medium |
| 12 | F4 — Pipeline Add candidate buttons dead | 🟡 Medium |
| 13 | S4 — CSRF advisory | 🟡 Medium |
| 14 | I1 — Sentry not configured | 🔵 Ops |
| 15 | I4 — No uptime monitoring | 🔵 Ops |
| 16 | I2 — Neurons limit may be too low | 🔵 Ops |
| 17 | I3 — Staging not provisioned | 🔵 Ops |
