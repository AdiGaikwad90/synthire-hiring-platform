# Plan C: Data Integrity & Reliability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every data corruption risk, field name mismatch, hardcoded placeholder, and unhandled failure path so the platform produces correct results and recovers gracefully from every error condition.

**Architecture:** Fix the backend AI prompts (field names, output quality, strengths/concerns), harden the scoring pipeline (validation, error codes, circuit breaker), fix R2 orphan cleanup, and align frontend rendering to the actual API response shapes. Add frontend error recovery (retry on network blips, loading states, timeout guards).

**Tech Stack:** Workers AI, Zod, Hono, D1, Cloudflare Workers KV, React Query v5, Next.js

---

## Files Modified / Created

| File | Change |
|------|--------|
| `backend/src/services/ai/prompts/parse-resume.ts` | Fix field names (institution/from/to/stack); rewrite for keyword quality; few-shot example |
| `backend/src/services/ai/prompts/score-candidate.ts` | Add `strengths[]` + `concerns[]` to output schema |
| `backend/src/services/scoring/pipeline.ts` | Store `{summary, strengths, concerns}` JSON; circuit breaker |
| `backend/src/db/queries/candidates.ts` | Parse `ai_analysis` JSON in `toCandidate()`; unify name placeholder |
| `backend/src/db/migrations/0010_constraints.sql` | NEW — CHECK constraints on scores + duration |
| `backend/src/routes/candidates.ts` | R2 cleanup on pipeline error; better error codes |
| `backend/src/services/ai/fallback.ts` | Circuit breaker: skip LLM for 5 min after N consecutive failures |
| `frontend/components/(recruiter)/CandidateDetail.tsx` | Fix education/experience rendering; parse ai_analysis; show processing_error state |
| `frontend/components/(recruiter)/Analytics.tsx` | Remove hardcoded source chart; fix time-to-hire loading; hide trend badges when no data |
| `frontend/lib/api.ts` | Retry refresh on network errors (not on 401); structured error codes |
| `frontend/components/(recruiter)/Candidates.tsx` | Add loading states to shortlist/reject buttons; toast on success/error |
| `frontend/components/(recruiter)/ResumeBatchModal.tsx` | Add 5-minute upload polling timeout |

---

## Task 1: Fix resume parse prompt — field names + output quality

**Files:**
- Modify: `backend/src/services/ai/prompts/parse-resume.ts`

- [ ] **Step 1: Read current prompt file**

```bash
cat backend/src/services/ai/prompts/parse-resume.ts
```

Note the current field names returned: `school`, `year`, `technologies`, and any full-sentence skills.

- [ ] **Step 2: Rewrite prompt with correct field names and keyword-only constraint**

Replace the prompt string with:

```typescript
export const PARSE_RESUME_PROMPT = (resumeText: string) => `
You are a resume parser. Extract structured data from the resume below.
Return ONLY valid JSON matching this exact schema. No prose, no explanation.

RULES:
- skills: array of SHORT KEYWORDS only (1-4 words each, e.g. "React", "TypeScript", "AWS Lambda"). NEVER full sentences.
- Extract ALL technologies and tools mentioned anywhere in the resume.
- experience[].stack: array of SHORT KEYWORDS (technologies used in that role).
- education[].institution: university/school name (not abbreviation).
- education[].from: start year as 4-digit string e.g. "2018".
- education[].to: end year as 4-digit string e.g. "2022", or "Present".
- If a field is unknown, omit it (do not use null).

EXAMPLE output for a software engineer:
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1-555-0100",
  "location": "San Francisco, CA",
  "summary": "Full-stack engineer with 5 years building SaaS products.",
  "skills": ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"],
  "total_years_experience": 5,
  "experience": [
    {
      "company": "Acme Corp",
      "title": "Senior Engineer",
      "from": "2021",
      "to": "Present",
      "description": "Led migration from monolith to microservices.",
      "stack": ["Node.js", "Kubernetes", "PostgreSQL"]
    }
  ],
  "education": [
    {
      "institution": "University of California, Berkeley",
      "degree": "B.S. Computer Science",
      "from": "2016",
      "to": "2020"
    }
  ],
  "certifications": ["AWS Certified Developer"]
}

