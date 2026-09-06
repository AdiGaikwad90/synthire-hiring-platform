import { describe, it, expect } from 'vitest'
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'
import { meterD1, meterKV, newTally } from '../../../../src/services/budget/meters'
import {
  buildQuotaConfig,
  assertQuotaAvailable,
  readUsage,
  QUOTA_DEFAULTS,
  utcDay,
} from '../../../../src/services/budget/quotas'
import type { Env } from '../../../../src/types/bindings'

// ── Stubs ────────────────────────────────────────────────────────────────────

/** Fake D1 that echoes a configurable `meta` and records executed SQL. */
function stubD1(meta: { rows_read?: number; rows_written?: number } | null, row: unknown = null) {
  const sql: string[] = []
  const binds: unknown[][] = []
  const stmt = {
    bind: (...args: unknown[]) => {
      binds.push(args)
      return stmt
    },
    run: async () => ({ meta, results: [] }),
    all: async () => ({ meta, results: [] }),
    first: async () => row,
    raw: async () => [],
  }
  const db = {
    prepare: (q: string) => {
      sql.push(q)
      return stmt
    },
    batch: async (stmts: unknown[]) => stmts.map(() => ({ meta })),
  } as unknown as D1Database
  return { db, sql, binds }
}

function stubKV() {
  const calls: string[] = []
  const kv = {
    get: async (k: string) => {
      calls.push(`get:${k}`)
      return null
    },
    put: async (k: string) => {
      calls.push(`put:${k}`)
    },
    delete: async (k: string) => {
      calls.push(`delete:${k}`)
    },
  } as unknown as KVNamespace
  return { kv, calls }
}

// ── meterD1 ──────────────────────────────────────────────────────────────────

describe('meterD1', () => {
  it('tallies rows_read and rows_written from D1 meta', async () => {
    const tally = newTally()
    const { db } = stubD1({ rows_read: 12, rows_written: 3 })
    await meterD1(db, tally).prepare('SELECT 1').run()
    expect(tally).toMatchObject({ d1RowsRead: 12, d1RowsWritten: 3 })
  })

  it('keeps metering across a .bind() chain (bind returns a new statement)', async () => {
    const tally = newTally()
    const { db } = stubD1({ rows_read: 5, rows_written: 0 })
    await meterD1(db, tally).prepare('SELECT ?').bind(1).bind(2).all()
    expect(tally.d1RowsRead).toBe(5)
  })

  it('accumulates across multiple queries rather than overwriting', async () => {
    const tally = newTally()
    const { db } = stubD1({ rows_read: 4, rows_written: 1 })
    const m = meterD1(db, tally)
    await m.prepare('a').run()
    await m.prepare('b').run()
    expect(tally).toMatchObject({ d1RowsRead: 8, d1RowsWritten: 2 })
  })

  it('tallies every statement in a batch()', async () => {
    const tally = newTally()
    const { db } = stubD1({ rows_read: 2, rows_written: 1 })
    const m = meterD1(db, tally)
    await m.batch([m.prepare('a'), m.prepare('b'), m.prepare('c')])
    expect(tally).toMatchObject({ d1RowsRead: 6, d1RowsWritten: 3 })
  })

  it('does not throw when meta is absent or partial', async () => {
    const tally = newTally()
    const { db } = stubD1(null)
    await meterD1(db, tally).prepare('SELECT 1').run()
    expect(tally).toMatchObject({ d1RowsRead: 0, d1RowsWritten: 0 })

    const t2 = newTally()
    const { db: db2 } = stubD1({ rows_read: 7 }) // rows_written missing
    await meterD1(db2, t2).prepare('SELECT 1').run()
    expect(t2).toMatchObject({ d1RowsRead: 7, d1RowsWritten: 0 })
  })

  it('passes the SQL through unchanged', async () => {
    const tally = newTally()
    const { db, sql } = stubD1({ rows_read: 1 })
    await meterD1(db, tally).prepare('SELECT name FROM users').run()
    expect(sql).toEqual(['SELECT name FROM users'])
  })
})

// ── meterKV ──────────────────────────────────────────────────────────────────

describe('meterKV', () => {
  it('counts get as a read and put as a write', async () => {
    const tally = newTally()
    const { kv } = stubKV()
    const m = meterKV(kv, tally)
    await m.get('a')
    await m.get('b')
    await m.put('c', '1')
    expect(tally).toMatchObject({ kvReads: 2, kvWrites: 1 })
  })

  it('does not count delete — it is not billed as a write on the free plan', async () => {
    const tally = newTally()
    const { kv } = stubKV()
    await meterKV(kv, tally).delete('a')
    expect(tally).toMatchObject({ kvReads: 0, kvWrites: 0 })
  })

  it('still forwards the underlying call', async () => {
    const tally = newTally()
    const { kv, calls } = stubKV()
    const m = meterKV(kv, tally)
    await m.get('k1')
    await m.put('k2', 'v')
    expect(calls).toEqual(['get:k1', 'put:k2'])
  })
})

