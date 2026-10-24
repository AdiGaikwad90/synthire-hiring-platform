# Synthire backlog

Every known bug, fake-content problem, gap and chore, with a priority and a
status. Found issues land here first; fixed issues stay here marked **Done** so
the history is readable.

**Tracker page (high-level view):** https://claude.ai/artifact/26CtQULZgXxSJ5FKB3MZEg
(private to the owner; share it from the page's Share menu)

## How this backlog works

- **This file is the source of truth.** The tracker page mirrors each issue's
  ID, title, priority, area, status and one-line problem so progress can be
  followed at a glance. It reads from the artifact's database; nothing on the
  page is hand-edited.
- **Priorities**
  - **P0** — production is broken or data is lost.
  - **P1** — a core flow does the wrong thing or shows wrong data.
  - **P2** — fake or misleading content, or a gap that blocks real use.
  - **P3** — buttons that do nothing, cosmetic issues, small gaps, chores.
- **Statuses:** `Open` · `In progress` · `Done` · `Won't fix`.
- **Adding an issue:** take the next free ID, add a row to the table and a
  section under its priority, and add the same issue to the tracker.
- **Fixing an issue:** follow `TESTING.md` (regression test that fails without
  the fix, then the Playwright pass with real LLM calls). Then set the status to
  `Done`, add the PR link and date to the section, and update the tracker in the
  same session (its `issues/<ID>` document, plus one line in `changes`).
- **Tracker data shape** (Claude writes it with the `ArtifactData` tool on the
  URL above): collection `issues`, one document per ID with `id, num, title,
  priority, area, type, status (open | in_progress | done | wont_fix), found,
  updated, problem, where, done_when, pr`; collection `changes`, documents
  `c-NNNN` with `at` (ISO time), `text`, `ids`. Only the owner and editors can
  write; anyone the page is shared with can read.
- Evidence was gathered in the end-to-end Playwright pass of 2026-10-24
  (local, `test@synthire.io`, real Workers AI). File references are to the code
  as of that date; re-check them before fixing.

## Summary

| ID | Pri | Status | Area | Title |
|---|---|---|---|---|
| SYN-001 | P0 | In progress | Deploy | Ship the queue-backed resume pipeline to production |
| SYN-002 | P1 | Open | Scheduling | Interview timezone picker is ignored |
| SYN-003 | P1 | Open | Interviewers | Interviewers cannot join a company |
| SYN-004 | P1 | Open | Email | Email delivery fails: SendGrid "Maximum credits exceeded" |
| SYN-005 | P1 | Open | Upload | Candidate lists stay stale after a resume upload |
| SYN-006 | P1 | Open | Candidates | Stage filter uses statuses that don't exist |
| SYN-007 | P1 | Open | Auth | Sessions end early: 15 min in dev, 24 h in production |
| SYN-008 | P1 | Open | Candidates | Failed uploads show as "Processing... · 0%" and hide the reason |
| SYN-009 | P1 | Open | Scheduling | Edits to the invitation email are thrown away |
| SYN-010 | P2 | Open | Dashboard | Dashboard header and stat cards are hardcoded |
| SYN-011 | P2 | Open | Dashboard | Dashboard AI Insights card is fake |
| SYN-012 | P2 | Open | Dashboard | Dashboard funnel, time-to-hire and today's interviews carry fake labels |
| SYN-013 | P2 | Open | Dashboard | Activity feed shows raw timestamps and the wrong verb |
| SYN-014 | P2 | Open | Navigation | Sidebar "AI Credits" meter is hardcoded |
| SYN-015 | P2 | Open | Candidates | Candidate cards show made-up details |
| SYN-016 | P2 | Open | AI | Interview questions ignore the job's requirements and the candidate's gaps |
| SYN-017 | P2 | Open | Candidates | No way to delete a candidate or a job from the UI |
| SYN-018 | P2 | Open | Settings | "Saved templates" in Settings are fake |
| SYN-019 | P2 | Open | Navigation | Notification bell has a permanent unread dot and does nothing |
| SYN-020 | P2 | Open | Upload | Upload screens promise features that don't exist |
| SYN-021 | P2 | Open | Analytics | Analytics period tabs don't filter anything |
| SYN-022 | P2 | Open | Search | Search only finds 5 candidates and 3 jobs |
| SYN-023 | P2 | Open | Interviews | Feedback "avg score" counts unrated categories as zero |
| SYN-024 | P3 | Open | UX | Buttons that do nothing |
| SYN-025 | P3 | Open | UX | Raw enum values shown to users |
| SYN-026 | P3 | Open | UX | Some dates bypass the shared date formatters |
| SYN-027 | P3 | Open | Scheduling | Scheduler allows dates in the past |
| SYN-028 | P3 | Open | Scheduling | Empty "Which round?" gives no hint |
| SYN-029 | P3 | Open | UX | Dangling separators and singular/plural mistakes |
| SYN-030 | P3 | Open | Interviews | "Open Zoom" label for every meeting link |
| SYN-031 | P3 | Open | UX | Console errors on several pages |
| SYN-032 | P3 | Open | Upload | "Add N to pipeline" only shows a toast |
| SYN-033 | P3 | Open | Jobs | The attached JD can't be opened from the job page |
| SYN-034 | P3 | Open | Pipeline | Scheduling or completing an interview doesn't move the candidate's stage |
| SYN-035 | P3 | Open | Pipeline | Kanban cards and interview rows don't say which job |
| SYN-036 | P3 | Open | AI | Resume parsing drops details |
| SYN-037 | P3 | Open | Settings | Five of six Settings tabs are "coming soon" |
| SYN-038 | P3 | Open | Email | Email footers say "© 2025" |
| SYN-039 | P3 | Open | Chore | Remove 11 stale agent worktrees |
| SYN-040 | P3 | Open | Auth | Login page illustration uses a made-up candidate |
| SYN-041 | P3 | Open | Analytics | Analytics Sources and Round performance are not wired |

---

## P0

### SYN-001 · Ship the queue-backed resume pipeline to production
**P0** · Deploy · Chore · Status: **In progress** · Found 2026-10-24

- **Problem:** Production still runs the old pipeline, which parses and scores in `ctx.waitUntil()`. Cloudflare cancels that work 30 s after the response and a resume takes 35–52 s, so production uploads most likely never finish.
- **Where:** branches `feature/skill-matching` + `feature/resume-queue` (35 commits not on `main`). Production queues, metadata indexes and the `jd-pending/` lifecycle rule were provisioned on 2026-10-25.
- **Done when:** merged to `main`, both deploy jobs report `success`, production `/health` is ok and the queue consumer is attached.

## P1

### SYN-002 · Interview timezone picker is ignored
**P1** · Scheduling · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** `scheduled_at` is built from the browser's local time; the timezone dropdown changes nothing. Picking 2 PM Pacific from an IST browser saved `2026-10-28T08:30Z` (2 PM IST), 12.5 h off. The dropdown always defaults to Pacific, and the invitation email shows a time with no timezone.
- **Where:** `frontend/components/(recruiter)/ScheduleModal.tsx:107` (`new Date(calYear, calMonth - 1, date, hour, minute)`), `:39` (default `America/Los_Angeles`), email text built at `:56-80`.
- **Done when:** the saved instant equals the chosen wall time in the chosen zone, the default is the browser's zone, and emails name the zone.

### SYN-003 · Interviewers cannot join a company
**P1** · Interviewers · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** Nobody can invite an interviewer. Signup always creates a new company with the user as recruiter, so an interviewer can never be in the recruiter's company. An interviewer who isn't a user gets a "magic link" email that is only a link to `/interviews/:id`, which requires a login. The schedule modal says the interviewer "must be a registered Synthire user", which the backend doesn't require.
- **Where:** `backend/src/routes/auth.ts:68-78`, `backend/src/routes/interviews.ts:65-74` and `:116-131`, Settings → Team members ("coming soon"), copy in `ScheduleModal.tsx`.
- **Done when:** a recruiter can invite an interviewer by email who lands in the same company with the `interviewer` role (or a real passwordless link works), and the modal copy matches the behaviour.

### SYN-004 · Email delivery fails: SendGrid "Maximum credits exceeded"
**P1** · Email · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** Every send in local dev fails with `Maximum credits exceeded`. The local `email_logs` show 6 failures on 2026-10-24 and the last success on 2026-05-24. The production key has not been checked; if it shares the account, no interview emails go out there either.
- **Where:** `EMAIL_PROVIDER = "sendgrid"` (dev + production) in `backend/wrangler.toml`, the `SENDGRID_API_KEY` secret.
- **Done when:** the provider sends successfully in production (credits/plan, or switch to Resend) and repeated failures show up somewhere a recruiter or operator will see.

### SYN-005 · Candidate lists stay stale after a resume upload
**P1** · Upload · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** After a batch upload completed, the job's Candidates tab still said "0 candidates" and the sidebar count stayed at 14 until a full reload. The modal never invalidates the candidate or job queries. It also calls `apiUpload`/`apiFetch` directly (against the hooks rule) and its 2 s poll timers are not cleared when the modal closes.
- **Where:** `frontend/components/(recruiter)/ResumeBatchModal.tsx:34-85`.
- **Done when:** lists and counts refresh as each file finishes, upload and polling live in `hooks/queries/`, and timers stop on unmount.

### SYN-006 · Stage filter uses statuses that don't exist
**P1** · Candidates · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** The Candidates page filter offers "Applied" (`applied`) and "Interviewing" (`interviewing`), which the backend never stores. "Applied" showed 0 cards while 14 candidates were `new`.
- **Where:** `frontend/components/(recruiter)/Candidates.tsx:27-33` vs the status enum in `backend/src/types/api.ts:130` (`new, shortlisted, scheduled, inprogress, feedback, hired, rejected`).
- **Done when:** filter options come from the real status list and each one returns matching candidates.

### SYN-007 · Sessions end early: 15 min in dev, 24 h in production
**P1** · Auth · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** Locally, any navigation 15 minutes after login redirects to `/login`. The backend sets an HttpOnly `synthire_token` cookie with a 15-minute lifetime; cookies ignore the port, so on `localhost` it shadows the frontend's readable 24-hour cookie of the same name (script can't overwrite an HttpOnly cookie). When it expires, `middleware.ts` finds no cookie and redirects, even though a 30-day refresh token exists. The login page then refreshes the token silently but stays on the form. In production (different domains) the frontend cookie expires after 24 h, forcing a login despite the 30-day refresh token.
- **Where:** `backend/src/middleware/auth.ts:93-95`, `frontend/lib/auth.ts:22`, `frontend/middleware.ts`.
- **Done when:** the route gate lasts as long as the refresh token, the two cookies have different names, and a logged-in user hitting `/login` is sent on.

