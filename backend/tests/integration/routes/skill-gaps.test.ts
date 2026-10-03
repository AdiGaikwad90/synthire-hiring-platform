import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
import { replaceSkillMatches } from '../../../src/db/queries/skill-matches'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate, signTestToken, authHeader } from '../../setup/factories'

let companyId: string
let recruiterId: string
let jobId: string

beforeEach(async () => {
  ;({ companyId, recruiterId } = await seedCompanyAndRecruiter(env.DB))
  jobId = (await createJob(env.DB, makeJobData(companyId, recruiterId, { required_skills: ['Go'] }))).id
})

const token = (over: Parameters<typeof signTestToken>[1] = {}) =>
  signTestToken(env.JWT_SECRET, { sub: recruiterId, company_id: companyId, role: 'recruiter', ...over })
const get = async (id: string, t?: string) =>
  SELF.fetch(`https://test.local/api/jobs/${id}/skill-gaps`, { headers: t ? authHeader(t) : {} })

describe('GET /api/jobs/:id/skill-gaps', () => {
  it('200s with per-skill counts and the explicit denominator', async () => {
    const c1 = await insertCandidate(env.DB, companyId, jobId)
    const c2 = await insertCandidate(env.DB, companyId, jobId)
    await replaceSkillMatches(env.DB, { candidateId: c1, jobId, companyId }, [{ skill: 'Go', requirement: 'required', verdict: 'missing', evidence: null, via: null }])
    await replaceSkillMatches(env.DB, { candidateId: c2, jobId, companyId }, [{ skill: 'Go', requirement: 'required', verdict: 'evidenced', evidence: null, via: null }])

    const res = await get(jobId, await token())
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; data: unknown }
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      scoredCandidates: 2,
      skills: [{ skill: 'Go', requirement: 'required', evidenced: 1, claimed: 0, transferable: 0, missing: 1, scored: 2 }],
    })
  })

  it('lets an admin through', async () => {
    expect((await get(jobId, await token({ role: 'admin' }))).status).toBe(200)
  })

  it('returns zero counts for a job with no scored candidates', async () => {
    const body = await (await get(jobId, await token())).json() as { data: unknown }
    expect(body.data).toEqual({ scoredCandidates: 0, skills: [] })
  })

  it('401s without a token', async () => {
    expect((await get(jobId)).status).toBe(401)
  })

  it('403s an interviewer', async () => {
    expect((await get(jobId, await token({ role: 'interviewer' }))).status).toBe(403)
  })

  it('404s a job belonging to another company', async () => {
    const other = await seedCompanyAndRecruiter(env.DB)
    const t = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId })
    expect((await get(jobId, t)).status).toBe(404)
  })

  it('404s an unknown job id', async () => {
    expect((await get('job_does_not_exist', await token())).status).toBe(404)
  })
})
