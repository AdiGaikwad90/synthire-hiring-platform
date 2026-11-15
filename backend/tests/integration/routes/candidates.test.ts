import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
import { updateCandidateScores } from '../../../src/db/queries/candidates'
import { replaceSkillMatches } from '../../../src/db/queries/skill-matches'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate, signTestToken, authHeader } from '../../setup/factories'

let companyId: string
let jobId: string
let candidateId: string
let token: string

const ATTRIBUTION = {
  version: 1,
  contributions: { skills: 20.5, experience: 15.25, education: 8, achievements: 9.75, semantic: 18 },
  importances: { skills: 80, experience: 70, education: 50, achievements: 60 },
  llmWeight: 0.7, semanticWeight: 0.3,
  subDimensions: { skills: { technical: 80 }, experience: {}, education: {}, achievements: {} },
}

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  jobId = (await createJob(env.DB, makeJobData(companyId, s.recruiterId, { required_skills: ['Go'] }))).id
  candidateId = await insertCandidate(env.DB, companyId, jobId)
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: companyId, role: 'recruiter' })
})

const get = (id: string, t = token) => SELF.fetch(`https://test.local/api/candidates/${id}`, { headers: authHeader(t) })

describe('GET /api/candidates/:id — skill matches and attribution', () => {
  it('returns skill_matches and the parsed score_attribution snapshot', async () => {
    await updateCandidateScores(env.DB, candidateId, {
      overall_score: 72, semantic_score: 60, skills_score: 80, experience_score: 70,
      education_score: 50, achievements_score: 60, ai_analysis: '{"summary":"x"}',
      score_attribution: JSON.stringify(ATTRIBUTION), skill_matches: [],
    }, 'workers-ai')
    await replaceSkillMatches(env.DB, { candidateId, jobId, companyId }, [
      { skill: 'Go', requirement: 'required', verdict: 'evidenced', evidence: 'Wrote Go services', via: null },
    ])

    const res = await get(candidateId)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { skill_matches: unknown[]; score_attribution: unknown } }
    expect(body.data.skill_matches).toEqual([
      { skill: 'Go', requirement: 'required', verdict: 'evidenced', evidence: 'Wrote Go services', via: null },
    ])
    expect(body.data.score_attribution).toEqual(ATTRIBUTION)
  })

  it('keeps the stored snapshot when the job\'s weights are edited after scoring', async () => {
    await updateCandidateScores(env.DB, candidateId, {
      overall_score: 72, semantic_score: 60, skills_score: 80, experience_score: 70,
      education_score: 50, achievements_score: 60, ai_analysis: '{}',
      score_attribution: JSON.stringify(ATTRIBUTION), skill_matches: [],
    }, 'workers-ai')
    await env.DB.prepare('UPDATE jobs SET scoring_weights = ? WHERE id = ?')
      .bind(JSON.stringify({ skills: { importance: 0, sub_dimensions: {} } }), jobId).run()

    const body = await (await get(candidateId)).json() as { data: { score_attribution: typeof ATTRIBUTION } }
    expect(body.data.score_attribution.importances.skills).toBe(80)
  })

  it('returns empty skill_matches and null attribution for a candidate scored before this shipped', async () => {
    const body = await (await get(candidateId)).json() as { data: { skill_matches: unknown[]; score_attribution: unknown } }
    expect(body.data.skill_matches).toEqual([])
    expect(body.data.score_attribution).toBeNull()
  })

  it('returns null attribution, not a 500, when the stored JSON is corrupt', async () => {
    await env.DB.prepare('UPDATE candidates SET score_attribution = ? WHERE id = ?').bind('{not json', candidateId).run()
    const res = await get(candidateId)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { score_attribution: unknown } }).data.score_attribution).toBeNull()
  })

  it('404s for another company and leaks no skill rows', async () => {
    await replaceSkillMatches(env.DB, { candidateId, jobId, companyId }, [
      { skill: 'Go', requirement: 'required', verdict: 'evidenced', evidence: null, via: null },
    ])
    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId })
    expect((await get(candidateId, otherToken)).status).toBe(404)
  })
})