### SYN-008 · Failed uploads show as "Processing... · 0%" and hide the reason
**P1** · Candidates · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** A resume that failed processing keeps the placeholder name "Processing..." and shows a 0% score with 0% bars on cards, the pipeline "New" column (5 such cards), the dashboard and the job counts. The API has the reason (for example "No readable text found in the resume — scanned or image-only files are not supported") but no screen shows it; the upload modal row only says "error / Failed".
- **Where:** card mapping in `frontend/components/(recruiter)/Candidates.tsx:186-200` and `:416-428`, `PipelineKanban.tsx`, `Dashboard.tsx`, `ResumeBatchModal.tsx`.
- **Done when:** failed rows read as "Upload failed" with the reason and no score everywhere they appear.

### SYN-009 · Edits to the invitation email are thrown away
**P1** · Scheduling · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** The schedule modal's email preview is editable, but the edited text is never sent; the backend renders its own template.
- **Where:** `frontend/components/(recruiter)/ScheduleModal.tsx:44` and `:305` (`emailBody`), payload at `:102-112`.
- **Done when:** the edited body is what the candidate receives, or the preview is read-only.

## P2

### SYN-010 · Dashboard header and stat cards are hardcoded
**P2** · Dashboard · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** "Welcome back, Sarah" for every user; "You have 5 interviews and 23 new candidates"; deltas +12% / +8% / 0% / +2%, the sparklines, "across 3 jobs" and "vs last week" are constants. The numbers that are real use the wrong definitions: "Interviews Today" is every interview, "Pending Review" is every candidate, "Offers Out" is the hired count.
- **Where:** `frontend/components/(recruiter)/Dashboard.tsx:25-37`.
- **Done when:** every figure comes from the API with the right definition, or is removed.

