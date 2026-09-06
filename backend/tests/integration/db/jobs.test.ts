import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { toJob, createJob, getJob, listJobs } from '../../../src/db/queries/jobs'
import { DEFAULT_SCORING_DIMENSIONS } from '../../../src/services/scoring/dimensions'
import type { JobRow } from '../../../src/types/db'
import { seedCompanyAndRecruiter, insertRawJob, makeJobData } from '../../setup/factories'

/**
 * The repo's documented gotcha #1: every JSON column in D1 is TEXT, and
 * `JSON.parse` on it must never throw.
 *
 * These run against real local SQLite rather than a mocked D1 on purpose — the
 * bug class here is "the database handed back a string shaped differently than
 * the code assumed", which a mock cannot reproduce because the mock returns
 * whatever the test author already believed.
 */

let companyId: string
let recruiterId: string

beforeEach(async () => {
  ;({ companyId, recruiterId } = await seedCompanyAndRecruiter(env.DB))
})

describe('createJob / getJob round trip', () => {
  it('stores and returns skills as real arrays', async () => {
    const created = await createJob(env.DB, makeJobData(companyId, recruiterId, {
      title: 'Staff Engineer',
      required_skills: ['TypeScript', 'Cloudflare'],
      nice_to_have_skills: ['Rust'],
    }))

    expect(created.required_skills).toEqual(['TypeScript', 'Cloudflare'])

    const fetched = await getJob(env.DB, created.id, companyId)
    expect(fetched?.required_skills).toEqual(['TypeScript', 'Cloudflare'])
    expect(fetched?.nice_to_have_skills).toEqual(['Rust'])
  })

  it('never exposes the legacy scoring_weights string, only parsed dimensions', async () => {
    const created = await createJob(env.DB, makeJobData(companyId, recruiterId))
    expect('scoring_weights' in created).toBe(false)
    expect(created.scoring_dimensions.skills.importance).toBeTypeOf('number')
  })

  it('scopes reads by company — another tenant cannot read the row', async () => {
    const created = await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Secret Role' }))
    expect(await getJob(env.DB, created.id, 'some-other-company')).toBeNull()
  })
})

describe('toJob — malformed JSON in TEXT columns', () => {
  // Written directly with raw SQL so the row is genuinely malformed on disk,
  // the way a bad migration or a hand-edited row would leave it.
  const cases: [string, string][] = [
    ['not json at all', 'garbage'],
    ['truncated array', '["React"'],
    ['empty string', ''],
    ['null literal', 'null'],
    ['an object where an array is expected', '{"a":1}'],
    ['a bare number', '42'],
  ]

  for (const [label, bad] of cases) {
    it(`falls back to [] for required_skills when the column holds ${label}`, async () => {
      const id = await insertRawJob(env.DB, companyId, recruiterId, { required_skills: bad })
      const job = await getJob(env.DB, id, companyId)
      expect(job).not.toBeNull()
      expect(job?.required_skills).toEqual([])
    })
  }

  it('falls back to default scoring dimensions when scoring_weights is malformed', async () => {
    const id = await insertRawJob(env.DB, companyId, recruiterId, { scoring_weights: '{oops' })
    const job = await getJob(env.DB, id, companyId)
    expect(job?.scoring_dimensions).toEqual(DEFAULT_SCORING_DIMENSIONS)
  })

  it('upgrades a legacy v1 sum-to-100 scoring_weights row', async () => {
    const id = await insertRawJob(env.DB, companyId, recruiterId, {
      scoring_weights: '{"skills":40,"experience":30,"education":20,"achievements":10}',
    })
    const job = await getJob(env.DB, id, companyId)
    expect(job?.scoring_dimensions.skills.importance).toBe(40)
    expect(job?.scoring_dimensions.achievements.importance).toBe(10)
  })

  it('does not throw when EVERY json column is malformed at once', async () => {
    const id = await insertRawJob(env.DB, companyId, recruiterId, {
      required_skills: '{{{',
      nice_to_have_skills: 'undefined',
      scoring_weights: '<html>',
    })
    const job = await getJob(env.DB, id, companyId)
    expect(job?.required_skills).toEqual([])
    expect(job?.nice_to_have_skills).toEqual([])
    expect(job?.scoring_dimensions).toEqual(DEFAULT_SCORING_DIMENSIONS)
  })

  it('survives a malformed row inside a list query', async () => {
    await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Good' }))
    await insertRawJob(env.DB, companyId, recruiterId, { required_skills: 'broken' })

    const page = await listJobs(env.DB, companyId, { page: 1, limit: 20 })
    expect(page.items.length).toBe(2)
    for (const j of page.items) expect(Array.isArray(j.required_skills)).toBe(true)
  })
})

describe('toJob — called directly', () => {
  it('is a pure transform that tolerates any string in the JSON columns', () => {
    const row = {
      id: 'j1',
      company_id: 'c1',
      scoring_weights: 'nope',
      required_skills: 'nope',
      nice_to_have_skills: 'nope',
    } as unknown as JobRow
    expect(() => toJob(row)).not.toThrow()
    expect(toJob(row).required_skills).toEqual([])
  })
})
