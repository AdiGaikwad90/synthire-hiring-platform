import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { createJob } from '../../../src/db/queries/jobs'
import { replaceSkillMatches, listSkillMatches, getJobSkillGaps } from '../../../src/db/queries/skill-matches'
import type { SkillMatch, Verdict } from '../../../src/services/scoring/skill-matches'
import { seedCompanyAndRecruiter, makeJobData, insertCandidate } from '../../setup/factories'

/**
 * Real local D1, not a mock: the behaviours under test — the NOCASE unique
 * index, CHECK constraints, batch atomicity, FK cascade — are SQLite semantics
 * a mock would simply assume.
 */

const m = (skill: string, verdict: Verdict, over: Partial<SkillMatch> = {}): SkillMatch => ({
  skill, requirement: 'required', verdict, evidence: null, via: null, ...over,
})

let companyId: string
let recruiterId: string
let jobId: string
let candidateId: string

beforeEach(async () => {
  ;({ companyId, recruiterId } = await seedCompanyAndRecruiter(env.DB))
  jobId = (await createJob(env.DB, makeJobData(companyId, recruiterId))).id
  candidateId = await insertCandidate(env.DB, companyId, jobId)
})

const owner = () => ({ candidateId, jobId, companyId })

describe('replaceSkillMatches / listSkillMatches — happy path', () => {
  it('round-trips verdict, evidence and via', async () => {
    await replaceSkillMatches(env.DB, owner(), [
      m('Kubernetes', 'evidenced', { evidence: 'Ran EKS at Acme' }),
      m('TypeScript', 'transferable', { evidence: 'JS for 6 years', via: 'JavaScript' }),
      m('Rust', 'missing', { requirement: 'nice_to_have' }),
    ])
    expect(await listSkillMatches(env.DB, candidateId, companyId)).toEqual([
      m('Kubernetes', 'evidenced', { evidence: 'Ran EKS at Acme' }),
      m('TypeScript', 'transferable', { evidence: 'JS for 6 years', via: 'JavaScript' }),
      m('Rust', 'missing', { requirement: 'nice_to_have' }),
    ])
  })
})

describe('replaceSkillMatches — positive variants', () => {
  it('replaces rather than duplicates on re-score', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'claimed'), m('SQL', 'claimed'), m('Rust', 'missing')])
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced'), m('SQL', 'evidenced')])
    const rows = await listSkillMatches(env.DB, candidateId, companyId)
    expect(rows.map((r) => [r.skill, r.verdict])).toEqual([['Go', 'evidenced'], ['SQL', 'evidenced']])
  })

  it('lists required before nice-to-have regardless of insert order', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Rust', 'missing', { requirement: 'nice_to_have' }), m('Go', 'evidenced')])
    expect((await listSkillMatches(env.DB, candidateId, companyId)).map((r) => r.skill)).toEqual(['Go', 'Rust'])
  })
})

describe('replaceSkillMatches — boundaries', () => {
  it('rolls the whole batch back when one insert fails, keeping the previous rows', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced')])
    // "Go" and "go" collide on the NOCASE unique index.
    await expect(replaceSkillMatches(env.DB, owner(), [m('Go', 'missing'), m('go', 'missing')])).rejects.toThrow()
    expect(await listSkillMatches(env.DB, candidateId, companyId)).toEqual([m('Go', 'evidenced')])
  })

  it('removes rows when the candidate is deleted', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced')])
    await env.DB.prepare('DELETE FROM candidates WHERE id = ?').bind(candidateId).run()
    const { results } = await env.DB.prepare('SELECT id FROM candidate_skill_matches WHERE candidate_id = ?').bind(candidateId).all()
    expect(results).toHaveLength(0)
  })
})

describe('replaceSkillMatches — invalid input', () => {
  it('rejects a verdict outside the CHECK list and writes nothing', async () => {
    await expect(
      replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced'), m('SQL', 'great' as Verdict)]),
    ).rejects.toThrow(/CHECK/)
    expect(await listSkillMatches(env.DB, candidateId, companyId)).toEqual([])
  })
})

describe('replaceSkillMatches — empty', () => {
  it('clears stale rows when a re-score produced no verdicts', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced')])
    await replaceSkillMatches(env.DB, owner(), [])
    expect(await listSkillMatches(env.DB, candidateId, companyId)).toEqual([])
  })
})

describe('listSkillMatches — tenant scoping', () => {
  it('returns nothing to another company', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced')])
    const other = await seedCompanyAndRecruiter(env.DB)
    expect(await listSkillMatches(env.DB, candidateId, other.companyId)).toEqual([])
  })
})

describe('getJobSkillGaps', () => {
  it('counts verdicts per skill across scored candidates, worst gaps first', async () => {
    const c2 = await insertCandidate(env.DB, companyId, jobId)
    const c3 = await insertCandidate(env.DB, companyId, jobId)
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'evidenced'), m('K8s', 'missing')])
    await replaceSkillMatches(env.DB, { candidateId: c2, jobId, companyId }, [m('Go', 'claimed'), m('K8s', 'missing')])
    await replaceSkillMatches(env.DB, { candidateId: c3, jobId, companyId }, [m('Go', 'transferable', { via: 'Rust' }), m('K8s', 'evidenced')])
    await insertCandidate(env.DB, companyId, jobId) // never adjudicated — must not dilute the denominator

    expect(await getJobSkillGaps(env.DB, jobId, companyId)).toEqual({
      scoredCandidates: 3,
      skills: [
        { skill: 'K8s', requirement: 'required', evidenced: 1, claimed: 0, transferable: 0, missing: 2, scored: 3 },
        { skill: 'Go', requirement: 'required', evidenced: 1, claimed: 1, transferable: 1, missing: 0, scored: 3 },
      ],
    })
  })

  it('ignores other jobs and other companies', async () => {
    await replaceSkillMatches(env.DB, owner(), [m('Go', 'missing')])
    const other = await seedCompanyAndRecruiter(env.DB)
    expect(await getJobSkillGaps(env.DB, jobId, other.companyId)).toEqual({ scoredCandidates: 0, skills: [] })

    const otherJob = (await createJob(env.DB, makeJobData(companyId, recruiterId))).id
    expect(await getJobSkillGaps(env.DB, otherJob, companyId)).toEqual({ scoredCandidates: 0, skills: [] })
  })

  it('returns zeroes for a job nobody has been scored against', async () => {
    expect(await getJobSkillGaps(env.DB, jobId, companyId)).toEqual({ scoredCandidates: 0, skills: [] })
  })
})