### SYN-011 · Dashboard AI Insights card is fake
**P2** · Dashboard · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The card names "Marcus Chen, Priya Sharma, and Diego Vargas", a "Senior Software Engineer" role, "above 85%" and "Updated 4 min ago" for every account. "Dismiss" does nothing.
- **Where:** `frontend/components/(recruiter)/Dashboard.tsx:191-211`.
- **Done when:** the card shows insight computed from the account's data, or is hidden.

### SYN-012 · Dashboard funnel, time-to-hire and today's interviews carry fake labels
**P2** · Dashboard · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** "Last 30 days · 1,247 applicants", time-to-hire "26 days" and "23% YoY", and the "5 scheduled" badge are constants. The 30 days / 90 days / YTD tabs do nothing, and "Today's interviews" lists any interview, not today's.
- **Where:** `frontend/components/(recruiter)/Dashboard.tsx:62-68`, `:98-101`, `:113-116`.
- **Done when:** labels come from the data, the tabs filter or are removed, and the list is today's interviews.

### SYN-013 · Activity feed shows raw timestamps and the wrong verb
**P2** · Dashboard · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** Rows show raw ISO strings (`2026-10-05T12:55:49.080Z`) and every row says "<name> moved to <status>" even when nothing moved (the row is just the last update). "View all" does nothing.
- **Where:** `frontend/components/(recruiter)/Dashboard.tsx:79-82` and `:282-301`.
- **Done when:** times go through `formatDateTime`/relative time, the verb matches the event, and "View all" leads somewhere or is removed.

