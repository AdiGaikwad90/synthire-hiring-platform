import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
import { failStaleProcessing, STALE_PROCESSING_MESSAGE } from '../../../src/db/queries/candidates'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate } from '../../setup/factories'

/**
 * Regression from the live-app pass: a background pipeline killed mid-parse
 * (here, the machine slept; in production waitUntil can be cut off) left the
 * candidate in 'parsing' for ever, so the page said "Scoring in progress"
 * indefinitely. The cron now fails such rows with an honest message.
 *
 * Timestamps are ISO strings (toISOString), compared against an ISO cutoff —
 * NOT datetime('now'), whose ' ' separator never matches the 'T' format (see
 * the scheduled_for regression in the email queue tests).
 */

let companyId: string
let jobId: string

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  jobId = (await createJob(env.DB, makeJobData(companyId, s.recruiterId))).id
})

async function candidateWith(status: string, updatedAt: string): Promise<string> {
  const id = await insertCandidate(env.DB, companyId, jobId)
  await env.DB.prepare('UPDATE candidates SET processing_status = ?, updated_at = ? WHERE id = ?').bind(status, updatedAt, id).run()
  return id
}
const statusOf = async (id: string) =>
  env.DB.prepare('SELECT processing_status, processing_error FROM candidates WHERE id = ?').bind(id).first<{ processing_status: string; processing_error: string | null }>()

const CUTOFF = '2026-10-04T12:00:00.000Z'
const BEFORE = '2026-10-04T11:49:59.000Z'
const AFTER = '2026-10-04T12:00:01.000Z'

describe('failStaleProcessing', () => {
  it.each(['parsing', 'scoring', 'pending'])('fails a %s row last touched before the cutoff', async (status) => {
    const id = await candidateWith(status, BEFORE)
    await failStaleProcessing(env.DB, CUTOFF)
    expect(await statusOf(id)).toEqual({ processing_status: 'error', processing_error: STALE_PROCESSING_MESSAGE })
  })

  it('leaves rows that are still within the window', async () => {
    const id = await candidateWith('parsing', AFTER)
    await failStaleProcessing(env.DB, CUTOFF)
    expect((await statusOf(id))?.processing_status).toBe('parsing')
  })

  it.each(['complete', 'error'])('never touches a %s row however old', async (status) => {
    const id = await candidateWith(status, BEFORE)
    await failStaleProcessing(env.DB, CUTOFF)
    expect((await statusOf(id))?.processing_status).toBe(status)
  })

  it('returns how many rows it failed', async () => {
    await candidateWith('parsing', BEFORE)
    await candidateWith('scoring', BEFORE)
    await candidateWith('parsing', AFTER)
    expect(await failStaleProcessing(env.DB, CUTOFF)).toBeGreaterThanOrEqual(2)
  })
})