Resume:
${resumeText}

Return ONLY the JSON object above, no markdown fences.`
```

- [ ] **Step 3: Update Zod schema to match new field names**

```typescript
import { z } from 'zod'

export const ParsedResumeSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  total_years_experience: z.number().optional(),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    description: z.string().optional(),
    stack: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })).default([]),
  certifications: z.array(z.string()).default([]),
})

export type ParsedResume = z.infer<typeof ParsedResumeSchema>
```

- [ ] **Step 4: Update `LLM_MAX_TOKENS` in `wrangler.toml` to 3000**

```toml
LLM_MAX_TOKENS = "3000"
```

(Under `[vars]` and `[env.production.vars]`)

- [ ] **Step 5: Verify typecheck**

```bash
cd backend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/prompts/parse-resume.ts backend/wrangler.toml
git commit -m "fix: rewrite parse-resume prompt with correct field names and keyword-only constraint"
```

---

## Task 2: Fix scoring prompt — add strengths and concerns

**Files:**
- Modify: `backend/src/services/ai/prompts/score-candidate.ts`
- Modify: `backend/src/services/scoring/pipeline.ts`
- Modify: `backend/src/db/queries/candidates.ts`

- [ ] **Step 1: Update scoring prompt and Zod schema**

Open `backend/src/services/ai/prompts/score-candidate.ts`. Add `strengths` and `concerns` to both the prompt and the Zod schema:

Prompt addition (inside the JSON schema instructions):
```
"strengths": ["string array — 2-4 specific strengths observed in this resume"],
"concerns": ["string array — 2-4 gaps, red flags, or areas of concern"],
```

Zod schema update:
```typescript
export const ScoringResultSchema = z.object({
  skills_score: z.number().min(0).max(100),
  experience_score: z.number().min(0).max(100),
  education_score: z.number().min(0).max(100),
  achievements_score: z.number().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
})
export type ScoringResult = z.infer<typeof ScoringResultSchema>
```

- [ ] **Step 2: Store strengths and concerns in `pipeline.ts`**

Find where `ai_analysis` is set (or where the scoring result is saved). Update to JSON-encode all fields:

```typescript
// In pipeline.ts, after scoring:
const ai_analysis = JSON.stringify({
  summary: scoringResult.summary,
  strengths: scoringResult.strengths ?? [],
  concerns: scoringResult.concerns ?? [],
})
await updateCandidateScores(db, candidateId, {
  ...scores,
  ai_analysis,
})
```

- [ ] **Step 3: Parse `ai_analysis` in `toCandidate()` deserializer**

Open `backend/src/db/queries/candidates.ts`. Find `toCandidate()`. Update the `ai_analysis` handling:

```typescript
let parsedAnalysis: { summary?: string; strengths?: string[]; concerns?: string[] } = {}
try {
  parsedAnalysis = row.ai_analysis ? JSON.parse(row.ai_analysis) : {}
} catch {
  // Legacy: treat as plain summary string
  parsedAnalysis = { summary: row.ai_analysis ?? '', strengths: [], concerns: [] }
}

return {
  // ...other fields
  ai_analysis: parsedAnalysis.summary ?? '',
  strengths: parsedAnalysis.strengths ?? [],
  concerns: parsedAnalysis.concerns ?? [],
}
```

- [ ] **Step 4: Expose `strengths` and `concerns` in the API type**

Ensure `ApiCandidate` in `frontend/lib/types.ts` has:
```typescript
strengths: string[]
concerns: string[]
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ai/prompts/score-candidate.ts \
        backend/src/services/scoring/pipeline.ts \
        backend/src/db/queries/candidates.ts \
        frontend/lib/types.ts
git commit -m "feat: add strengths and concerns to scoring prompt and persist to DB"
```

---

## Task 3: Fix CandidateDetail rendering — education, experience, strengths, concerns, error state

**Files:**
- Modify: `frontend/components/(recruiter)/CandidateDetail.tsx`

- [ ] **Step 1: Fix education rendering to use `institution`, `from`, `to`**

