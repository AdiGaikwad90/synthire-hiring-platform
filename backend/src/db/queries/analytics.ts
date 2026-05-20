import type { D1Database } from '@cloudflare/workers-types'

// Funnel: candidate counts per status for a company
export async function getFunnelData(
  db: D1Database,
  companyId: string
): Promise<{ status: string; count: number }[]> {
  const result = await db
    .prepare(
      'SELECT status, COUNT(*) as count FROM candidates WHERE company_id=? GROUP BY status ORDER BY count DESC'
    )
    .bind(companyId)
    .all<{ status: string; count: number }>()

  return result.results
}

// Average days from candidate created_at to updated_at for hired candidates, grouped by month
export async function getTimeToHireData(
  db: D1Database,
  companyId: string
): Promise<{ month: string; avg_days: number; count: number }[]> {
  const result = await db
    .prepare(
      `SELECT strftime('%Y-%m', updated_at) as month,
              ROUND(AVG(CAST(julianday(updated_at) - julianday(created_at) AS REAL)), 1) as avg_days,
              COUNT(*) as count
       FROM candidates
       WHERE company_id=? AND status='hired'
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`
    )
    .bind(companyId)
    .all<{ month: string; avg_days: number; count: number }>()

  return result.results
}

// Summary stats for the dashboard
export async function getAnalyticsSummary(
  db: D1Database,
  companyId: string
): Promise<{
  total_candidates: number
  total_interviews: number
  total_hired: number
  avg_score: number
  avg_time_to_hire_days: number
  active_jobs: number
}> {
  const [
    candidatesResult,
    interviewsResult,
    hiredResult,
    avgScoreResult,
    avgTimeToHireResult,
    activeJobsResult,
  ] = await db.batch([
    db.prepare('SELECT COUNT(*) as count FROM candidates WHERE company_id=?').bind(companyId),
    db.prepare('SELECT COUNT(*) as count FROM interviews WHERE company_id=?').bind(companyId),
    db
      .prepare("SELECT COUNT(*) as count FROM candidates WHERE company_id=? AND status='hired'")
      .bind(companyId),
    db
      .prepare(
        'SELECT ROUND(AVG(overall_score), 1) as avg_score FROM candidates WHERE company_id=? AND overall_score IS NOT NULL'
      )
      .bind(companyId),
    db
      .prepare(
        `SELECT ROUND(AVG(CAST(julianday(updated_at) - julianday(created_at) AS REAL)), 1) as avg_days
         FROM candidates
         WHERE company_id=? AND status='hired'`
      )
      .bind(companyId),
    db
      .prepare("SELECT COUNT(*) as count FROM jobs WHERE company_id=? AND status='active'")
      .bind(companyId),
  ])

  const candidates = candidatesResult.results[0] as { count: number } | undefined
  const interviews = interviewsResult.results[0] as { count: number } | undefined
  const hired = hiredResult.results[0] as { count: number } | undefined
  const avgScore = avgScoreResult.results[0] as { avg_score: number | null } | undefined
  const avgTimeToHire = avgTimeToHireResult.results[0] as { avg_days: number | null } | undefined
  const activeJobs = activeJobsResult.results[0] as { count: number } | undefined

  return {
    total_candidates: candidates?.count ?? 0,
    total_interviews: interviews?.count ?? 0,
    total_hired: hired?.count ?? 0,
    avg_score: avgScore?.avg_score ?? 0,
    avg_time_to_hire_days: avgTimeToHire?.avg_days ?? 0,
    active_jobs: activeJobs?.count ?? 0,
  }
}

// Recent activity: last 20 candidate stage changes (most recent first)
export async function getRecentActivity(
  db: D1Database,
  companyId: string
): Promise<
  {
    candidateId: string
    candidateName: string
    status: string
    jobTitle: string
    updatedAt: string
  }[]
> {
  const result = await db
    .prepare(
      `SELECT c.id as candidateId, c.name as candidateName, c.status, j.title as jobTitle, c.updated_at as updatedAt
       FROM candidates c
       JOIN jobs j ON c.job_id = j.id
       WHERE c.company_id=?
       ORDER BY c.updated_at DESC
       LIMIT 20`
    )
    .bind(companyId)
    .all<{
      candidateId: string
      candidateName: string
      status: string
      jobTitle: string
      updatedAt: string
    }>()

  return result.results
}

// Email delivery stats
export async function getEmailStats(
  db: D1Database,
  companyId: string
): Promise<{ total: number; sent: number; delivered: number; bounced: number; failed: number }> {
  const result = await db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status IN ('sent','delivered') THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
         SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
       FROM email_logs
       WHERE company_id=?`
    )
    .bind(companyId)
    .first<{
      total: number
      sent: number
      delivered: number
      bounced: number
      failed: number
    }>()

  return {
    total: result?.total ?? 0,
    sent: result?.sent ?? 0,
    delivered: result?.delivered ?? 0,
    bounced: result?.bounced ?? 0,
    failed: result?.failed ?? 0,
  }
}