// ── config ───────────────────────────────────────────────────────────────────

describe('buildQuotaConfig', () => {
  it('falls back to the ~90%-of-free-tier defaults', () => {
    expect(buildQuotaConfig({} as Env)).toEqual({
      enabled: true,
      d1MaxRowsReadDaily: QUOTA_DEFAULTS.d1MaxRowsReadDaily,
      d1MaxRowsWrittenDaily: QUOTA_DEFAULTS.d1MaxRowsWrittenDaily,
      kvMaxReadsDaily: QUOTA_DEFAULTS.kvMaxReadsDaily,
      kvMaxWritesDaily: QUOTA_DEFAULTS.kvMaxWritesDaily,
    })
  })

  it('ignores garbage and non-positive overrides instead of producing NaN', () => {
    for (const bad of ['', 'abc', '0', '-5']) {
      const c = buildQuotaConfig({ KV_MAX_WRITES_DAILY: bad } as Env)
      expect(c.kvMaxWritesDaily, `"${bad}" should fall back`).toBe(QUOTA_DEFAULTS.kvMaxWritesDaily)
    }
  })

  it('accepts a valid override', () => {
    expect(buildQuotaConfig({ KV_MAX_WRITES_DAILY: '50' } as Env).kvMaxWritesDaily).toBe(50)
  })

  it('is fail-closed: only an explicit "false" disables enforcement', () => {
    expect(buildQuotaConfig({ QUOTA_LIMITS_ENABLED: 'false' } as Env).enabled).toBe(false)
    expect(buildQuotaConfig({ QUOTA_LIMITS_ENABLED: 'nope' } as Env).enabled).toBe(true)
  })
})

// ── enforcement ──────────────────────────────────────────────────────────────

const usageRow = (over: Partial<Record<string, number>> = {}) => ({
  day: utcDay(),
  d1_rows_read: 0,
  d1_rows_written: 0,
  kv_reads: 0,
  kv_writes: 0,
  ...over,
})

describe('assertQuotaAvailable', () => {
  const cfg = buildQuotaConfig({} as Env)

  it('passes when everything is under budget', async () => {
    const { db } = stubD1(null, usageRow({ kv_writes: 10 }))
    await expect(assertQuotaAvailable(db, cfg)).resolves.toBeUndefined()
  })

  it('throws 503 once KV writes hit the cap — the tightest limit', async () => {
    const { db } = stubD1(null, usageRow({ kv_writes: QUOTA_DEFAULTS.kvMaxWritesDaily }))
    await expect(assertQuotaAvailable(db, cfg)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('is inclusive at the boundary: limit-1 passes, limit throws', async () => {
    const limit = QUOTA_DEFAULTS.kvMaxWritesDaily
    const { db: under } = stubD1(null, usageRow({ kv_writes: limit - 1 }))
    await expect(assertQuotaAvailable(under, cfg)).resolves.toBeUndefined()
    const { db: at } = stubD1(null, usageRow({ kv_writes: limit }))
    await expect(assertQuotaAvailable(at, cfg)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('catches a D1 write breach too, not just KV', async () => {
    const { db } = stubD1(null, usageRow({ d1_rows_written: QUOTA_DEFAULTS.d1MaxRowsWrittenDaily }))
    await expect(assertQuotaAvailable(db, cfg)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('never blocks when the kill switch is off, even far past every cap', async () => {
    const off = buildQuotaConfig({ QUOTA_LIMITS_ENABLED: 'false' } as Env)
    const { db } = stubD1(null, usageRow({ kv_writes: 1e9, d1_rows_written: 1e9 }))
    await expect(assertQuotaAvailable(db, off)).resolves.toBeUndefined()
  })
})

describe('readUsage', () => {
  it('degrades to zeros when the table is missing rather than taking the API down', async () => {
    const broken = {
      prepare: () => {
        throw new Error('no such table: quota_usage')
      },
    } as unknown as D1Database
    await expect(readUsage(broken)).resolves.toMatchObject({ d1_rows_read: 0, kv_writes: 0 })
  })

  it('returns a zeroed row when today has no record yet', async () => {
    const { db } = stubD1(null, null)
    await expect(readUsage(db)).resolves.toMatchObject({ day: utcDay(), kv_writes: 0 })
  })
})