Find the BreakdownTab education renderer. Update:

```typescript
// Before (broken):
<p>{e.school}</p>
<p>{e.year}</p>

// After (correct):
<p>{e.institution}</p>
<p>{[e.from, e.to].filter(Boolean).join(' – ')}</p>
```

- [ ] **Step 2: Fix experience rendering to use `stack` not `technologies`**

```typescript
// Before (broken):
{exp.technologies?.map(t => <span key={t} className="tsChip">{t}</span>)}

// After (correct):
{exp.stack?.map(t => <span key={t} className="tsChip">{t}</span>)}
```

- [ ] **Step 3: Render strengths and concerns from real data**

```typescript
const { data: candidate } = useCandidate(candidateId)

// In JSX (replace hardcoded [] arrays):
const strengths = candidate?.strengths ?? []
const concerns = candidate?.concerns ?? []

{strengths.length > 0 && (
  <div className="tsStrengths">
    <h4 className="h4 tsPositive">Strengths</h4>
    <ul>{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
  </div>
)}
{concerns.length > 0 && (
  <div className="tsConcerns">
    <h4 className="h4 tsWarning">Concerns</h4>
    <ul>{concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
  </div>
)}
```

- [ ] **Step 4: Show error state when processing_status is 'error'**

```typescript
if (candidate?.processing_status === 'error') {
  return (
    <div className="tsErrorState">
      <h3 className="h3">Resume processing failed</h3>
      <p className="tsBody tsTextMuted">
        {candidate.processing_error ?? 'An error occurred while processing this resume.'}
      </p>
      <p className="tsBody tsTextMuted">Please re-upload the resume or contact support.</p>
    </div>
  )
}
```

Only show the resume preview when `processing_status === 'complete'`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/(recruiter)/CandidateDetail.tsx
git commit -m "fix: render education institution/from/to, experience stack, real strengths/concerns, error state"
```

---

## Task 4: Fix Analytics — remove hardcoded data, fix time-to-hire

**Files:**
- Modify: `frontend/components/(recruiter)/Analytics.tsx`
- Modify: `frontend/components/(recruiter)/Dashboard.tsx`

- [ ] **Step 1: Remove hardcoded Source Effectiveness chart**

Find the Sources chart section (hardcoded percentages: Direct 25%, LinkedIn 40%, etc.). Replace with an empty state:

```typescript
<div className="tsChartCard">
  <h3 className="h3">Source Effectiveness</h3>
  <div className="tsEmptyState">
    <p className="tsBody tsTextMuted">Source tracking is not yet configured.</p>
    <span className="tsChip">Coming soon</span>
  </div>
</div>
```

- [ ] **Step 2: Fix time-to-hire loading state**

Find the time-to-hire section. It has a spinner that never resolves. Check `useTimeToHire()` return value:

```typescript
const { data: timeToHire, isLoading: tthLoading } = useTimeToHire()

// In JSX:
{tthLoading ? (
  <div className="tsSkeleton" style={{ height: 200 }} />
) : !timeToHire || timeToHire.length === 0 ? (
  <div className="tsEmptyState">
    <p className="tsBody tsTextMuted">Not enough data yet. Hire your first candidate to see time-to-hire trends.</p>
  </div>
) : (
  <TimeToHireChart data={timeToHire} />
)}
```

- [ ] **Step 3: Hide trend badges when no prior-period data**

Find all instances of hardcoded `+15%`, `+8%`, `-5%` etc. For each:

```typescript
// Before:
<span className="tsStatTrend">+15%</span>

// After (only show if API returns a real trend value):
{summary?.trend_percentage != null
  ? <span className={`tsStatTrend ${summary.trend_percentage >= 0 ? 'tsUp' : 'tsDown'}`}>
      {summary.trend_percentage > 0 ? '+' : ''}{summary.trend_percentage}%
    </span>
  : null
}
```

- [ ] **Step 4: Remove hardcoded subtext strings**

Find these hardcoded strings and remove or replace with real data:
- `"9 accepted, 1 declined, 2 pending"` → remove (show nothing until backend tracks this)
- `"5.2 per role on avg"` → remove
- `"+12% conversion"` badge on Hiring Funnel → remove (only show if `funnel.conversion_trend` is returned by API)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/(recruiter)/Analytics.tsx frontend/components/(recruiter)/Dashboard.tsx
git commit -m "fix: remove hardcoded analytics data, replace source chart with coming-soon state"
```

