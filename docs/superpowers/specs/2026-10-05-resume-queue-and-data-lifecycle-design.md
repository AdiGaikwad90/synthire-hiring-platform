# Resume processing on Queues, and data lifecycle fixes

**Status:** implemented
**Date:** 2026-10-05

## Why

Five defects, found while verifying the skill-matching feature against the live
app and while clearing a recruiter's data:

1. **Resume processing is cancelled in production.** The upload route runs parse
   and score in `ctx.waitUntil()`. Cloudflare cancels `waitUntil` work 30 seconds
   after the response; the pipeline takes 35–45 s. Local dev does not enforce the
   limit, so it never showed.
2. **Deleting a candidate leaves its embedding in Vectorize.** The delete route
   removes the row and the R2 file, never the vector. 11 orphans were found.
3. **Company-filtered similarity search returns nothing.** The index has no
   metadata index on `companyId`, so `filter: { companyId }` matches no vectors.
4. **Local dev writes embeddings into the production index.** The default config
   binds `[[vectorize]]` to `synthire-embeddings`, and Vectorize has no local
   simulator, so `wrangler dev` writes to production.
5. **JD files are never linked to their job.** The frontend sends `jd_url` on job
   create; `createJobSchema` strips it and the INSERT never writes it. Every
   uploaded JD is an orphan in R2. Accepting a client-supplied path would also let
   a client attach another tenant's file.

## Intent

Make resume processing survive real production limits, and make data
lifecycle complete: what is uploaded is linked, what is deleted is fully
deleted, and dev never touches production data. Prefer platform features
(Queues, dead-letter queues, R2 lifecycle rules, metadata indexes) over
hand-written sweeps.

### Success criteria

- A resume whose processing takes longer than 30 s completes in production.
- Every failure ends in an honest terminal status (`error` with a reason); a
  transient failure retries automatically.
- Deleting a candidate removes its row, R2 file, embedding and caches.
- Every job created from an uploaded JD keeps that JD; abandoned JD uploads
  expire on their own.
- Running the app locally never writes to a production resource.

### Non-goals

- Moving JD parsing to the queue. It is one short LLM call, well under 30 s.
- Building a "similar candidates" feature. Vectorize is kept and made correct for
  it; the feature itself is separate work.
- Re-scoring or re-processing existing candidates.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Long-running processing | Cloudflare Queues, consumer in the same Worker | 15-min consumer wall clock; free plan includes it; no new deployable |
| Message payload | IDs only (claim check); file stays in R2 | 128 KB message limit; one source of truth |
| Terminal failure | Dead-letter queue, whose consumer marks the row `error` | Platform-native; no polling for exhausted retries |
| Daily AI budget exhausted | Retry delayed to the UTC budget reset | Recovers on its own instead of failing the upload |
| Candidate deletion side effects | One idempotent `purge-candidate` queue message | Retried by the platform; one place for every artifact |
| Vectorize | Keep; add metadata indexes; dev gets its own index | User decision: kept for future similarity search |
| JD attachment | Client sends `jd_parse_id`; server resolves, checks tenant, moves the file | Clients never name storage paths |
| Abandoned JD uploads | R2 lifecycle rule on `jd-pending/`, 1 day | Built-in; no sweep code |
| Infra setup | Idempotent `scripts/provision.sh`, documented | Repeatable; not a manual console step |

## Design

### 1. Queue-backed resume pipeline

**Queues** (one pair per environment):

| Env | Work queue | Dead-letter queue |
|---|---|---|
| production | `synthire-resume-jobs` | `synthire-resume-jobs-dlq` |
| staging | `synthire-resume-jobs-staging` | `synthire-resume-jobs-staging-dlq` |
| dev (top-level) | `synthire-resume-jobs-dev` | `synthire-resume-jobs-dev-dlq` |

Local dev runs queues in Miniflare; the dev names never reach Cloudflare unless
deployed.

**Consumer config:** `max_batch_size = 1` (one resume per invocation, so one bad
file cannot fail others), `max_retries = 3`, `max_concurrency = 5` (bounds
parallel Workers AI calls), `dead_letter_queue` set. The DLQ consumer uses
`max_batch_size = 10`.

