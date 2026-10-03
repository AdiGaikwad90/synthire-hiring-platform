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