---

## Task 5: DB constraints migration

**Files:**
- Create: `backend/src/db/migrations/0010_constraints.sql`

- [ ] **Step 1: Create migration with CHECK constraints**

```sql
-- backend/src/db/migrations/0010_constraints.sql

-- Ensure interview feedback scores are in valid range
-- SQLite doesn't support adding CHECK constraints via ALTER TABLE,
-- so we add triggers instead:

CREATE TRIGGER IF NOT EXISTS check_feedback_scores
BEFORE INSERT ON interview_feedback
BEGIN
  SELECT CASE
    WHEN NEW.technical_score IS NOT NULL AND (NEW.technical_score < 0 OR NEW.technical_score > 100)
      THEN RAISE(ABORT, 'technical_score must be 0-100')
    WHEN NEW.communication_score IS NOT NULL AND (NEW.communication_score < 0 OR NEW.communication_score > 100)
      THEN RAISE(ABORT, 'communication_score must be 0-100')
    WHEN NEW.problem_solving_score IS NOT NULL AND (NEW.problem_solving_score < 0 OR NEW.problem_solving_score > 100)
      THEN RAISE(ABORT, 'problem_solving_score must be 0-100')
    WHEN NEW.culture_score IS NOT NULL AND (NEW.culture_score < 0 OR NEW.culture_score > 100)
      THEN RAISE(ABORT, 'culture_score must be 0-100')
  END;
END;

CREATE TRIGGER IF NOT EXISTS check_feedback_scores_update
BEFORE UPDATE ON interview_feedback
BEGIN
  SELECT CASE
    WHEN NEW.technical_score IS NOT NULL AND (NEW.technical_score < 0 OR NEW.technical_score > 100)
      THEN RAISE(ABORT, 'technical_score must be 0-100')
    WHEN NEW.communication_score IS NOT NULL AND (NEW.communication_score < 0 OR NEW.communication_score > 100)
      THEN RAISE(ABORT, 'communication_score must be 0-100')
  END;
END;

-- Ensure interview duration is reasonable (15 min to 8 hours)
CREATE TRIGGER IF NOT EXISTS check_interview_duration
BEFORE INSERT ON interviews
BEGIN
  SELECT CASE
    WHEN NEW.duration_minutes IS NOT NULL AND (NEW.duration_minutes < 15 OR NEW.duration_minutes > 480)
      THEN RAISE(ABORT, 'duration_minutes must be 15-480')
  END;
END;

-- Ensure min_years_experience is non-negative
CREATE TRIGGER IF NOT EXISTS check_job_experience
BEFORE INSERT ON jobs
BEGIN
  SELECT CASE
    WHEN NEW.min_years_experience IS NOT NULL AND NEW.min_years_experience < 0
      THEN RAISE(ABORT, 'min_years_experience cannot be negative')
  END;
END;
```

Apply:
```bash
cd backend && wrangler d1 migrations apply synthire-prod --local
```

- [ ] **Step 2: Add backend validation before DB insert (belt-and-suspenders)**

In `backend/src/routes/interviews.ts`, find where interview feedback is submitted. Add Zod validation:

```typescript
const feedbackSchema = z.object({
  technical_score: z.number().int().min(0).max(100).optional(),
  communication_score: z.number().int().min(0).max(100).optional(),
  problem_solving_score: z.number().int().min(0).max(100).optional(),
  culture_score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
  recommendation: z.enum(['strong_yes', 'yes', 'neutral', 'no', 'strong_no']).optional(),
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/0010_constraints.sql backend/src/routes/interviews.ts
git commit -m "feat: add DB triggers for score/duration range validation"
```

---

## Task 6: R2 orphan cleanup on pipeline error

**Files:**
- Modify: `backend/src/routes/candidates.ts`

