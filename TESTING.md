# TESTING.md — Synthire testing standards

How to test new and existing functionality. `TESTING_RULES.md` is the **manual
pre-release browser checklist**; this file is the automated strategy CI enforces.

Read this before writing a test. If a rule here and a rule there disagree, this
file wins for anything CI runs.

> **Keep this file current.** Changing the suites, the tier assignments, the
> coverage thresholds, or the workers-pool constraints means updating this doc
> **in the same PR**. See "Keeping these docs current" in the root `CLAUDE.md`.

---

## The suites

```bash
cd backend
npm run test:unit         # pure logic, plain Node — milliseconds
npm run test:integration  # inside workerd, real local D1/KV/R2
npm test                  # both
npm run test:coverage     # unit project + threshold gate
npm run lint              # eslint src tests
npm run typecheck         # tsc, INCLUDES tests/
```

CI runs lint → typecheck → `npm test` → `npm run test:coverage`. All four must
exit 0 or nothing deploys.

**`npm test` alone is not enough before pushing.** Vitest transpiles without
typechecking, so a test can pass while `tsc` fails. Run `npm run typecheck` too.
This has already caught real mistakes twice.

---

## 1. Which suite does my test belong in?

| Needs | Suite | Directory |
|---|---|---|
| Nothing but inputs and outputs | `unit` | `backend/tests/unit/**` mirroring `src/` |
| `env.DB`, `env.KV_CACHE`, `env.RESUME_BUCKET` | `integration` | `backend/tests/integration/**` |
| `env.AI`, `env.VECTORIZE` | `unit`, with a hand-written stub | — |

**A unit test that reaches for `env` is in the wrong suite.** Move it rather
than mocking a binding.

### Mock at the boundary you do not own. Use the real thing for the boundary under test.

| Dependency | Approach | Why |
|---|---|---|
| D1, KV, R2 | **Real** (local Miniflare) | The bug class is "the database behaved differently than assumed". A mock returns what you already assumed and proves nothing. |
| `env.AI` | **Stub — mandatory** | No local simulator; nondeterministic; costs Neurons; and you *need* to force bad output to exercise the fallback chain. |
| `env.VECTORIZE` | **Stub — mandatory** | No local simulator. |
| Outbound `fetch` (Resend/SendGrid) | **Stub — mandatory** | A test must never send real email. |
| Time | **Fake timers** | Neuron day rollover, retry backoff, token expiry. |

This is not theoretical. Choosing real local D1 over a mock is what surfaced the
email-queue timestamp bug, where `scheduled_for <= datetime('now')` compared an
ISO string against SQLite's format and never matched. A mocked D1 would have
passed.

---

## 2. Coverage tiers — the rule that replaces "one test file per source file"

Chasing 1:1 produces assertion-free filler. Every source file sits in a tier:

| Tier | Applies to | Requirement |
|---|---|---|
| **A — Exhaustive** | `services/scoring/**`, `services/budget/**`, `services/parsing/detector.ts`, `middleware/auth.ts`, `middleware/cors.ts`, `utils/**` | Every branch and boundary. New code needs tests in the same PR. |
| **B — Contract** | `routes/**`, `db/queries/**`, `services/email/**` | Happy path + the auth/tenant matrix + at least one malformed-input case |
| **C — Smoke** | `middleware/logger.ts`, email templates | Runs without throwing |
| **D — Exempt** | `types/**`, barrel files, `db/migrations/**`, `frontend` `.tsx` components, `frontend/lib/data.ts` | No test. Listed explicitly so it is a decision, not an oversight. |

Tier A files carry per-file coverage thresholds in `vitest.config.mts`.

**Thresholds are measured floors, never aspirations.** Set them to what the
suite actually reaches, minus a small margin. A threshold above real coverage
gets deleted the first time it goes red, and then you have no gate at all.
Ratchet up. Never down.

Do not use directory globs for thresholds — a glob averages pure logic together
with binding-dependent modules and produces a number that means nothing.

---

## 3. The case matrix — required for every Tier A and B unit

Every `describe` block covers all six, or says in a comment why one is N/A:

| Class | What it means | Example — `aggregateScore()` |
|---|---|---|
| **Happy** | The documented normal case | typical dims → expected number |
| **Positive variants** | Legitimate alternate shapes | importances all equal; a single dimension; semantic weight 0 |
| **Boundaries** | Min, max, off-by-one | scores exactly 0 and 100; clamping at both ends |
| **Invalid input** | Wrong type, missing, malformed | `null` sub-dimensions; `NaN`; a string where a number belongs |
| **Empty / zero** | The nothing case | `{}` dims; all importance 0 → **0, not `NaN`** |
| **Error contract** | Throws the right thing | budget exceeded → `AppError` with `statusCode === 503` |

At the route level (Tier B) the same six become: 200 on valid input; an
alternate valid payload; boundary (`limit=1`, `limit=max`, empty result set);
**422 with Zod detail** on invalid input; **401** on missing/forged/expired
token; **403/404** for the wrong tenant.

