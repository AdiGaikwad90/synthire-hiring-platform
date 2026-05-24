# Synthire — Testing Rules

Every fix, new feature, or modification must be tested with Playwright before handover. These rules apply to every session.

## Core Testing Mandate

- **Never hand over a fix without confirming it works in the browser first.**
- Use Playwright to test every change end-to-end.
- Do **3–4 test iterations** for any core feature — check consistency across runs, not just once.
- If a test fails, fix it and re-test. Repeat until passing.

## Test Account

```
Backend:  http://localhost:8787
Frontend: http://localhost:3001
Email:    test@synthire.io
Password: password123
```

Create account if missing:
```bash
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@synthire.io","password":"password123","name":"Test User","company_name":"Test Corp"}'
```

## What to Check on Every Page

1. **No hardcoded / fake data** — any number, name, stat, or text that is not from the real API is a bug.
2. **No native `<select>` elements** — every dropdown must use the `Select` component from `@/components/ui`. No `<select className="tsSelect">`.
3. **No placeholder text** — "Pretend this is configured", "Coming soon (placeholder)", "Mike Johnson", fake counts like 247/31/12 are all bugs.
4. **No console errors** — open DevTools and check the console on every page.
5. **No 404 pages** — every button and link that is visible to the user must lead somewhere valid.
6. **Empty states not crashes** — when there is no data, show a proper empty state, never undefined errors.

## User Journey Testing

Test from the perspective of a recruiter using the app for the first time:

1. **Login → Dashboard** — does the dashboard load without crash? Do stat cards show real data (or 0s, not fake numbers)?
2. **Jobs → Create job** — can they create a job end to end? Does it show in the list?
3. **Job detail** — clicking a job shows Overview / Candidates / Settings tabs. Is data real?
4. **Upload resume** — upload from inside a job's Candidates tab. Does it process and appear?
5. **Candidate detail** — clicking a candidate shows real parsed data (not empty experience/education).
6. **Pipeline** — Kanban board loads without error.
7. **Analytics** — no fake stat percentages, no crash on empty data.
8. **Settings** — no "Pretend this is configured" text.
9. **Profile dropdown** — opens a dropdown, does NOT immediately log out.

## Specific Patterns to Always Check

| Pattern | Must be | Must NOT be |
|---------|---------|-------------|
| Dropdowns | `Select` from `@/components/ui` | Native `<select className="tsSelect">` |
| Counts/stats | Real API data or `0` / `—` | Hardcoded numbers like 247, 31, 88% |
| Names | Real user data | "Mike Johnson", "Sarah Chen" hardcoded |
| Pipeline bars | Real counts from API | Hardcoded Applied/Shortlisted/Hired counts |
| AI summaries | Real LLM output or hidden | Hardcoded "Strong pipeline — top 5 candidates average 88% match" |
| Breadcrumbs | Section name | Raw nanoid IDs like `oOUxiQx5y-snuM8ke4Xxc` |
| Empty state | Icon + message | JS crash / undefined error |
| Routes | Working pages | 404 "This page could not be found" |

## Testing Flow for Each Fix

```
1. Implement fix
2. Run: npm run typecheck (must be 0 errors in src/)
3. Open browser (http://localhost:3001)
4. Navigate to the affected page
5. Take screenshot and verify the fix works
6. Check console for errors
7. Test edge cases (empty state, wrong data, navigation away and back)
8. Run 2–3 more iterations to confirm consistency
9. Only then report DONE to the user
```

## Red Flags That Mean "Not Done Yet"

- "I've implemented the fix" without a Playwright screenshot confirming it
- Passing typecheck but not testing in the browser
- Testing only the happy path (always test empty state too)
- Not checking console errors
- Not navigating away and back to confirm state resets properly