- [ ] **Step 1: Delete R2 file when pipeline fails**

In the `runPipeline` function (background handler in `candidates.ts`), find the catch block that calls `updateCandidateError()`. Add R2 cleanup:

```typescript
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Processing failed'
  await updateCandidateError(db, candidateId, errorMessage)
  // Clean up orphaned R2 file
  try {
    if (resumeUrl) {
      const r2Key = resumeUrl.split('/').pop() ?? ''
      await env.RESUME_BUCKET.delete(`resumes/${user.company_id}/${jobId}/${r2Key}`)
    }
  } catch (r2Err) {
    console.error('[pipeline] Failed to clean up R2 file:', r2Err)
  }
}
```

- [ ] **Step 2: Add specific error codes to AI failure**

In `fallback.ts`, when all models are exhausted, set a typed error:

```typescript
throw new AppError('AI_QUOTA_EXHAUSTED: All models failed or quota reached', 503)
```

In `updateCandidateError`, the error message is stored in `processing_error`. Frontend uses this for display (see Task 3, Step 4).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/candidates.ts backend/src/services/ai/fallback.ts
git commit -m "fix: delete R2 file on pipeline error; add typed error codes for AI failures"
```

---

## Task 7: AI circuit breaker

**Files:**
- Modify: `backend/src/services/ai/fallback.ts`

- [ ] **Step 1: Add circuit breaker using KV**

```typescript
// In fallback.ts, add to the top of `callWithFallback`:
const CIRCUIT_KEY = 'circuit:llm'
const FAILURE_THRESHOLD = 5
const COOLDOWN_SECONDS = 300 // 5 minutes

