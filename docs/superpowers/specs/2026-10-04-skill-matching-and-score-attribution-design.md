# Skill matching and score attribution

**Status:** approved, not yet implemented
**Date:** 2026-10-04

## Why

Two panels on the candidate detail page present fabricated data.

**Skills match** marks every extracted skill as Required with a green tick:

```ts
// CandidateDetail.tsx:257
const skillsTable = c.skills.map((skill: string) => ({
  name: skill, required: true, status: 'met',
}))
```

It never reads the job's `required_skills`. A candidate with none of the
required skills looks identical to a perfect match.

**Score breakdown** hardcodes `Technical skills (40%)`, `Experience (30%)`,
`Education (20%)`, `Achievements (10%)` — the legacy v1 weights. The backend
uses v2 importances (defaults 80/70/50/60, normalised by weighted average) that
are **configurable per job**, so the labels are both wrong and static when a
recruiter tunes a job.

The scores themselves are genuine model output. Only the weight labels and the
match ticks are invented.

A third defect enables the second: `buildScoringMessages(..., _dimensions)`
takes the job's configured importances and ignores them.

## Intent

Make both panels truthful and driven by real data, modelled on how a senior
recruiter reads a resume rather than on keyword checking.

Three decisions follow from that framing:

- A recruiter credits **PyTorch, 3 years on a recsys** as evidence of deep
  learning even when the resume never says "deep learning". String comparison
  cannot do this, so matching is a model judgement.
- A recruiter distinguishes a skill **proved by shipped work** from one
  **listed in a keyword blob**. That distinction is where inflated resumes get
  caught, so it must survive into the data model.
- A recruiter wants to know **what drove the score**, not what the weights were.

The panels serve shortlist decisions, interview preparation and cross-candidate
comparison at once: a verdict at a glance, evidence and gaps on demand.

### Non-goals

- Automated accept/reject. Nothing in this design gates a decision on a score.
- Changing the scoring maths. The weighted-average rollup is unchanged.
- Resume rewriting, candidate messaging, or sourcing.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Match engine | Extend the existing scoring LLM call | Zero extra Neurons, zero extra latency, full semantic reasoning |
| Verdicts | `evidenced` / `claimed` / `transferable` / `missing` | Separates proof from assertion — the padding detector |
| Persistence | Normalised `candidate_skill_matches` table | Enables cross-candidate gap analytics that a JSON blob cannot answer in SQL |
| Breakdown | Points contributed, expandable to sub-dimensions | Answers "why 81?" rather than restating configuration |
| Weighting in prompt | **Not** passed to the model | Avoids double-counting and keeps scores comparable across jobs |

### Why the model is not told the weights

Telling the model that skills carry 80 importance makes it score skills higher,
and the rollup then weights that inflated score up again — the same preference
applied twice. It also makes a candidate's dimension scores incomparable
between two jobs that weight differently. Scores stay independent measurements;
weighting stays arithmetic. The unused `_dimensions` parameter is deleted.

## Design

### 1. LLM contract

`LLMScores` gains one optional field:

```ts
skill_matches?: {
  skill: string
  requirement: 'required' | 'nice_to_have'
  verdict: 'evidenced' | 'claimed' | 'transferable' | 'missing'
  evidence: string | null   // short paraphrase grounding the verdict
  via: string | null        // transferable only: the skill that credits it
}[]
```

**Optional on purpose.** `validateLLMScores` must not reject a response that
omits it. A model that returns good dimension scores but no skill matches still
produces a usable candidate; the panel degrades instead of the upload failing.

The prompt asks for a verdict on every required and nice-to-have skill, with
explicit definitions:

- `evidenced` — demonstrated by described work, not merely listed
- `claimed` — present in a skills list with no supporting experience
- `transferable` — absent, but an adjacent skill reasonably credits it; name it in `via`
- `missing` — no support in the resume

**Bounds.** At most 25 skills are sent for adjudication, required before
nice-to-have. `LLM_SCORE` rises 2000 → 3000 tokens to fit the larger response.
When a job exceeds 25, the UI states which skills were evaluated rather than
implying the rest passed.

### 2. Schema — migration `0009_candidate_skill_matches.sql`

```sql
CREATE TABLE candidate_skill_matches (
  id            TEXT PRIMARY KEY,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id        TEXT NOT NULL REFERENCES jobs(id)       ON DELETE CASCADE,
  company_id    TEXT NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  skill         TEXT NOT NULL,
  requirement   TEXT NOT NULL,   -- 'required' | 'nice_to_have'
  verdict       TEXT NOT NULL,   -- evidenced | claimed | transferable | missing
  evidence      TEXT,
  via_skill     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_csm_candidate_skill ON candidate_skill_matches(candidate_id, skill);
CREATE INDEX        idx_csm_job_verdict     ON candidate_skill_matches(job_id, verdict);
CREATE INDEX        idx_csm_company         ON candidate_skill_matches(company_id);
```

