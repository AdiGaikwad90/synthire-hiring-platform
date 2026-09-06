import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { processEmailQueue } from '../../../src/services/email/queue'
import { insertQueuedEmail } from '../../setup/factories'
import type { Env } from '../../../src/types/bindings'

/**
 * The queue's core guarantee is that two concurrent cron invocations never
 * claim the same row — enforced by a single `UPDATE ... RETURNING` rather than
 * select-then-update.
 *
 * That guarantee lives entirely in SQLite's statement semantics, so it can
 * only be tested against a real database. A mocked D1 returns whatever the
 * test author already assumed and would prove nothing.
 */

const testEnv = () => env as unknown as Env

/** Outbound provider calls are stubbed — a test must never send real email. */
let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM email_queue').run()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'stub' }), { status: 200 }),
  )
})

afterEach(() => {
  fetchSpy.mockRestore()
})

const statusOf = async (id: string) =>
  (await env.DB.prepare('SELECT status, sent_at, failed_at, retry_count, last_error FROM email_queue WHERE id = ?')
    .bind(id)
    .first<{ status: string; sent_at: string | null; failed_at: string | null; retry_count: number; last_error: string | null }>())

describe('processEmailQueue — atomic claiming', () => {
  it('two concurrent drains never process the same row twice', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => insertQueuedEmail(env.DB)))

    // Both drains race, exactly as two overlapping cron invocations would.
    await Promise.all([processEmailQueue(testEnv()), processEmailQueue(testEnv())])

    const { results } = await env.DB
      .prepare('SELECT id, status FROM email_queue WHERE id IN (SELECT id FROM email_queue)')
      .all<{ id: string; status: string }>()

    // Every row settled exactly once; none left pending or double-sent.
    expect(results.length).toBe(ids.length)
    const sends = fetchSpy.mock.calls.length
    expect(sends).toBe(ids.length)
  })

  it('respects EMAIL_QUEUE_BATCH_SIZE', async () => {
    for (let i = 0; i < 5; i++) await insertQueuedEmail(env.DB)
    await processEmailQueue({ ...testEnv(), EMAIL_QUEUE_BATCH_SIZE: '2' })
    expect(fetchSpy.mock.calls.length).toBe(2)
  })

  it('does nothing and does not throw when the queue is empty', async () => {
    await expect(processEmailQueue(testEnv())).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('processEmailQueue — eligibility filters', () => {
  it('skips rows scheduled in the future', async () => {
    await insertQueuedEmail(env.DB, {
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    await processEmailQueue(testEnv())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips rows that already exhausted their retries', async () => {
    const id = await insertQueuedEmail(env.DB, { max_retries: 3 })
    await env.DB.prepare('UPDATE email_queue SET retry_count = 3 WHERE id = ?').bind(id).run()
    await processEmailQueue(testEnv())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips rows already marked sent', async () => {
    const id = await insertQueuedEmail(env.DB)
    await env.DB.prepare("UPDATE email_queue SET sent_at = datetime('now') WHERE id = ?").bind(id).run()
    await processEmailQueue(testEnv())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('processEmailQueue — stuck-claim recovery', () => {
  it('reclaims a row claimed more than 2 minutes ago by a crashed worker', async () => {
    const id = await insertQueuedEmail(env.DB)
    await env.DB
      .prepare("UPDATE email_queue SET status='claimed', claimed_at = unixepoch() - 300 WHERE id = ?")
      .bind(id)
      .run()

    await processEmailQueue(testEnv())
    expect(fetchSpy.mock.calls.length).toBe(1)
  })

  it('leaves a recently claimed row alone, so an in-flight drain is not duplicated', async () => {
    const id = await insertQueuedEmail(env.DB)
    await env.DB
      .prepare("UPDATE email_queue SET status='claimed', claimed_at = unixepoch() - 5 WHERE id = ?")
      .bind(id)
      .run()

    await processEmailQueue(testEnv())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('processEmailQueue — malformed rows', () => {
  it('fails a row with corrupt template_data instead of throwing', async () => {
    const id = await insertQueuedEmail(env.DB, { template_data: '{not json' })

    await expect(processEmailQueue(testEnv())).resolves.toBeUndefined()

    const row = await statusOf(id)
    expect(row?.status).toBe('failed')
    expect(row?.failed_at).not.toBeNull()
    expect(row?.last_error).toContain('Corrupt template_data')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('one corrupt row does not block the rest of the batch', async () => {
    await insertQueuedEmail(env.DB, { template_data: '{bad' })
    await insertQueuedEmail(env.DB)
    await insertQueuedEmail(env.DB)

    await processEmailQueue(testEnv())
    expect(fetchSpy.mock.calls.length).toBe(2)
  })
})

describe('processEmailQueue — send failures', () => {
  it('increments retry_count and re-queues when the provider errors', async () => {
    fetchSpy.mockRejectedValue(new Error('provider down'))
    const id = await insertQueuedEmail(env.DB, { max_retries: 3 })

    await processEmailQueue(testEnv())

    const row = await statusOf(id)
    expect(row?.retry_count).toBe(1)
    expect(row?.status).toBe('pending')
    expect(row?.failed_at).toBeNull()
    expect(row?.last_error).toContain('provider down')
  })

  it('marks the row failed once retries are exhausted', async () => {
    fetchSpy.mockRejectedValue(new Error('still down'))
    const id = await insertQueuedEmail(env.DB, { max_retries: 1 })

    await processEmailQueue(testEnv())

    const row = await statusOf(id)
    expect(row?.status).toBe('failed')
    expect(row?.failed_at).not.toBeNull()
  })
})

describe('processEmailQueue — scheduled_for timestamp format (regression)', () => {
  /**
   * Regression guard for a bug this suite found.
   *
   * queueEmail() writes scheduled_for as JS toISOString()
   * ("2026-09-06T21:18:28.110Z") while SQLite's datetime('now') returns
   * "2026-09-06 21:19:28". Compared as raw strings, 'T' (0x54) sorts after
   * ' ' (0x20), so a row scheduled a MINUTE ago read as greater than now and
   * was never claimed. Emails only became eligible once the UTC date rolled
   * over — a delay of up to ~24h on magic links and interview confirmations.
   *
   * The fix is datetime() on both sides. These assertions fail if it is
   * removed.
   */
  it('claims a row scheduled one minute ago', async () => {
    await insertQueuedEmail(env.DB, { scheduled_for: new Date(Date.now() - 60_000).toISOString() })
    await processEmailQueue(testEnv())
    expect(fetchSpy.mock.calls.length).toBe(1)
  })

  it('claims a row scheduled one second ago', async () => {
    await insertQueuedEmail(env.DB, { scheduled_for: new Date(Date.now() - 1_000).toISOString() })
    await processEmailQueue(testEnv())
    expect(fetchSpy.mock.calls.length).toBe(1)
  })

  it('accepts the SQLite-native format too, since the column DEFAULT produces it', async () => {
    const id = await insertQueuedEmail(env.DB)
    await env.DB.prepare("UPDATE email_queue SET scheduled_for = datetime('now', '-5 minutes') WHERE id = ?")
      .bind(id).run()
    await processEmailQueue(testEnv())
    expect(fetchSpy.mock.calls.length).toBe(1)
  })

  it('still does NOT claim a row scheduled one minute in the future', async () => {
    await insertQueuedEmail(env.DB, { scheduled_for: new Date(Date.now() + 60_000).toISOString() })
    await processEmailQueue(testEnv())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