**Message schema** — a discriminated union, validated with Zod on receipt:

```ts
type ResumeQueueMessage =
  | { type: 'process-resume'; candidateId: string; companyId: string; jobId: string; r2Key: string; fileType: 'pdf' | 'docx' }
  | { type: 'purge-candidate'; candidateId: string; companyId: string; resumeUrl: string | null }
```

A message that fails validation is logged and acked (retrying cannot fix it).

**Producer — `POST /api/candidates/upload`:** validate → create row with
`processing_status = 'queued'` → put file in R2 → record `resume_url` → send
`process-resume` → 202 `{ candidateId }`. If `send` throws, the row is marked
`error` ("Could not queue the resume for processing") and the route returns 503,
so no row is left waiting on a message that does not exist.

**Consumer — `queue()` handler in `src/index.ts`**, routing by `type` to
`src/queue/` handlers:

`process-resume`:
1. Load the candidate (tenant-scoped). Missing, `complete` or `error` → ack and
   stop. This makes redelivery idempotent.
2. If the row is `scoring` and `parsed_resume` is present, skip to step 5 — a
   retry after a scoring failure does not pay for parsing again.
3. Set `parsing`; read the file from R2; extract text; reject under 50 readable
   characters (permanent failure).
4. LLM parse; persist (status `scoring`).
5. Score; persist skill matches and scores (status `complete`).
6. Ack.

**Failure classification** (`classifyFailure(err, attempts)`, pure, unit-tested):

| Condition | Action |
|---|---|
| No readable text, unsupported file, file missing from R2, job missing | Mark `error` with the reason; ack |
| Daily Neuron budget exhausted (`AppError` 503 from the budget guard) | `retry({ delaySeconds })` until 00:00 UTC (capped at 24 h); status back to `queued` |
| Anything else (AI error, all models exhausted, D1/R2 transient) | `retry({ delaySeconds })` with backoff 30 s, 120 s, 600 s |
| Retries exhausted | Platform moves the message to the DLQ |

**DLQ consumer:** marks the candidate `error` — "Processing failed after
several attempts — please upload the resume again" — unless it is already
terminal; acks.

**Statuses:** `queued` is added before `parsing`. `processing_status` is TEXT
with no CHECK constraint, so no migration is needed.

**Stale sweep (existing safety net):** keeps failing `parsing`/`scoring` rows
untouched for 10 min. `queued` rows get a 25-hour threshold — longer than the
24-hour free-plan message retention plus the longest budget delay — so a
message waiting for the budget reset is never failed early, but a row whose
message expired is.

**CPU:** the consumer is I/O-bound (Workers AI, D1, R2); PDF extraction is well
under the 30 s default CPU limit, so `limits.cpu_ms` is not raised.

### 2. JD attachment

- `POST /api/jobs/parse-jd` stores the file at `jd-pending/{companyId}/{parseId}.{ext}`
  and records `{ status, result, companyId, pendingKey, ext }` in KV
  (`jdparse:{parseId}`), TTL raised from 1 h to 24 h. The poll response no longer
  returns a storage path.
- `createJobSchema` and `updateJobSchema` accept `jd_parse_id` (not `jd_url`).
- Job create with `jd_parse_id`:
  1. Resolve the KV record; reject 422 unless it exists, is `done`, and its
     `companyId` equals the caller's. A foreign parse ID is indistinguishable
     from an expired one.
  2. Insert the job.
  3. `attachJd()`: copy `jd-pending/...` to `jd/{companyId}/{jobId}.{ext}`,
     delete the pending object, set `jd_url`.
  4. If attaching fails after the insert (the pending object expired in
     between), keep the job, return it with `jd_attached: false`, and log. The
     UI shows a toast asking for a re-upload.
- Job update with `jd_parse_id` attaches the new file the same way and deletes
  the previous one.
- R2 lifecycle rule: delete objects under `jd-pending/` after 1 day (each bucket).

### 3. Vectorize lifecycle

- **Purge on delete.** `DELETE /api/candidates/:id` deletes the row (source of
  truth) and sends `purge-candidate`. `purgeCandidateArtifacts()` removes, each
  idempotently: the R2 file (via `deleteFromR2`, keeping storage accounting
  right), the vector (`VECTORIZE.deleteByIds`), and `questions:{id}` in KV. Any
  failure throws, so the queue retries.