### SYN-014 · Sidebar "AI Credits" meter is hardcoded
**P2** · Navigation · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The sidebar shows "3,412 / 5,000 left" and a 68% bar for every account; "Upgrade plan" does nothing.
- **Where:** `frontend/components/shared/Sidebar.tsx:80-93`.
- **Done when:** it shows the real daily Neuron usage against the configured limit, or is removed.

### SYN-015 · Candidate cards show made-up details
**P2** · Candidates · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The first two skill chips always get a check mark, so Pulumi and AWS were "ticked" for a Data Engineer job that requires neither. Strengths and concerns are forced empty, so the quick view says "None flagged." when the AI analysis lists several. The title is forced blank ("—") and years to 0 ("· 0 yr" in list view). The quick view's "Shortlist" button has no handler.
- **Where:** `frontend/components/(recruiter)/Candidates.tsx:589-592`, `:197-201`, `:425-429`, `:664`.
- **Done when:** ticks reflect `skill_matches` (or are removed), strengths and concerns come from `ai_analysis`, nothing shows an invented value, and Shortlist works.

### SYN-016 · Interview questions ignore the job's requirements and the candidate's gaps
**P2** · AI · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** The UI says "Tailored to gaps", but the prompt only receives the candidate's name, job title, skills and recent roles, never the required skills or skill matches. Marcus Lee was missing Spark, Airflow and Kafka; none of his 7 questions touched them. "Regenerate" returns the same 7-day KV cache entry.
- **Where:** `backend/src/services/ai/prompts/generate-questions.ts`, `backend/src/routes/candidates.ts:211-257` (cache at `:221`).
- **Done when:** the prompt gets the job's required skills and the candidate's missing/transferable skills, and "Regenerate" really regenerates.

### SYN-017 · No way to delete a candidate or a job from the UI
**P2** · Candidates · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** The API supports deletion (and the queue purge works), but no hook or button calls it, so failed uploads and test jobs can't be cleaned up.
- **Where:** `candidatesApi.delete` / `jobsApi.delete` in `frontend/lib/api.ts:359` and `:369` are unused.
- **Done when:** recruiters can delete a candidate and a job with a confirmation step.

### SYN-018 · "Saved templates" in Settings are fake
**P2** · Settings · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** Interview rounds lists "Engineering — Standard · 4 rounds · used by 8 jobs", "Sales — Quota carrier" and "Design — Portfolio first" for every account.
- **Where:** `frontend/components/(recruiter)/Settings.tsx` (template list around `:121`).
- **Done when:** templates are real records, or the section is removed.

### SYN-019 · Notification bell has a permanent unread dot and does nothing
**P2** · Navigation · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The bell always shows an unread dot and clicking it does nothing; "What's new" also does nothing.
- **Where:** `frontend/components/shared/Navigation.tsx:75-79`.
- **Done when:** notifications exist, or both buttons are removed.

### SYN-020 · Upload screens promise features that don't exist
**P2** · Upload · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The dropzone says "PDFs, Word docs, or plain text — up to 200 files" and the modal says "Parse 100/min · Concurrent OCR + LLM extraction". The backend accepts only PDF and DOCX, and there is no OCR (scanned PDFs fail).
- **Where:** `frontend/components/(recruiter)/Dropzone.tsx:52`, `ResumeBatchModal.tsx:166`.
- **Done when:** the copy states what the product really does.

### SYN-021 · Analytics period tabs don't filter anything
**P2** · Analytics · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** 7D / 30D / 90D / YTD change a local state value that no query uses. "Export" does nothing.
- **Where:** `frontend/components/(recruiter)/Analytics.tsx:11`, `:65`, `:70`.
- **Done when:** the range reaches the analytics queries, or the tabs are removed.

