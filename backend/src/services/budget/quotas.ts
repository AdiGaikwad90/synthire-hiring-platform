/**
 * Cloudflare free-tier quota guardrails for D1 and KV.
 *
 * Defaults sit at ~90% of the documented Workers Free allowances so the app
 * fails fast with a clear 503 instead of hitting Cloudflare's own hard error:
 *
 *   D1  — 5,000,000 rows read/day · 100,000 rows written/day   (resets 00:00 UTC)
 *   KV  —   100,000 reads/day     ·   1,000 writes/day         (resets 00:00 UTC)
 *
 * KV writes are by far the tightest constraint. Consumers today: the neuron
 * counter, R2 op/storage tracking, the login limiter, the JD-parse and
 * question caches, and the webhook replay guard.
 *
 * Counting is done by proxying env.DB / env.KV_CACHE per request (see
 * ./meters.ts) and flushing one aggregate upsert at the end of the request.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { AppError } from '../../types/api'
import type { Env } from '../../types/bindings'
import { isGuardrailEnabled } from '../../utils/env'

export interface QuotaConfig {
  enabled: boolean
  d1MaxRowsReadDaily: number
  d1MaxRowsWrittenDaily: number
  kvMaxReadsDaily: number
  kvMaxWritesDaily: number
}

// ~90% of the Workers Free allowance — same margin the R2 guardrails use.
export const QUOTA_DEFAULTS = {
  d1MaxRowsReadDaily: 4_500_000,   // of 5,000,000
  d1MaxRowsWrittenDaily: 90_000,   // of   100,000
  kvMaxReadsDaily: 90_000,         // of   100,000
  kvMaxWritesDaily: 900,           // of     1,000
} as const

export function buildQuotaConfig(env: Env): QuotaConfig {
  return {
    enabled: isGuardrailEnabled(env.QUOTA_LIMITS_ENABLED),
    d1MaxRowsReadDaily: int(env.D1_MAX_ROWS_READ_DAILY, QUOTA_DEFAULTS.d1MaxRowsReadDaily),
    d1MaxRowsWrittenDaily: int(env.D1_MAX_ROWS_WRITTEN_DAILY, QUOTA_DEFAULTS.d1MaxRowsWrittenDaily),
    kvMaxReadsDaily: int(env.KV_MAX_READS_DAILY, QUOTA_DEFAULTS.kvMaxReadsDaily),
    kvMaxWritesDaily: int(env.KV_MAX_WRITES_DAILY, QUOTA_DEFAULTS.kvMaxWritesDaily),
  }
}

function int(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export interface QuotaUsage {
  day: string
  d1_rows_read: number
  d1_rows_written: number
  kv_reads: number
  kv_writes: number
}

const ZERO = (day: string): QuotaUsage => ({
  day,
  d1_rows_read: 0,
  d1_rows_written: 0,
  kv_reads: 0,
  kv_writes: 0,
})

/** Read today's counters. Never throws — a missing table degrades to zeros. */
export async function readUsage(db: D1Database, day = utcDay()): Promise<QuotaUsage> {
  try {
    const row = await db
      .prepare('SELECT day, d1_rows_read, d1_rows_written, kv_reads, kv_writes FROM quota_usage WHERE day = ?')
      .bind(day)
      .first<QuotaUsage>()
    return row ?? ZERO(day)
  } catch {
    // Table missing (migration not yet applied) must never take the API down.
    return ZERO(day)
  }
}

/**
 * Pre-flight check. Called once per request, before the handler runs.
 * Throws 503 when a daily allowance is already spent.
 */
export async function assertQuotaAvailable(db: D1Database, config: QuotaConfig): Promise<void> {
  if (!config.enabled) return

  const usage = await readUsage(db)

  const breaches: Array<[number, number, string]> = [
    [usage.kv_writes, config.kvMaxWritesDaily, 'KV writes'],
    [usage.d1_rows_written, config.d1MaxRowsWrittenDaily, 'D1 rows written'],
    [usage.kv_reads, config.kvMaxReadsDaily, 'KV reads'],
    [usage.d1_rows_read, config.d1MaxRowsReadDaily, 'D1 rows read'],
  ]

  for (const [used, limit, label] of breaches) {
    if (used >= limit) {
      throw new AppError(
        `Daily ${label} quota reached (${used.toLocaleString()} / ${limit.toLocaleString()}). ` +
          'Resets at midnight UTC. Raise the limit in wrangler.toml or set ' +
          'QUOTA_LIMITS_ENABLED="false" to stop enforcing.',
        503,
      )
    }
  }
}

/**
 * Add a request's tallies to today's row. Always counts, even when enforcement
 * is off, so the usage snapshot stays honest while a limit is disabled.
 *
 * MUST be called with the unproxied D1 handle, otherwise the flush counts
 * itself and the counter runs away.
 */
export async function flushUsage(
  rawDb: D1Database,
  delta: { d1RowsRead: number; d1RowsWritten: number; kvReads: number; kvWrites: number },
): Promise<void> {
  const { d1RowsRead, d1RowsWritten, kvReads, kvWrites } = delta
  if (!d1RowsRead && !d1RowsWritten && !kvReads && !kvWrites) return

  try {
    await rawDb
      .prepare(
        `INSERT INTO quota_usage (day, d1_rows_read, d1_rows_written, kv_reads, kv_writes, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(day) DO UPDATE SET
           d1_rows_read    = d1_rows_read    + excluded.d1_rows_read,
           d1_rows_written = d1_rows_written + excluded.d1_rows_written,
           kv_reads        = kv_reads        + excluded.kv_reads,
           kv_writes       = kv_writes       + excluded.kv_writes,
           updated_at      = datetime('now')`,
      )
      .bind(utcDay(), d1RowsRead, d1RowsWritten, kvReads, kvWrites)
      .run()
  } catch (err) {
    // Bookkeeping must never fail a request that already succeeded.
    console.warn('[quota] flush failed', err instanceof Error ? err.message : err)
  }
}

export interface QuotaSnapshot extends QuotaUsage {
  limits_enabled: boolean
  d1_rows_read_limit: number
  d1_rows_written_limit: number
  kv_reads_limit: number
  kv_writes_limit: number
  d1_rows_read_pct: number
  d1_rows_written_pct: number
  kv_reads_pct: number
  kv_writes_pct: number
}

export async function getQuotaSnapshot(db: D1Database, config: QuotaConfig): Promise<QuotaSnapshot> {
  const u = await readUsage(db)
  const pct = (used: number, limit: number) =>
    parseFloat(((used / limit) * 100).toFixed(1))
  return {
    ...u,
    limits_enabled: config.enabled,
    d1_rows_read_limit: config.d1MaxRowsReadDaily,
    d1_rows_written_limit: config.d1MaxRowsWrittenDaily,
    kv_reads_limit: config.kvMaxReadsDaily,
    kv_writes_limit: config.kvMaxWritesDaily,
    d1_rows_read_pct: pct(u.d1_rows_read, config.d1MaxRowsReadDaily),
    d1_rows_written_pct: pct(u.d1_rows_written, config.d1MaxRowsWrittenDaily),
    kv_reads_pct: pct(u.kv_reads, config.kvMaxReadsDaily),
    kv_writes_pct: pct(u.kv_writes, config.kvMaxWritesDaily),
  }
}