/**
 * SYN-006. The Candidates page offered "Applied" (`applied`) and
 * "Interviewing" (`interviewing`) as stage filters. Neither is a stage the
 * app stores, and the list endpoint accepted ANY string for `status`, so the
 * filter came back empty without a word — 0 cards while 14 candidates sat in
 * `new`. The endpoint now only accepts real stages.
 */
describe('GET /api/candidates?status= — stage filter', () => {
  const STAGES = ['new', 'shortlisted', 'scheduled', 'inprogress', 'feedback', 'hired', 'rejected'] as const
  type Item = { id: string; status: string }

  const list = (query: string, t: string | null = token) =>
    SELF.fetch(`https://test.local/api/candidates${query}`, { headers: t ? authHeader(t) : {} })
  const items = async (res: Response) => ((await res.json()) as { data: { items: Item[] } }).data.items
  const setStage = (id: string, status: string) =>
    env.DB.prepare('UPDATE candidates SET status = ? WHERE id = ?').bind(status, id).run()

  /** One candidate per stage, on top of the `new` one from beforeEach. */
  async function seedOnePerStage() {
    const byStage: Record<string, string> = {}
    for (const stage of STAGES) {
      byStage[stage] = await insertCandidate(env.DB, companyId, jobId, `In ${stage}`)
      await setStage(byStage[stage], stage)
    }
    return byStage
  }

  it('happy path: returns exactly the candidates in the requested stage', async () => {
    const byStage = await seedOnePerStage()
    const res = await list('?status=shortlisted')
    expect(res.status).toBe(200)
    expect((await items(res)).map((c) => c.id)).toEqual([byStage.shortlisted])
  })

  it('positive variants: every real stage is accepted and filters to itself', async () => {
    const byStage = await seedOnePerStage()
    for (const stage of STAGES) {
      const res = await list(`?status=${stage}`)
      expect(res.status, stage).toBe(200)
      const got = await items(res)
      expect(got.every((c) => c.status === stage), `${stage} must only return ${stage}`).toBe(true)
      expect(got.map((c) => c.id), stage).toContain(byStage[stage])
    }
  })

  it('positive variants: no status returns every stage', async () => {
    await seedOnePerStage()
    const got = await items(await list('?limit=50'))
    expect(new Set(got.map((c) => c.status))).toEqual(new Set(STAGES))
    expect(got).toHaveLength(STAGES.length + 1)
  })

  it('empty: a real stage nobody is in returns an empty list, not an error', async () => {
    const res = await list('?status=hired')
    expect(res.status).toBe(200)
    expect(await items(res)).toEqual([])
  })

  it('invalid input: a stage that does not exist is refused with field detail', async () => {
    // Includes the two the UI used to send, a wrong-case value and a hostile one.
    for (const bad of ['applied', 'interviewing', 'New', 'shortlisted ', "new' OR '1'='1", '']) {
      const res = await list(`?status=${encodeURIComponent(bad)}`)
      expect(res.status, `"${bad}" must be refused`).toBe(422)
      const body = (await res.json()) as { success: boolean; details: { fieldErrors: Record<string, string[]> } }
      expect(body.success).toBe(false)
      expect(body.details.fieldErrors.status?.[0], `"${bad}"`).toBeTruthy()
    }
  })

  it('error contract: 401 without a token, and another company sees none of these candidates', async () => {
    await seedOnePerStage()
    expect((await list('?status=new', null)).status).toBe(401)

    const other = await seedCompanyAndRecruiter(env.DB)
    const otherToken = await signTestToken(env.JWT_SECRET, { sub: other.recruiterId, company_id: other.companyId, role: 'recruiter' })
    const res = await list('?status=new', otherToken)
    expect(res.status).toBe(200)
    expect(await items(res)).toEqual([])
  })
})