### SYN-022 · Search only finds 5 candidates and 3 jobs
**P2** · Search · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** The command palette filters a fixed slice of the first 5 candidates and 3 jobs. Searching "Marcus" returned "No results."; "Pr" returned three identical "Priya Raman" rows with no job to tell them apart.
- **Where:** `frontend/components/shared/CommandPalette.tsx` (`slice(0, 5)`, `slice(0, 3)`).
- **Done when:** search covers every candidate and job (server-side search) and rows show the job.

### SYN-023 · Feedback "avg score" counts unrated categories as zero
**P2** · Interviews · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** With one category rated 4/5 and three unrated, the feedback modal showed "20% AVG SCORE".
- **Where:** `frontend/components/(interviewer)/InterviewConduct.tsx:662`.
- **Done when:** the average covers only rated categories (or all four are required first).

## P3

### SYN-024 · Buttons that do nothing
**P3** · UX · No-op · Status: **Open** · Found 2026-10-24

- **Problem:** These controls have no handler: Jobs "Export" (`Jobs.tsx:111`), Analytics "Export" (`Analytics.tsx:70`), "What's new", "Summarize" (`InterviewConduct.tsx:182`), "Save template" (`ScheduleModal.tsx:97`), kanban "Column options" and "Add candidate" (`PipelineKanban.tsx:181`, `:219`), dashboard "Dismiss" and "View all", "Upgrade plan", "Help & docs". Feedback `ai_summary` therefore stays empty.
- **Where:** as listed.
- **Done when:** each one works or is removed.

### SYN-025 · Raw enum values shown to users
**P3** · UX · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** The JD preview shows "full_time · senior"; the review step, job overview and job sidebar show "bachelors", "full time", "senior".
- **Where:** `JDUploadModal.tsx`, `JobForm.tsx` review step, job overview and candidates sidebar.
- **Done when:** one label map is used everywhere ("Full-time", "Senior", "Bachelor's").

### SYN-026 · Some dates bypass the shared date formatters
**P3** · UX · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** Interview lists show "10/28/2026, 2:00:00 PM" and the candidate Activity tab "10/24/2026, 11:21:38 PM" via `toLocaleString()`, against the frontend rule to use `formatDateTime`.
- **Where:** `frontend/components/(interviewer)/InterviewerHome.tsx:91`, `:118`, `:138`, `:158`; `frontend/components/(recruiter)/CandidateDetail.tsx:607-608`.
- **Done when:** all go through `@/lib/utils` formatters.

### SYN-027 · Scheduler allows dates in the past
**P3** · Scheduling · Bug · Status: **Open** · Found 2026-10-24

- **Problem:** Every day of the month is selectable, including days already gone.
- **Where:** `frontend/components/(recruiter)/ScheduleModal.tsx:51` (`disabledDays` is always empty).
- **Done when:** past days and past times today are disabled, and the backend rejects a past `scheduled_at`.

### SYN-028 · Empty "Which round?" gives no hint
**P3** · Scheduling · UX · Status: **Open** · Found 2026-10-24

- **Problem:** With no interview rounds configured, step 1 of the schedule modal is blank.
- **Where:** `frontend/components/(recruiter)/ScheduleModal.tsx:132-140`.
- **Done when:** it says no rounds exist and links to Settings → Interview rounds.

### SYN-029 · Dangling separators and singular/plural mistakes
**P3** · UX · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** "· Seattle, WA" (candidate header with no title), "Data Platform · ·" (job group header on /candidates), "30 min ·" (round with no interviewer role), "1 applicants", "1 ITEMS"; "8 positions open" also counts paused and closed jobs.
- **Where:** `CandidateDetail.tsx` header, `Candidates.tsx` group header, `Settings.tsx` round row, `Jobs.tsx`.
- **Done when:** separators render only between present values, counts pluralise, and "open" counts only active jobs.

### SYN-030 · "Open Zoom" label for every meeting link
**P3** · Interviews · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** The button says "Open Zoom" for a Google Meet link.
- **Where:** `frontend/components/(interviewer)/InterviewConduct.tsx:108-120`.
- **Done when:** it says "Join meeting" (or names the provider from the URL).

### SYN-031 · Console errors on several pages
**P3** · UX · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** A React duplicate-key warning under `InterviewerLayout` on `/interviews/:id` (source not traced yet), `/favicon.ico` 404 on every page, and the expected `/api/auth/me` 401 logged as an error on `/login`.
- **Where:** `frontend/app/(interviewer)/layout.tsx` subtree, `frontend/app/` (no favicon), `AuthContext`.
- **Done when:** these pages load with a clean console.