`company_id` is carried for tenant scoping, consistent with every other table.

**Writes are idempotent.** Re-scoring deletes the candidate's rows and inserts
the new set inside one `db.batch()`, so a re-score replaces rather than
duplicates. Roughly 10–25 D1 writes per candidate, negligible against the
90k/day budget.

### 3. Scoring attribution

`aggregateScore()` additionally returns:

```ts
contributions: {
  skills: number; experience: number; education: number; achievements: number
  semantic: number
}
```

```
contribution_i = (dimensionScore_i × importance_i / Σimportance) × llmWeight
semantic       = semanticScore × semanticWeight
```

**Invariant:** the contributions sum to `overall` before rounding. This is the
property that makes the panel trustworthy and is asserted directly in tests.

A dimension with importance 0 contributes exactly 0 — it does not silently
inherit a default.

### 4. API

- `GET /api/candidates/:id` includes `skill_matches` and `contributions`.
- `GET /api/jobs/:id/skill-gaps` — new, recruiter/admin only, tenant-scoped.
  Returns per-skill counts by verdict across the job's applicants. The
  denominator is **candidates with skill-match rows for that job** — i.e. those
  scored since this shipped — not all applicants, so the figure is never
  diluted by candidates that were never adjudicated. The response carries that
  count explicitly: *"Kubernetes: missing in 33 of 42 scored applicants (78%)."*

The gaps endpoint is the reason for a normalised table. It is a single
`GROUP BY` here and an application-level scan over every candidate row if the
data lived in a JSON column.

### 5. Frontend

**Skills panel.** Grouped by verdict, required before nice-to-have, with counts
in the header for skimming. Evidence is revealed on expand. `claimed` is
visually distinct from `evidenced` — a recruiter must be able to see at a
glance that six "skills" are assertions with nothing behind them.

**Breakdown panel.** Five contribution bars labelled with points — the four
dimensions plus **semantic match as its own bar**, because it is 30% of the
score by default and hiding it would make the four shown bars fail to sum to
the total. Percentages are derived from the job's `scoring_dimensions`. The four
dimension bars expand to the sub-dimensions the model already returns; semantic
has none and does not expand.

**Absent data is stated, never faked.** Candidates scored before this ships
have no rows; the panel reads *"Skill analysis not available — re-score to
generate"*. Reverting to ticks would reintroduce the defect this replaces.

### 6. Failure handling

| Condition | Behaviour |
|---|---|
| Model omits `skill_matches` | Score still persists; panel shows the unavailable state |
| Unknown verdict string | Normalised to `missing` — fail closed, never credit on ambiguity |
| Job has no required skills | Panel hidden; nothing to match against |
| More than 25 skills | First 25 adjudicated; UI names the evaluated set |
| Batch insert fails | Logged; scoring is not rolled back — a score without matches beats no score |

### 7. Testing

Per `TESTING.md`, tier A for the maths and normalisation, tier B for persistence
and the endpoint.

**Unit (tier A)**
- Contributions sum to `overall` across the usual, all-equal, single-dimension and all-zero cases
- Zero-importance dimension contributes exactly 0
- `semanticWeight: 0` makes the semantic contribution 0 and the rest sum to `overall`
- Unknown or missing verdict normalises to `missing`
- `validateLLMScores` still passes when `skill_matches` is absent
- Skill cap selects required before nice-to-have

**Integration (tier B)**
- Persist then read back round-trips verdict, evidence and `via`
- Re-scoring replaces rows; the unique index holds and no duplicates appear
- `skill-gaps` aggregates correctly and never crosses tenants
- A malformed `skill_matches` payload does not fail the upload

## Risks

**The `evidenced` / `claimed` line is a judgement call** and the model will be
inconsistent at the margin. Mitigation: explicit definitions in the prompt,
evidence text shown so a recruiter can overrule, and `claimed` presented as
"listed, not evidenced" rather than as a negative verdict.

**The 25-skill cap truncates very long job descriptions.** Mitigation: state
which skills were evaluated. Silent truncation would be a new fabrication.

**Prompt and response grow**, raising the chance of malformed JSON — the
failure mode that caused the earlier resume-parsing outage. Mitigation: the
budget rises to 3000, `skill_matches` is optional so a truncated response still
yields a score, and the existing truncation diagnostics already distinguish a
budget overrun from unparseable output.

## Out of scope

Skill taxonomy or normalisation (treating "k8s" and "Kubernetes" as one),
candidate-to-candidate similarity, and historical trend analysis. Each is a
separate piece of work; the normalised table is what makes them possible later.
