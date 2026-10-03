import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { SkillMatch, Requirement, Verdict } from '../../services/scoring/skill-matches'

export interface SkillMatchOwner {
  candidateId: string
  jobId: string
  companyId: string
}

interface SkillMatchRow {
  skill: string
  requirement: Requirement
  verdict: Verdict
  evidence: string | null
  via_skill: string | null
}

/**
 * Delete-then-insert in ONE batch. D1 runs a batch as a transaction, so a
 * failed insert rolls the delete back and the previous verdicts survive. An
 * empty `matches` clears the candidate's rows — stale verdicts must not sit
 * next to a fresh score.
 */
export async function replaceSkillMatches(
  db: D1Database,
  owner: SkillMatchOwner,
  matches: readonly SkillMatch[],
): Promise<void> {
  const insert = db.prepare(
    `INSERT INTO candidate_skill_matches
       (id, candidate_id, job_id, company_id, skill, requirement, verdict, evidence, via_skill)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  await db.batch([
    db.prepare('DELETE FROM candidate_skill_matches WHERE candidate_id = ? AND company_id = ?')
      .bind(owner.candidateId, owner.companyId),
    ...matches.map((m) =>
      insert.bind(nanoid(), owner.candidateId, owner.jobId, owner.companyId, m.skill, m.requirement, m.verdict, m.evidence, m.via),
    ),
  ])
}

export async function listSkillMatches(db: D1Database, candidateId: string, companyId: string): Promise<SkillMatch[]> {
  const { results } = await db
    .prepare(
      `SELECT skill, requirement, verdict, evidence, via_skill
         FROM candidate_skill_matches
        WHERE candidate_id = ? AND company_id = ?
        ORDER BY CASE requirement WHEN 'required' THEN 0 ELSE 1 END, rowid`,
    )
    .bind(candidateId, companyId)
    .all<SkillMatchRow>()
  return results.map((r) => ({
    skill: r.skill,
    requirement: r.requirement,
    verdict: r.verdict,
    evidence: r.evidence,
    via: r.via_skill,
  }))
}

export interface SkillGap {
  skill: string
  requirement: Requirement
  evidenced: number
  claimed: number
  transferable: number
  missing: number
  /** Candidates with a verdict for THIS skill — can be < scoredCandidates if the job's skills changed. */
  scored: number
}

export interface JobSkillGaps {
  /** Denominator: candidates with any skill-match row for this job. Never-adjudicated applicants are excluded. */
  scoredCandidates: number
  skills: SkillGap[]
}

export async function getJobSkillGaps(db: D1Database, jobId: string, companyId: string): Promise<JobSkillGaps> {
  const [skills, total] = await Promise.all([
    db
      .prepare(
        `SELECT MIN(skill) AS skill, requirement,
                SUM(verdict = 'evidenced')    AS evidenced,
                SUM(verdict = 'claimed')      AS claimed,
                SUM(verdict = 'transferable') AS transferable,
                SUM(verdict = 'missing')      AS missing,
                COUNT(*)                      AS scored
           FROM candidate_skill_matches
          WHERE job_id = ? AND company_id = ?
          GROUP BY skill COLLATE NOCASE, requirement
          ORDER BY CASE requirement WHEN 'required' THEN 0 ELSE 1 END, missing DESC, skill COLLATE NOCASE`,
      )
      .bind(jobId, companyId)
      .all<SkillGap>(),
    db
      .prepare('SELECT COUNT(DISTINCT candidate_id) AS n FROM candidate_skill_matches WHERE job_id = ? AND company_id = ?')
      .bind(jobId, companyId)
      .first<{ n: number }>(),
  ])
  return { scoredCandidates: total?.n ?? 0, skills: skills.results }
}