### SYN-032 · "Add N to pipeline" only shows a toast
**P3** · Upload · UX · Status: **Open** · Found 2026-10-24

- **Problem:** Candidates are already added when uploaded; the final button just shows "2 candidates added to …" and closes, which suggests the upload wasn't saved until then.
- **Where:** `frontend/components/(recruiter)/ResumeBatchModal.tsx:124-136`.
- **Done when:** the button becomes "View candidates" (or "Done") and the copy matches.

### SYN-033 · The attached JD can't be opened from the job page
**P3** · Jobs · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** The uploaded JD is stored against the job but only the interview room shows it; the job Overview has no link.
- **Where:** `GET /api/jobs/:id/jd` (`backend/src/routes/jobs.ts:244`) is used only by `InterviewConduct.tsx:370`.
- **Done when:** the job Overview shows the JD with view/download.

### SYN-034 · Scheduling or completing an interview doesn't move the candidate's stage
**P3** · Pipeline · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** Marcus Lee stayed "Shortlisted" after an interview was scheduled and completed; the pipeline had to be updated by hand.
- **Where:** `backend/src/routes/interviews.ts` (schedule and feedback paths).
- **Done when:** a product decision is made; if yes, scheduling moves to `scheduled` and feedback to `feedback`.

### SYN-035 · Kanban cards and interview rows don't say which job
**P3** · Pipeline · UX · Status: **Open** · Found 2026-10-24

- **Problem:** The same person appears once per application with no job title on kanban cards or interview list rows, so they can't be told apart.
- **Where:** `frontend/components/(recruiter)/PipelineKanban.tsx`, `frontend/components/(interviewer)/InterviewerHome.tsx`.
- **Done when:** each card and row shows the job.

### SYN-036 · Resume parsing drops details
**P3** · AI · Quality · Status: **Open** · Found 2026-10-24

- **Problem:** Marcus Lee's "B.S. Computer Engineering" shows as "B.S." with no field; JANE ANDERSON's first role shows a skill chip "K".
- **Where:** `backend/src/services/ai/prompts/parse-resume.ts`, education/experience rendering in `CandidateDetail.tsx`.
- **Done when:** the field of study and full skill names survive parsing and display.

### SYN-037 · Five of six Settings tabs are "coming soon"
**P3** · Settings · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** Profile, Team members, Email templates, Integrations and Billing each say "This section is coming soon." Team members blocks SYN-003.
- **Where:** `frontend/components/(recruiter)/Settings.tsx`.
- **Done when:** each tab is built or hidden.

### SYN-038 · Email footers say "© 2025"
**P3** · Email · Cosmetic · Status: **Open** · Found 2026-10-24

- **Problem:** All five email templates hardcode the year.
- **Where:** `backend/src/services/email/templates/{interview-scheduled,interview-reminder,magic-link,resume-uploaded,feedback-reminder}.ts`.
- **Done when:** the year is computed at render time.

### SYN-039 · Remove 11 stale agent worktrees
**P3** · Chore · Chore · Status: **Open** · Found 2026-10-24

- **Problem:** `.claude/worktrees/agent-*` and their `worktree-agent-*` branches are left over from earlier subagent runs.
- **Where:** `git worktree list`.
- **Done when:** `git worktree list` shows only the main checkout and the branches are deleted.

### SYN-040 · Login page illustration uses a made-up candidate
**P3** · Auth · Fake content · Status: **Open** · Found 2026-10-24

- **Problem:** The login screen shows a sample card ("Priya Sharma · Senior Engineer · 92", "3 high-potential matches found", "Interview scheduled · Tomorrow at 2:30 PM"). `TESTING_RULES.md` treats hardcoded names as bugs.
- **Where:** `frontend/components/(auth)/LoginForm.tsx:75-100`, `AuthLayout.tsx:55-90`.
- **Done when:** decided: keep it clearly marked as an illustration, or remove it.

### SYN-041 · Analytics Sources and Round performance are not wired
**P3** · Analytics · Gap · Status: **Open** · Found 2026-10-24

- **Problem:** Known placeholders (root `CLAUDE.md` → "Not yet wired"): `GET /api/analytics/sources` returns zeros and nothing tracks candidate source; there is no per-round aggregation, so "Round pass rate" stayed empty after a completed interview with feedback.
- **Where:** `backend/src/routes/analytics.ts`, `frontend/components/(recruiter)/Analytics.tsx`.
- **Done when:** both are built, and the "Not yet wired" section in `CLAUDE.md` shrinks accordingly.
