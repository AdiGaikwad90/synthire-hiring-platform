import { describe, it, expect, beforeAll } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { seedCompanyAndRecruiter, signTestToken, authHeader, makeJobData } from '../../setup/factories'
import { createJob } from '../../../src/db/queries/jobs'

/**
 * Tier B cross-cutting contract, applied to every protected router.
 *
 * This is the matrix TESTING.md §3 requires: no token, bad token, expired
 * token, wrong tenant, wrong role. It runs through SELF.fetch() so the real
 * Hono app, the real auth middleware and the real D1 are all in the path.
 *
 * Worth having because auth here is registered PER ROUTER, not globally — a new
 * router that forgets `router.use('*', authMiddleware)` is silently public.
 * The `every protected route rejects an anonymous request` case below is the
 * guard against that recurring.
 */

const PROTECTED = [
  '/api/jobs',
  '/api/candidates',
  '/api/interviews',
  '/api/interview-types',
  '/api/analytics/summary',
  '/api/settings',
] as const

let secret: string
let companyId: string
let recruiterId: string
let recruiterToken: string

beforeAll(async () => {
  secret = env.JWT_SECRET
  ;({ companyId, recruiterId } = await seedCompanyAndRecruiter(env.DB))
  recruiterToken = await signTestToken(secret, { sub: recruiterId, company_id: companyId, role: 'recruiter' })
})

describe('unauthenticated access', () => {
  for (const path of PROTECTED) {
    it(`401s an anonymous request to ${path}`, async () => {
      const res = await SELF.fetch(`https://test.local${path}`)
      expect(res.status, `${path} must not be public`).toBe(401)
    })
  }

  it('leaves genuinely public routes open', async () => {
    const res = await SELF.fetch('https://test.local/health')
    expect(res.status).toBe(200)
  })
})

describe('malformed and hostile credentials', () => {
  const bad: [string, string][] = [
    ['garbage', 'Bearer not-a-jwt'],
    ['empty bearer', 'Bearer '],
    ['missing scheme', 'abc.def.ghi'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['alg-none style forgery', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'],
  ]

  for (const [label, header] of bad) {
    it(`401s ${label}`, async () => {
      const res = await SELF.fetch('https://test.local/api/jobs', {
        headers: { Authorization: header },
      })
      expect(res.status).toBe(401)
    })
  }

  it('401s a token signed with the wrong secret', async () => {
    const forged = await signTestToken('a-completely-different-secret-32-chars-long', {
      company_id: companyId,
    })
    const res = await SELF.fetch('https://test.local/api/jobs', { headers: authHeader(forged) })
    expect(res.status).toBe(401)
  })
})

describe('authenticated happy path', () => {
  it('200s with a valid recruiter token and returns the standard envelope', async () => {
    const res = await SELF.fetch('https://test.local/api/jobs', { headers: authHeader(recruiterToken) })
    expect(res.status).toBe(200)

    const body = await res.json<{ success: boolean; data: unknown; error: unknown }>()
    expect(body.success).toBe(true)
    expect(body.error).toBeNull()
    expect(body).toHaveProperty('data')
  })
})

describe('tenant isolation', () => {
  it('does not leak another company\'s jobs', async () => {
    const mine = await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Mine' }))

    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(secret, {
      sub: other.recruiterId,
      company_id: other.companyId,
      role: 'recruiter',
    })

    const res = await SELF.fetch('https://test.local/api/jobs', { headers: authHeader(otherToken) })
    expect(res.status).toBe(200)

    const body = await res.json<{ data: { items: { id: string }[] } }>()
    const ids = (body.data.items ?? []).map((j) => j.id)
    expect(ids, 'a job leaked across tenants').not.toContain(mine.id)
  })

  it('404s a direct fetch of another company\'s job by id', async () => {
    const mine = await createJob(env.DB, makeJobData(companyId, recruiterId, { title: 'Secret' }))
    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(secret, {
      sub: other.recruiterId,
      company_id: other.companyId,
      role: 'recruiter',
    })

    const res = await SELF.fetch(`https://test.local/api/jobs/${mine.id}`, {
      headers: authHeader(otherToken),
    })
    expect([403, 404]).toContain(res.status)
  })
})

describe('role scoping', () => {
  const asInterviewer = () => signTestToken(secret, { company_id: companyId, role: 'interviewer' })

  it('403s an interviewer on a guarded analytics route', async () => {
    const res = await SELF.fetch('https://test.local/api/analytics/email-stats', {
      headers: authHeader(await asInterviewer()),
    })
    expect(res.status).toBe(403)
  })

  it('allows a recruiter the same route', async () => {
    const res = await SELF.fetch('https://test.local/api/analytics/email-stats', {
      headers: authHeader(recruiterToken),
    })
    expect(res.status).toBe(200)
  })

  /**
   * FINDING, not a passing contract: only 3 of 8 analytics routes carry the
   * interviewer guard. /funnel, /time-to-hire, /summary, /activity and
   * /sources are all reachable by an interviewer, who is documented elsewhere
   * as scoped to their own interviews — so company-wide hiring analytics are
   * currently visible to that role.
   *
   * This asserts TODAY'S behaviour so the gap is visible and measured rather
   * than forgotten. If you tighten the guard, this test SHOULD fail — flip the
   * expectation to 403 at that point and delete this comment.
   */
  it('currently does NOT scope company-wide analytics away from interviewers', async () => {
    const token = await asInterviewer()
    for (const path of ['/api/analytics/summary', '/api/analytics/funnel', '/api/analytics/activity']) {
      const res = await SELF.fetch(`https://test.local${path}`, { headers: authHeader(token) })
      expect(res.status, `${path} — update this test if the guard is added`).toBe(200)
    }
  })
})
