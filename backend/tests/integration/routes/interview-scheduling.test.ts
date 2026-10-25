import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../../../src/index'
import { createJob } from '../../../src/db/queries/jobs'
import { renderTemplate } from '../../../src/services/email/templates'
import type { Env } from '../../../src/types/bindings'
import type { EmailType, TemplateData } from '../../../src/types/email'
import { seedCompanyAndRecruiter, makeJobData, signTestToken, authHeader, insertCandidate } from '../../setup/factories'

/**
 * SYN-002 / SYN-027 — scheduling stores the zone the recruiter picked, emails
 * render in it, and the API refuses a time that has already passed.
 *
 * Before: the client sent the browser-local wall time as the instant and the
 * picked zone was dropped, so "2 PM Pacific" from an IST browser was saved as
 * 2 PM IST and every email showed UTC.
 */

let token: string
let companyId: string
let jobId: string
let candidateId: string
let candidateEmail: string
let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  jobId = (await createJob(env.DB, makeJobData(s.companyId, s.recruiterId, { title: 'Data Engineer' }))).id
  candidateId = await insertCandidate(env.DB, s.companyId, jobId, 'Dana Cho')
  // Unique per test: the email queue is not reset between tests in this file.
  candidateEmail = `${candidateId}@example.com`
  await env.DB.prepare('UPDATE candidates SET email = ? WHERE id = ?').bind(candidateEmail, candidateId).run()
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: s.companyId, role: 'recruiter' })
  // The route drains the email queue in waitUntil — a test must never send real email.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'stub' }), { status: 200 }))
})

afterEach(() => fetchSpy.mockRestore())

async function schedule(body: Record<string, unknown>) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(
    new Request('https://test.local/api/interviews', {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId, job_id: jobId, ...body }),
    }),
    env as unknown as Env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return res
}

const interviewCount = async () =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM interviews WHERE company_id = ?').bind(companyId).first<{ n: number }>())!.n
const queuedFor = (email: string) =>
  env.DB.prepare('SELECT email_type, template_data FROM email_queue WHERE recipient_email = ? ORDER BY created_at').bind(email)
    .all<{ email_type: EmailType; template_data: string }>().then((r) => r.results)

// 21:00 UTC = 2:00 PM Pacific Daylight Time on this date.
const FUTURE = '2030-06-12T21:00:00.000Z'

describe('POST /api/interviews — happy path', () => {
  it('stores the picked zone with the exact instant', async () => {
    const res = await schedule({ scheduled_at: FUTURE, timezone: 'America/Los_Angeles' })
    expect(res.status).toBe(201)
    const row = await env.DB.prepare('SELECT scheduled_at, timezone FROM interviews WHERE company_id = ?').bind(companyId)
      .first<{ scheduled_at: string; timezone: string | null }>()
    expect(row).toEqual({ scheduled_at: FUTURE, timezone: 'America/Los_Angeles' })
  })

  it('renders the candidate emails in the picked zone, not UTC', async () => {
    await schedule({ scheduled_at: FUTURE, timezone: 'America/Los_Angeles' })
    const emails = await queuedFor(candidateEmail)
    expect(emails.map((e) => e.email_type).sort()).toEqual(['interview_reminder', 'interview_scheduled'])
    for (const e of emails) {
      const data = JSON.parse(e.template_data) as TemplateData & { timeZone?: string }
      expect(data.timeZone, e.email_type).toBe('America/Los_Angeles')
      const { html } = renderTemplate(e.email_type, data)
      expect(html, e.email_type).toContain('Wednesday, June 12, 2030 at 2:00 PM PDT')
      expect(html, e.email_type).not.toContain('UTC')
    }
  })
})

describe('POST /api/interviews — positive variants', () => {
  it('accepts a request without a zone (older clients) and renders it in UTC, labelled', async () => {
    const res = await schedule({ scheduled_at: FUTURE })
    expect(res.status).toBe(201)
    const [scheduled] = (await queuedFor(candidateEmail)).filter((e) => e.email_type === 'interview_scheduled')
    expect(renderTemplate('interview_scheduled', JSON.parse(scheduled.template_data)).html)
      .toContain('Wednesday, June 12, 2030 at 9:00 PM UTC')
  })
})

describe('POST /api/interviews — invalid input (nothing written)', () => {
  it('422s an unknown zone with Zod detail and creates no interview or email', async () => {
    const res = await schedule({ scheduled_at: FUTURE, timezone: 'Mars/Olympus' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { details: { fieldErrors: Record<string, string[]> } }
    expect(body.details.fieldErrors.timezone?.[0]).toMatch(/timezone/i)
    expect(await interviewCount()).toBe(0)
    expect(await queuedFor(candidateEmail)).toEqual([])
  })

  it('422s a hostile zone string', async () => {
    const res = await schedule({ scheduled_at: FUTURE, timezone: "UTC'); DROP TABLE interviews;--" })
    expect(res.status).toBe(422)
    expect(await interviewCount()).toBe(0)
  })
})

describe('POST /api/interviews — boundaries (SYN-027: no past times)', () => {
  afterEach(() => vi.useRealTimers())

  it('422s a time that has already passed and writes nothing', async () => {
    const res = await schedule({ scheduled_at: '2020-01-01T10:00:00.000Z', timezone: 'UTC' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { details: { fieldErrors: Record<string, string[]> } }
    expect(body.details.fieldErrors.scheduled_at?.[0]).toMatch(/future/i)
    expect(await interviewCount()).toBe(0)
  })

  it('treats "now" as past and one minute from now as future', async () => {
    // Freeze at the real current second so the access token stays valid.
    const now = Math.floor(Date.now() / 1000) * 1000
    vi.useFakeTimers({ now, toFake: ['Date'] })
    expect((await schedule({ scheduled_at: new Date(now).toISOString(), timezone: 'UTC' })).status).toBe(422)
    expect((await schedule({ scheduled_at: new Date(now + 60_000).toISOString(), timezone: 'UTC' })).status).toBe(201)
  })
})