- **Metadata indexes** on `companyId` and `jobId` (string) for every
  environment's index, created before any new vector is written. Vectors
  inserted before an index exists are not filterable; production holds one such
  vector and it is left as is, since no feature reads the index yet.
- **Dev isolation.** The top-level `[[vectorize]]` binds
  `synthire-embeddings-dev`. Production and staging are unchanged.
- **Visible failures.** The embedding upsert stays non-fatal but logs on
  failure instead of swallowing it.

### 4. Provisioning

`backend/scripts/provision.sh` (idempotent; existing resources are skipped):
queues and DLQs for each environment, `synthire-embeddings-dev`, the two
metadata indexes on each index, and the `jd-pending/` lifecycle rule on each
bucket. Run once before the first deploy of this change; `wrangler deploy`
fails loudly if a bound queue is missing, so a skipped step cannot ship
silently. Documented in `backend/CLAUDE.md`.

### 5. Frontend

- `JobForm` sends `jd_parse_id` instead of `jd_url`; shows a toast when the
  create response has `jd_attached: false`.
- `ResumeBatchModal` shows `queued` as "Queued", and after its 2-minute polling
  window reports "Still processing — results will appear on the candidate page"
  instead of marking the file failed.
- The candidate page already polls until `complete`/`error` and treats `queued`
  as in progress; no change.

## Failure handling summary

| Condition | Outcome |
|---|---|
| Upload accepted, queue send fails | Row `error`, 503 to the client |
| Resume has no readable text | `error` immediately, no retry |
| Workers AI transient error | Up to 3 retries with backoff, then DLQ → `error` |
| Daily AI budget reached | Waits for the UTC reset, then continues |
| Consumer crashes mid-message | Platform redelivers; idempotent steps resume |
| Message expires unprocessed | Stale sweep fails the row after 25 h |
| Candidate deleted | Row gone at once; artifacts purged with retries |
| JD parse ID foreign or expired | 422 on job create |
| JD file expires before attach | Job kept, `jd_attached: false`, toast |

## Testing

Per `TESTING.md`.

**Unit (tier A)**
- `classifyFailure`: each class; budget delay is seconds-to-midnight capped at
  24 h; backoff per attempt.
- Message schema: both variants accepted; malformed and unknown `type` rejected.

**Integration (tier B, real D1/KV/R2, stubbed AI and Vectorize)**
- Consumer via `createMessageBatch` / `getQueueResult`: happy path acks and
  completes; redelivery of a `complete` candidate acks without work; a retry
  from `scoring` does not call the parse model; no-text acks with `error`;
  budget exhaustion retries with the reset delay; transient error retries.
- DLQ consumer marks `error`, leaves terminal rows alone.
- Upload route: 202, row `queued`, `resume_url` set, message sent.
- Purge: R2 object, KV cache and storage accounting removed; vector delete
  called with the candidate ID; running it twice succeeds.
- JD attach: file moved and `jd_url` set; foreign tenant's parse ID → 422;
  expired parse → 422; pending object missing after insert → job kept with
  `jd_attached: false`.
- Stale sweep: `queued` failed only after 25 h.

**Live (mandatory, `TESTING.md` §10):** Playwright pass with real Workers AI —
upload resumes (including one over 30 s end to end), a blank PDF, delete a
candidate, create a job from an uploaded JD, and confirm dev wrote only to the
dev index.

## Risks

- **Queue consumer runs in production only after provisioning.** Mitigation: the
  script plus `wrangler deploy` failing on a missing queue.
- **Retries spend Neurons.** Mitigation: resume-from-scoring skip; max 3 retries;
  budget-exhausted waits instead of retrying.
- **Free-plan message retention is 24 h.** Mitigation: the 25-hour `queued`
  sweep makes an expired message end in `error`, not limbo.

## Out of scope

JD parsing on the queue, a similar-candidates feature, bulk re-processing of
existing candidates, and migrating existing orphaned JD files (the recruiter
clean-up already removed the known ones).
