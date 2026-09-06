import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  flushUsage,
  readUsage,
  assertQuotaAvailable,
  getQuotaSnapshot,
  buildQuotaConfig,
  utcDay,
  QUOTA_DEFAULTS,
} from '../../../src/services/budget/quotas'
import { meterD1, meterKV, newTally } from '../../../src/services/budget/meters'
import {
  checkNeuronBudget,
  deductNeurons,
  buildNeuronLimitConfig,
  NEURON_COSTS,
} from '../../../src/services/budget/neurons'
import type { Env } from '../../../src/types/bindings'

/**
 * The unit tests cover these against stubs. These cover the half that only a
 * real backend can show: that the SQL upsert actually accumulates, that KV TTLs
 * and value round-tripping behave, and that the metering proxies observe real
 * D1 `meta.rows_read` / `rows_written` rather than a hand-written fixture.
 */

const testEnv = () => env as unknown as Env

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM quota_usage').run()
})

describe('flushUsage — real D1 upsert', () => {
  it('creates today\'s row on first flush', async () => {
    await flushUsage(env.DB, { d1RowsRead: 5, d1RowsWritten: 2, kvReads: 3, kvWrites: 1 })
    const u = await readUsage(env.DB)
    expect(u).toMatchObject({ day: utcDay(), d1_rows_read: 5, d1_rows_written: 2, kv_reads: 3, kv_writes: 1 })
  })

  it('ACCUMULATES across flushes rather than overwriting — the ON CONFLICT clause', async () => {
    await flushUsage(env.DB, { d1RowsRead: 5, d1RowsWritten: 2, kvReads: 3, kvWrites: 1 })
    await flushUsage(env.DB, { d1RowsRead: 10, d1RowsWritten: 1, kvReads: 0, kvWrites: 4 })
    const u = await readUsage(env.DB)
    expect(u).toMatchObject({ d1_rows_read: 15, d1_rows_written: 3, kv_reads: 3, kv_writes: 5 })
  })

  it('is a no-op when every delta is zero, so idle requests cost no write', async () => {
    await flushUsage(env.DB, { d1RowsRead: 0, d1RowsWritten: 0, kvReads: 0, kvWrites: 0 })
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM quota_usage').first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('survives 20 concurrent flushes without losing counts', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () => flushUsage(env.DB, { d1RowsRead: 1, d1RowsWritten: 0, kvReads: 0, kvWrites: 0 })),
    )
    const u = await readUsage(env.DB)
    expect(u.d1_rows_read).toBe(20)
  })
})

describe('assertQuotaAvailable — against real stored usage', () => {
  it('passes when under budget', async () => {
    await flushUsage(env.DB, { d1RowsRead: 1, d1RowsWritten: 1, kvReads: 1, kvWrites: 1 })
    await expect(assertQuotaAvailable(env.DB, buildQuotaConfig(testEnv()))).resolves.toBeUndefined()
  })

  it('throws 503 once real stored KV writes reach the cap', async () => {
    await flushUsage(env.DB, {
      d1RowsRead: 0, d1RowsWritten: 0, kvReads: 0,
      kvWrites: QUOTA_DEFAULTS.kvMaxWritesDaily,
    })
    await expect(assertQuotaAvailable(env.DB, buildQuotaConfig(testEnv())))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('reports usage and limits together in the snapshot', async () => {
    await flushUsage(env.DB, { d1RowsRead: 0, d1RowsWritten: 0, kvReads: 0, kvWrites: 450 })
    const snap = await getQuotaSnapshot(env.DB, buildQuotaConfig(testEnv()))
    expect(snap.kv_writes).toBe(450)
    expect(snap.kv_writes_limit).toBe(QUOTA_DEFAULTS.kvMaxWritesDaily)
    expect(snap.kv_writes_pct).toBeCloseTo(50, 0)
    expect(snap.limits_enabled).toBe(true)
  })
})

describe('meters — against real bindings', () => {
  it('observes real rows_written reported by D1', async () => {
    const tally = newTally()
    const db = meterD1(env.DB, tally)
    await db.prepare("INSERT INTO quota_usage (day, kv_writes) VALUES ('2099-01-01', 1)").run()
    expect(tally.d1RowsWritten).toBeGreaterThan(0)
  })

  it('observes real rows_read reported by D1', async () => {
    await flushUsage(env.DB, { d1RowsRead: 1, d1RowsWritten: 0, kvReads: 0, kvWrites: 0 })
    const tally = newTally()
    const db = meterD1(env.DB, tally)
    await db.prepare('SELECT * FROM quota_usage').all()
    expect(tally.d1RowsRead).toBeGreaterThan(0)
  })

  it('counts real KV gets and puts, and the value still round-trips', async () => {
    const tally = newTally()
    const kv = meterKV(env.KV_CACHE, tally)
    await kv.put('meter-test', 'hello')
    const got = await kv.get('meter-test')
    expect(got).toBe('hello')
    expect(tally).toMatchObject({ kvReads: 1, kvWrites: 1 })
  })
})

describe('neuron budget — against real KV', () => {
  const key = () => `neurons:daily:${utcDay()}`

  beforeEach(async () => {
    await env.KV_CACHE.delete(key())
  })

  it('deducts and persists the running total in real KV', async () => {
    await deductNeurons(env.KV_CACHE, 'LLM_PARSE')
    await deductNeurons(env.KV_CACHE, 'EMBEDDING')
    const stored = await env.KV_CACHE.get(key())
    expect(Number(stored)).toBe(NEURON_COSTS.LLM_PARSE + NEURON_COSTS.EMBEDDING)
  })

  it('blocks once the persisted total exceeds the configured cap', async () => {
    await env.KV_CACHE.put(key(), '9999')
    const cfg = buildNeuronLimitConfig({ ...testEnv(), NEURONS_DAILY_LIMIT: '10000' })
    await expect(checkNeuronBudget(env.KV_CACHE, 'LLM_PARSE', cfg))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('keeps counting while the kill switch is off, so usage stays visible', async () => {
    await env.KV_CACHE.put(key(), '999999')
    const off = buildNeuronLimitConfig({ ...testEnv(), LLM_LIMITS_ENABLED: 'false' })
    await expect(checkNeuronBudget(env.KV_CACHE, 'LLM_PARSE', off)).resolves.toBeUndefined()

    await deductNeurons(env.KV_CACHE, 'LLM_PARSE')
    expect(Number(await env.KV_CACHE.get(key()))).toBe(999999 + NEURON_COSTS.LLM_PARSE)
  })
})