export async function callWithFallback<T>(
  env: Env,
  models: string[],
  prompt: string,
  validateFn: (raw: unknown) => T
): Promise<T> {
  // Circuit breaker check
  const circuitState = await env.KV_CACHE.get(CIRCUIT_KEY)
  if (circuitState) {
    const { failCount, openedAt } = JSON.parse(circuitState)
    if (failCount >= FAILURE_THRESHOLD && Date.now() - openedAt < COOLDOWN_SECONDS * 1000) {
      throw new AppError('AI service temporarily unavailable. Please retry in a few minutes.', 503)
    }
  }

  let lastError: Error | null = null
  for (const model of models) {
    try {
      const raw = await callModel(env, model, prompt)
      const validated = validateFn(raw)
      // Success — reset circuit
      await env.KV_CACHE.delete(CIRCUIT_KEY)
      return validated
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  // All models failed — increment circuit breaker
  const existing = circuitState ? JSON.parse(circuitState) : { failCount: 0, openedAt: Date.now() }
  existing.failCount += 1
  existing.openedAt = Date.now()
  await env.KV_CACHE.put(CIRCUIT_KEY, JSON.stringify(existing), { expirationTtl: COOLDOWN_SECONDS * 2 })

  throw new AppError('AI processing failed. Please try again in a few minutes.', 503)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/ai/fallback.ts
git commit -m "feat: add circuit breaker to LLM fallback chain with 5-minute cooldown"
```

---

## Task 8: Frontend API refresh retry + structured errors

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Retry refresh on network errors (not 401)**

Find the refresh interceptor in `apiFetch`. Update:

```typescript
async function refreshAccessToken(): Promise<string | null> {
  let attempts = 0
  while (attempts < 3) {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.status === 401 || res.status === 403) return null // genuine auth failure
      if (!res.ok) {
        attempts++
        await new Promise(r => setTimeout(r, 1000 * attempts)) // backoff
        continue
      }
      const data = await res.json()
      return data.data?.token ?? null
    } catch {
      attempts++
      await new Promise(r => setTimeout(r, 1000 * attempts))
    }
  }
  return null
}
```

- [ ] **Step 2: Structured error codes**

Update `ApiError` in `api.ts`:

```typescript
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
```

When throwing from `apiFetch`:
```typescript
const json = await res.json().catch(() => ({}))
throw new ApiError(
  json.error?.message ?? json.error ?? 'Request failed',
  res.status,
  json.error?.code
)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "fix: retry refresh on network errors, add structured error codes"
```

---

## Task 9: Loading states + toast on mutating actions

**Files:**
- Modify: `frontend/components/(recruiter)/Candidates.tsx`
- Modify: `frontend/components/(recruiter)/CandidateDetail.tsx`

- [ ] **Step 1: Add loading state to shortlist/reject buttons in `CandidateDetail.tsx`**

Find `updateStage.mutate(...)`. Add `onSuccess` and `onError` + button disabled state:

```typescript
const updateStage = useUpdateCandidateStage()
const toast = useToast()

const handleStageChange = (stage: string, label: string) => {
  updateStage.mutate(
    { candidateId: candidate.id, stage },
    {
      onSuccess: () => toast({ type: 'success', message: `Candidate ${label}` }),
      onError: (err: unknown) => toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update status' }),
    }
  )
}

// In JSX:
<Button
  onClick={() => handleStageChange('shortlisted', 'shortlisted')}
  disabled={updateStage.isPending}
  variant="primary"
>
  {updateStage.isPending ? 'Updating…' : 'Shortlist'}
</Button>
```

- [ ] **Step 2: Wire shortlist/reject icon buttons in `Candidates.tsx`**

Find the card-level shortlist/reject icon buttons. They have no `onClick`. Wire them:

```typescript
const updateStage = useUpdateCandidateStage()
const toast = useToast()

<button
  disabled={updateStage.isPending}
  onClick={(e) => {
    e.stopPropagation()
    updateStage.mutate(
      { candidateId: candidate.id, stage: 'shortlisted' },
      {
        onSuccess: () => toast({ type: 'success', message: 'Candidate shortlisted' }),
        onError: () => toast({ type: 'error', message: 'Failed to shortlist' }),
      }
    )
  }}
  aria-label="Shortlist"
>
  <ThumbsUpIcon />
</button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/(recruiter)/Candidates.tsx \
        frontend/components/(recruiter)/CandidateDetail.tsx
git commit -m "feat: add loading states and toast feedback to shortlist/reject actions"
```

---

## Task 10: Upload polling timeout guard

**Files:**
- Modify: `frontend/components/(recruiter)/ResumeBatchModal.tsx`

- [ ] **Step 1: Add 5-minute timeout to polling**

Find the polling loop in `ResumeBatchModal`. The current loop runs for 60 ticks × 2s = 2 minutes. Increase timeout and add user-facing message:

```typescript
const MAX_POLL_TICKS = 150 // 5 minutes (150 × 2s)
let ticks = 0

const pollInterval = setInterval(async () => {
  ticks++
  if (ticks > MAX_POLL_TICKS) {
    clearInterval(pollInterval)
    setFileState(fileId, 'error')
    setFileError(fileId, 'Processing timed out. The file may be too complex. Please try again.')
    return
  }
  // ... existing polling logic
}, 2000)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/(recruiter)/ResumeBatchModal.tsx
git commit -m "fix: add 5-minute timeout to resume upload polling"
```

---

## Verification Checklist

- [ ] `cd backend && npm run typecheck` — 0 errors
- [ ] `cd frontend && npm run typecheck` — 0 errors
- [ ] Upload a real PDF résumé → CandidateDetail education shows institution + from/to dates
- [ ] Upload a real PDF résumé → CandidateDetail experience shows stack keywords (not sentences)
- [ ] CandidateDetail shows Strengths and Concerns (populated, not empty)
- [ ] Upload a corrupt/empty PDF → processing_status = 'error', detail page shows error state
- [ ] Analytics Source chart shows "Source tracking coming soon" (not fake percentages)
- [ ] Analytics time-to-hire shows skeleton then empty state (no infinite spinner)
- [ ] Dashboard shows no +15% trend badge when no prior-period data
- [ ] Shortlist a candidate → button shows "Updating…" while pending, toast on success
- [ ] Submit invalid feedback score (e.g. 150) via API → 422 validation error
- [ ] Upload polling for a slow file → shows "Processing timed out" after 5 minutes
- [ ] Disconnect network mid-session → refresh retries 3x before logging out