Three rules for invalid input:
1. Assert the **status and the error shape**, not merely that it failed.
2. Assert **no partial write happened** on rejection.
3. Anything crossing a trust boundary — upload magic bytes, the Resend HMAC,
   JWT, CORS origins — needs at least one **hostile** case, not just a
   malformed one. See `tests/unit/middleware/cors.test.ts`, which rejects
   `...pages.dev.evil.com` and `localhost.evil.com`.

---

## 4. Fixtures

**Always** build shared entities with `tests/setup/factories.ts`. Never
hand-write an `INSERT` for a company, user, job, or queued email.

The schema has real FKs and NOT NULL constraints, so a missing column fails
loudly in one place instead of in ten test files. `makeJobData()` exists because
`CreateJobData` has several required fields and omitting one produces a
`D1_TYPE_ERROR` rather than anything readable.

- Never share a mutable fixture between tests. Seed per test in `beforeEach`.
- Use `insertRawJob()` when you deliberately need a malformed row — that is the
  only sanctioned way to bypass the query helpers.
- IDs come from `testId()`: deterministic within a run, unique across calls. No
  `Math.random()`, no `Date.now()` in an ID.

---

## 5. Naming and structure

```ts
describe('functionName — happy path', () => {
  it('rolls sub-dimensions up, then dimensions up, then blends with semantic', ...)
})
```

- `describe` names the unit under test. Suffix it with the case class when a
  file has several blocks.
- `it` states the behaviour, not the mechanics. **`it('works')` is not a name.**
- One assertion subject per test. Looping over a table of hostile inputs inside
  one `it` is fine — pass a message so a failure names the offender:
  `expect(fn(v), \`"${v}" must be rejected\`).toBe(false)`.
- When a test pins a **limitation** rather than desired behaviour, say so in a
  comment. See the `skillMatchScore` test recording that "Java" matches a
  "JavaScript" requirement — documented, not endorsed.

---

## 6. What not to test

- Implementation details. Test the contract; a refactor that keeps behaviour
  must keep tests green.
- Third-party libraries. Not our job to test `jose` or `hono`.
- Type-only code, barrels, generated files.
- Anything in Tier D.

---

## 7. Async rules

- No bare `setTimeout` in a test. Use fake timers.
- Every `ctx.waitUntil` path is asserted explicitly with
  `createExecutionContext()` + `waitOnExecutionContext()` — never with a sleep.
- Concurrency contracts get a genuinely concurrent test. See
  `tests/integration/email/queue.test.ts`, which fires two `processEmailQueue()`
  calls with `Promise.all` to prove the `UPDATE...RETURNING` claim is atomic.

---

## 8. The `cloudflare:test` contract

```ts
import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
```

- `env` is typed by `tests/env.d.ts` as our `Env` plus `TEST_MIGRATIONS`.
- Migrations `0001`–`00NN` are applied by `tests/setup/migrate.ts` before any
  integration test, so tests hit the real schema.
- The integration project uses **`wrangler.test.toml`**, not `wrangler.toml`.

Three hard constraints, learned the hard way:

1. **`[ai]` and `[[vectorize]]` must not appear in `wrangler.test.toml`.**
   Neither has a local simulator; the pool tries a remote connection and
   **segfaults workerd** on startup.
2. **`main = "src/index.ts"` works, but `mammoth` must be aliased away.**
   Loading the real worker segfaults workerd because mammoth's dependency tree
   (bluebird, jszip, argparse) crashes on top-level init. Bisected: `unpdf`,
   `jose` and `bcryptjs` are all fine. `vitest.config.mts` aliases mammoth to
   `tests/fixtures/mammoth-stub.ts` for the integration project only —
   production bundling is untouched. If a new dependency makes the pool
   segfault on startup, bisect it the same way: point `main` at a trivial
   worker, then add imports one at a time.
3. **Coverage cannot instrument workerd.** `@vitest/coverage-v8` imports
   `node:inspector/promises`, which workerd does not provide. `test:coverage`
   is scoped to `--project unit`. Integration tests run uninstrumented — their
   value is behavioural, not a coverage number.

---

## 9. Definition of done for a PR

- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0 — **run it, `npm test` does not typecheck**
- [ ] `npm test` exits 0 (both projects)
- [ ] `npm run test:coverage` exits 0; no threshold lowered
- [ ] New Tier A/B code has tests **in the same PR**
- [ ] A bug fix has a regression test that **fails without the fix** — verify by
      reverting the fix locally and watching it go red
- [ ] Any deliberate limitation is pinned by a commented test

### Fixing a bug

1. Write the failing test first. If it passes, you have not reproduced the bug.
2. Fix at the root, not the symptom. Grep every caller before editing.
3. Confirm the test now passes and the rest of the suite is still green.
4. Reference the mechanism in the test comment — see the `scheduled_for`
   regression block, which explains the `'T'` vs `' '` byte ordering so nobody
   "simplifies" the `datetime()` wrapper away.

---

## 10. Manual browser checks

`TESTING_RULES.md` holds the 9-step recruiter journey. Treat it as a
**pre-release manual checklist**, not a per-PR gate — nothing enforces it and
Playwright is not installed. Do not claim it as coverage.

If it should be a real gate, it needs automating as Playwright specs in CI.
Until then, run it by hand before a release and say plainly that it was manual.
