# Reliability & Queue Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate double-send risk in email queue and SSE timeout risk in resume pipeline.

**Architecture:** Atomic D1 UPDATE...RETURNING replaces non-atomic SELECT+UPDATE for email dequeue; resume pipeline heavy work moved to waitUntil() so SSE closes immediately.

**Tech Stack:** Cloudflare Workers, D1, Hono, SSE

---

## Task 1: Atomic email queue dequeue

**File:** `backend/src/services/email/queue.ts`  
**Migration:** `backend/src/db/migrations/0003_email_queue_atomic.sql`  
**Types:** `backend/src/types/db.ts`

- [ ] Create migration file `backend/src/db/migrations/0003_email_queue_atomic.sql`:
  ```sql
  ALTER TABLE email_queue ADD COLUMN claimed_at INTEGER;
  ```

- [ ] Add `claimed_at?: number` to the email queue row type in `backend/src/types/db.ts`.

- [ ] At the top of `processEmailQueue()`, add stuck-claim recovery before any SELECT:
  ```ts
  await env.DB.prepare(
    `UPDATE email_queue SET status = 'pending', claimed_at = NULL
     WHERE status = 'claimed' AND claimed_at < unixepoch() - 120`
  ).run();
  ```

- [ ] Replace the existing SELECT+UPDATE dequeue pattern with a single atomic claim:
  ```ts
  const claimed = await env.DB.prepare(
    `UPDATE email_queue
     SET status = 'claimed', claimed_at = unixepoch()
     WHERE id IN (
       SELECT id FROM email_queue
       WHERE status = 'pending'
         AND scheduled_for <= unixepoch()
         AND retry_count < max_retries
       LIMIT ?
     )
     RETURNING *`
  ).bind(BATCH_SIZE).all<EmailQueueRow>();
  const emails = claimed.results ?? [];
  ```

- [ ] Remove any subsequent SELECT that was fetching the same rows; process `emails` directly.

- [ ] Apply the migration locally: `wrangler d1 migrations apply synthire-prod --local`

---

## Task 2: Move SSE pipeline work to waitUntil()

**File:** `backend/src/routes/candidates.ts`

- [ ] In the SSE upload handler, emit `parsing` and `scoring` status events immediately after the file is stored in R2 and the candidate row is inserted with `processing_status = 'processing'`:
  ```ts
  stream.writeSSE({ data: JSON.stringify({ status: 'parsing' }) });
  stream.writeSSE({ data: JSON.stringify({ status: 'scoring' }) });
  await stream.close();
  ```

- [ ] Extract the LLM parse + embedding + scoring block into a standalone async function (e.g. `runResumePipeline(candidateId, fileText, jobId, env)`). If it is already a function, no rename needed.

- [ ] After closing the SSE stream, hand off the pipeline to `waitUntil()` so it outlives the response:
  ```ts
  c.executionCtx.waitUntil(
    runResumePipeline(candidateId, fileText, jobId, env).catch((err) => {
      console.error('pipeline error', candidateId, err);
      // mark candidate failed so UI can surface the error
      env.DB.prepare(
        `UPDATE candidates SET processing_status = 'failed' WHERE id = ?`
      ).bind(candidateId).run();
    })
  );
  ```

- [ ] Verify the frontend polling path: `GET /api/candidates/:id` must return `processing_status`. Confirm `toCandidate()` maps the column — no change needed if it already does.

- [ ] Run `cd backend && npm run typecheck` — must be 0 errors in `src/`.
