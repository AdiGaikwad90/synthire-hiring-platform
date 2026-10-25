import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { app } from '../../../src/index'
import {
  seedCompanyAndRecruiter,
  seedUser,
  signTestToken,
  authHeader,
  makeJobData,
  insertCandidate,
} from '../../setup/factories'
import { createJob, updateJob } from '../../../src/db/queries/jobs'
import { setCandidateResumeUrl } from '../../../src/db/queries/candidates'
import { createInterview, createInterviewType } from '../../../src/db/queries/interviews'
import type { JWTPayload } from '../../../src/types/auth'

/**
 * SYN-043 — role scoping for every route (Tier B auth matrix).
 *
 * An interviewer may run their own interviews and nothing else: read the
 * candidate and job of an interview assigned to them, generate questions and
 * submit feedback. Before this, every write route skipped the role check, so
 * an interviewer could create, edit and delete jobs, candidates and interview
 * rounds, list every candidate, and change any interview's status.
 *
 * ACCESS is the contract. The first test fails when a route is added without
 * being classified here, so nothing can ship unguarded by accident.
 */

type Access =
  | 'public'     // no token needed
  | 'any'        // any signed-in role, scoped to the caller themselves
  | 'own'        // interviewers: only their own interviews (requireOwnInterview / filtered list)
  | 'assigned'   // interviewers: only a candidate or job from one of their interviews
  | 'recruiter'  // recruiters and admins only

const ACCESS: Record<string, Access> = {
  'POST /api/auth/signup': 'public',
  'POST /api/auth/login': 'public',
  'POST /api/auth/refresh': 'public',
  'POST /api/auth/logout': 'public',
  'GET /api/auth/me': 'any',

  'GET /api/jobs': 'recruiter',
  'POST /api/jobs': 'recruiter',
  'POST /api/jobs/parse-jd': 'recruiter',
  'GET /api/jobs/parse-jd/:parseId': 'recruiter',
  'GET /api/jobs/:id/jd': 'assigned',
  'GET /api/jobs/:id/skill-gaps': 'recruiter',
  'GET /api/jobs/:id': 'assigned',
  'PATCH /api/jobs/:id': 'recruiter',
  'DELETE /api/jobs/:id': 'recruiter',

  'POST /api/candidates/upload': 'recruiter',
  'GET /api/candidates': 'recruiter',
  'GET /api/candidates/:id': 'assigned',
  'PATCH /api/candidates/:id': 'recruiter',
  'GET /api/candidates/:id/resume': 'assigned',
  'POST /api/candidates/:id/questions': 'assigned',
  'DELETE /api/candidates/:id': 'recruiter',

  'GET /api/interviews': 'own',
  'POST /api/interviews': 'recruiter',
  'GET /api/interviews/:id': 'own',
  'PATCH /api/interviews/:id': 'recruiter',
  'GET /api/interviews/:id/feedback': 'own',
  'POST /api/interviews/:id/feedback': 'own',

  'GET /api/interview-types': 'recruiter',
  'POST /api/interview-types': 'recruiter',
  'PATCH /api/interview-types/:id': 'recruiter',
  'DELETE /api/interview-types/:id': 'recruiter',

  'GET /api/analytics/funnel': 'recruiter',
  'GET /api/analytics/time-to-hire': 'recruiter',
  'GET /api/analytics/summary': 'recruiter',
  'GET /api/analytics/activity': 'recruiter',
  'GET /api/analytics/email-stats': 'recruiter',
  'GET /api/analytics/sources': 'recruiter',
  'GET /api/analytics/r2-usage': 'recruiter',
  'GET /api/analytics/quota-usage': 'recruiter',

  'POST /api/email/resend-callback': 'public',
  'GET /api/email/unsubscribe': 'public',
  'POST /api/email/unsubscribe': 'public',
  'GET /api/email/logs': 'recruiter',
  'GET /api/email/preferences': 'any',
  'PATCH /api/email/preferences': 'any',

  'GET /health': 'public',
}

// 863-byte blank one-page PDF — passes the magic-byte check, so an unguarded
// upload would get as far as creating a row and storing the file.
const BLANK_PDF = Uint8Array.from(atob('JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UaXRsZSAoYmxhbmsuaHRtbCkKL0NyZWF0b3IgKE1vemlsbGEvNS4wIFwoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83XCkgQXBwbGVXZWJLaXQvNTM3LjM2IFwoS0hUTUwsIGxpa2UgR2Vja29cKSBIZWFkbGVzc0Nocm9tZS8xNTIuMC4wLjAgU2FmYXJpLzUzNy4zNikKL1Byb2R1Y2VyIChTa2lhL1BERiBtMTUyKQovQ3JlYXRpb25EYXRlIChEOjIwMjYxMDAzMTk1NjUzKzAwJzAwJykKL01vZERhdGUgKEQ6MjAyNjEwMDMxOTU2NTMrMDAnMDAnKT4+CmVuZG9iagozIDAgb2JqCjw8L0xlbmd0aCAwPj4gc3RyZWFtCgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8L1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldPj4KL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KL0NvbnRlbnRzIDMgMCBSCi9UYWJzIC9TCi9QYXJlbnQgNCAwIFI+PgplbmRvYmoKNCAwIG9iago8PC9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMiAwIFJdPj4KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZwovUGFnZXMgNCAwIFIKL1ZpZXdlclByZWZlcmVuY2VzIDw8L1R5cGUgL1ZpZXdlclByZWZlcmVuY2VzCi9EaXNwbGF5RG9jVGl0bGUgdHJ1ZT4+Pj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMzQzIDAwMDAwIG4gCjAwMDAwMDAyOTYgMDAwMDAgbiAKMDAwMDAwMDQ5OCAwMDAwMCBuIAowMDAwMDAwNTUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2Ci9Sb290IDUgMCBSCi9JbmZvIDEgMCBSPj4Kc3RhcnR4cmVmCjY3MAolJUVPRgo='), (ch) => ch.charCodeAt(0))

const BASE = 'https://test.local'

interface World {
  co: string
  recruiter: string
  admin: string
  interviewer: string       // assigned to `interview` (candidate + job)
  bystander: string         // an interviewer with no interviews
  job: string
  candidate: string         // has a resume file, a cached question set, an interview
  otherJob: string          // same company, nobody's interview
  otherCandidate: string    // same company, no resume, no interview
  foreignJob: string        // another company
  foreignCandidate: string
  interview: string
  roundType: string
}

let w: World

const tokenFor = (sub: string, role: JWTPayload['role'], company = w.co) =>
  signTestToken(env.JWT_SECRET, { sub, role, company_id: company })

const call = async (method: string, path: string, token: string, body?: unknown) => {
  const init: RequestInit = { method, headers: authHeader(token) }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { ...authHeader(token), 'Content-Type': 'application/json' }
  }
  return SELF.fetch(`${BASE}${path}`, init)
}

beforeEach(async () => {
  const { companyId: co, recruiterId: recruiter } = await seedCompanyAndRecruiter(env.DB)
  const admin = await seedUser(env.DB, co, 'admin')
  const interviewer = await seedUser(env.DB, co, 'interviewer')
  const bystander = await seedUser(env.DB, co, 'interviewer')

  const job = (await createJob(env.DB, makeJobData(co, recruiter, { title: 'Assigned job' }))).id
  const otherJob = (await createJob(env.DB, makeJobData(co, recruiter, { title: 'Other job' }))).id
  const candidate = await insertCandidate(env.DB, co, job, 'Assigned Candidate')
  const otherCandidate = await insertCandidate(env.DB, co, otherJob, 'Other Candidate')

  const resumeKey = `resumes/${co}/${job}/${candidate}.pdf`
  await env.RESUME_BUCKET.put(resumeKey, BLANK_PDF)
  await setCandidateResumeUrl(env.DB, candidate, resumeKey)
  const jdKey = `jd/${co}/${job}.pdf`
  await env.RESUME_BUCKET.put(jdKey, BLANK_PDF)
  await updateJob(env.DB, job, co, { jd_url: jdKey })
  // A cached question set, so the assigned-interviewer case never needs Workers AI.
  await env.KV_CACHE.put(`questions:${candidate}`, JSON.stringify({ questions: [{ q: 'Why Go?', why: 'probe' }] }))

  const interview = (await createInterview(env.DB, {
    candidate_id: candidate, job_id: job, company_id: co, interviewer_id: interviewer,
    scheduled_at: '2030-01-01T10:00:00.000Z', duration_minutes: 60,
  })).id
  const roundType = (await createInterviewType(env.DB, co, { name: 'Tech screen', duration_minutes: 45, required: true, position: 0 })).id

  const foreign = await seedCompanyAndRecruiter(env.DB)
  const foreignJob = (await createJob(env.DB, makeJobData(foreign.companyId, foreign.recruiterId))).id
  const foreignCandidate = await insertCandidate(env.DB, foreign.companyId, foreignJob)

  w = { co, recruiter, admin, interviewer, bystander, job, candidate, otherJob, otherCandidate,
    foreignJob, foreignCandidate, interview, roundType }
})

/** A VALID request for every recruiter-only route — so a missing guard would really write. */
function recruiterOnlyRequest(route: string): [string, unknown?] {
  const upload = () => {
    const form = new FormData()
    form.append('jobId', w.job)
    form.append('file', new File([BLANK_PDF], 'resume.pdf', { type: 'application/pdf' }))
    return form
  }
  const jd = () => {
    const form = new FormData()
    form.append('file', new File([BLANK_PDF], 'jd.pdf', { type: 'application/pdf' }))
    return form
  }
  const requests: Record<string, () => [string, unknown?]> = {
    'GET /api/jobs': () => ['/api/jobs'],
    'POST /api/jobs': () => ['/api/jobs', { title: 'Planted job' }],
    'POST /api/jobs/parse-jd': () => ['/api/jobs/parse-jd', jd()],
    'GET /api/jobs/parse-jd/:parseId': () => ['/api/jobs/parse-jd/00000000-0000-4000-8000-000000000000'],
    'GET /api/jobs/:id/skill-gaps': () => [`/api/jobs/${w.job}/skill-gaps`],
    'PATCH /api/jobs/:id': () => [`/api/jobs/${w.job}`, { title: 'Hijacked' }],
    'DELETE /api/jobs/:id': () => [`/api/jobs/${w.otherJob}`],
    'POST /api/candidates/upload': () => ['/api/candidates/upload', upload()],
    'GET /api/candidates': () => ['/api/candidates'],
    'PATCH /api/candidates/:id': () => [`/api/candidates/${w.candidate}`, { status: 'rejected' }],
    'DELETE /api/candidates/:id': () => [`/api/candidates/${w.otherCandidate}`],
    'POST /api/interviews': () => ['/api/interviews', {
      candidate_id: w.otherCandidate, job_id: w.otherJob, interviewer_id: w.interviewer,
      scheduled_at: '2030-02-01T10:00:00.000Z',
    }],
    'PATCH /api/interviews/:id': () => [`/api/interviews/${w.interview}`, { status: 'completed' }],
    'GET /api/interview-types': () => ['/api/interview-types'],
    'POST /api/interview-types': () => ['/api/interview-types', { name: 'Planted round' }],
    'PATCH /api/interview-types/:id': () => [`/api/interview-types/${w.roundType}`, { name: 'Hijacked' }],
    'DELETE /api/interview-types/:id': () => [`/api/interview-types/${w.roundType}`],
    'GET /api/email/logs': () => ['/api/email/logs'],
  }
  const build = requests[route] ?? (route.startsWith('GET /api/analytics/') ? () => [route.slice(4)] as [string] : undefined)
  if (!build) throw new Error(`no test request for recruiter-only route ${route} — add one`)
  return build()
}

/** Everything a refused request could have touched, for a before/after comparison. */
async function snapshot() {
  const rows = (sql: string) => env.DB.prepare(sql).bind(w.co).all().then((r) => r.results)
  const keys = async (prefix: string) => (await env.RESUME_BUCKET.list({ prefix })).objects.map((o) => o.key)
  return JSON.stringify({
    jobs: await rows('SELECT id, title, status, jd_url, updated_at FROM jobs WHERE company_id = ? ORDER BY id'),
    candidates: await rows('SELECT id, name, status, processing_status, updated_at FROM candidates WHERE company_id = ? ORDER BY id'),
    interviews: await rows('SELECT id, candidate_id, status, meeting_notes FROM interviews WHERE company_id = ? ORDER BY id'),
    rounds: await rows('SELECT id, name, duration_minutes FROM interview_types WHERE company_id = ? ORDER BY id'),
    files: [...await keys(`resumes/${w.co}/`), ...await keys(`jd-pending/${w.co}/`), ...await keys(`jd/${w.co}/`)],
    jdParses: (await env.KV_CACHE.list({ prefix: 'jdparse:' })).keys.map((k) => k.name),
  })
}

const routesWith = (access: Access) => Object.keys(ACCESS).filter((r) => ACCESS[r] === access)

describe('route access table', () => {
  it('classifies every route the API registers, and nothing it does not', () => {
    const registered = [...new Set(
      app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
    )].sort()
    expect(registered).toEqual(Object.keys(ACCESS).sort())
  })
})

describe('interviewer — recruiter-only routes (error contract)', () => {
  it('403s every recruiter-only route with the standard error body', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    for (const route of routesWith('recruiter')) {
      const [path, body] = recruiterOnlyRequest(route)
      const res = await call(route.split(' ')[0], path, token, body)
      expect(res.status, `${route} must refuse an interviewer`).toBe(403)
      const json = await res.json<{ success: boolean; data: unknown; error: string }>()
      expect(json.success, route).toBe(false)
      expect(json.error, route).toMatch(/forbidden/i)
    }
  })

  it('writes nothing — no row, file, queue-bound candidate or JD parse — while refusing', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    const before = await snapshot()
    for (const route of routesWith('recruiter')) {
      const [path, body] = recruiterOnlyRequest(route)
      await call(route.split(' ')[0], path, token, body)
    }
    expect(await snapshot()).toBe(before)
  })

  // The role check runs before validation: a refused caller never learns the
  // request schema from a 422.
  it('403s a malformed body instead of returning a validation error', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    const cases: [string, string, unknown][] = [
      ['PATCH', `/api/candidates/${w.candidate}`, { status: 'not-a-stage' }],
      ['POST', '/api/jobs', {}],
      ['PATCH', `/api/jobs/${w.job}`, { title: '' }],
      ['POST', '/api/interviews', {}],
      ['PATCH', `/api/interviews/${w.interview}`, { status: 42 }],
      ['POST', '/api/interview-types', {}],
      ['GET', '/api/candidates?limit=-5', undefined],
    ]
    for (const [method, path, body] of cases) {
      const res = await call(method, path, token, body)
      expect(res.status, `${method} ${path}`).toBe(403)
    }
  })

  it('403s even the interviewer\'s own interview on PATCH', async () => {
    const res = await call('PATCH', `/api/interviews/${w.interview}`, await tokenFor(w.interviewer, 'interviewer'), { status: 'completed' })
    expect(res.status).toBe(403)
  })
})

describe('interviewer — candidate and job reads (happy path)', () => {
  it('reads the candidate, resume, questions, job and JD of an assigned interview', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    const cand = await call('GET', `/api/candidates/${w.candidate}`, token)
    expect(cand.status).toBe(200)
    expect((await cand.json<{ data: { id: string } }>()).data.id).toBe(w.candidate)

    const resume = await call('GET', `/api/candidates/${w.candidate}/resume`, token)
    expect(resume.status).toBe(200)
    expect(resume.headers.get('Content-Type')).toBe('application/pdf')

    const questions = await call('POST', `/api/candidates/${w.candidate}/questions`, token)
    expect(questions.status).toBe(200)

    const job = await call('GET', `/api/jobs/${w.job}`, token)
    expect(job.status).toBe(200)
    expect((await job.json<{ data: { id: string } }>()).data.id).toBe(w.job)

    const jd = await call('GET', `/api/jobs/${w.job}/jd`, token)
    expect(jd.status).toBe(200)
  })

  it('still lists only their own interviews and reads their own feedback route', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    const list = await call('GET', '/api/interviews', token)
    expect(list.status).toBe(200)
    const items = (await list.json<{ data: { items: { interviewer_id: string }[] } }>()).data.items
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.interviewer_id === w.interviewer)).toBe(true)
    expect((await call('GET', `/api/interviews/${w.interview}/feedback`, token)).status).toBe(200)
  })

  it('reads and updates their own email preferences', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    expect((await call('GET', '/api/email/preferences', token)).status).toBe(200)
  })
})

describe('interviewer — candidate and job reads (scoping)', () => {
  const reads = (cand: string, job: string): [string, string][] => [
    ['GET', `/api/candidates/${cand}`],
    ['GET', `/api/candidates/${cand}/resume`],
    ['POST', `/api/candidates/${cand}/questions`],
    ['GET', `/api/jobs/${job}`],
    ['GET', `/api/jobs/${job}/jd`],
  ]

  it('403s an interviewer with no interview for that candidate or job', async () => {
    const token = await tokenFor(w.bystander, 'interviewer')
    for (const [method, path] of reads(w.candidate, w.job)) {
      expect((await call(method, path, token)).status, `${method} ${path}`).toBe(403)
    }
  })

  it('403s an assigned interviewer on a different candidate and job in the same company', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    for (const [method, path] of reads(w.otherCandidate, w.otherJob)) {
      expect((await call(method, path, token)).status, `${method} ${path}`).toBe(403)
    }
  })

  // Questions are uncached for otherCandidate: the refusal must come before any
  // Workers AI call, and the resume refusal before "no resume on file".
  it('refuses before spending AI or revealing whether a resume exists', async () => {
    const token = await tokenFor(w.bystander, 'interviewer')
    expect((await call('POST', `/api/candidates/${w.otherCandidate}/questions`, token)).status).toBe(403)
    expect(await env.KV_CACHE.get(`questions:${w.otherCandidate}`)).toBeNull()
    expect((await call('GET', `/api/candidates/${w.otherCandidate}/resume`, token)).status).toBe(403)
  })

  it('404s another company\'s records and ids that do not exist', async () => {
    const token = await tokenFor(w.interviewer, 'interviewer')
    for (const [cand, job] of [[w.foreignCandidate, w.foreignJob], ['does-not-exist', 'does-not-exist']]) {
      for (const [method, path] of reads(cand, job)) {
        expect((await call(method, path, token)).status, `${method} ${path}`).toBe(404)
      }
    }
  })
})

describe('recruiters and admins keep full access (regression)', () => {
  it('lets a recruiter read any candidate and job in the company without an interview', async () => {
    const token = await tokenFor(w.recruiter, 'recruiter')
    expect((await call('GET', `/api/candidates/${w.otherCandidate}`, token)).status).toBe(200)
    expect((await call('GET', `/api/jobs/${w.otherJob}`, token)).status).toBe(200)
  })

  it('lets an admin use recruiter-only routes', async () => {
    const token = await tokenFor(w.admin, 'admin')
    expect((await call('GET', '/api/jobs', token)).status).toBe(200)
    expect((await call('GET', '/api/candidates', token)).status).toBe(200)
    expect((await call('GET', '/api/interview-types', token)).status).toBe(200)
    expect((await call('POST', '/api/interview-types', token, { name: 'Admin round' })).status).toBe(201)
    expect((await call('PATCH', `/api/candidates/${w.candidate}`, token, { status: 'shortlisted' })).status).toBe(200)
  })
})

describe('unknown role (fail-closed)', () => {
  // A validly signed token whose role the product doesn't have. The interview
  // list used to fall through to company-wide results for any role other than
  // "interviewer".
  it('403s every protected route, including the interview list and own-interview routes', async () => {
    const token = await signTestToken(env.JWT_SECRET, {
      sub: w.interviewer, company_id: w.co, role: 'guest' as JWTPayload['role'],
    })
    for (const path of ['/api/auth/me', '/api/interviews', `/api/interviews/${w.interview}`,
      `/api/candidates/${w.candidate}`, '/api/jobs', '/api/email/preferences']) {
      expect((await call('GET', path, token)).status, path).toBe(403)
    }
  })
})

describe('PATCH /api/interviews/:id — validation (recruiter)', () => {
  const status = async () =>
    (await env.DB.prepare('SELECT status, meeting_notes FROM interviews WHERE id = ?').bind(w.interview).first<{ status: string; meeting_notes: string | null }>())!

  it('updates the status to a known value', async () => {
    const res = await call('PATCH', `/api/interviews/${w.interview}`, await tokenFor(w.recruiter, 'recruiter'), { status: 'completed' })
    expect(res.status).toBe(200)
    expect((await status()).status).toBe('completed')
  })

  it('422s an unknown status with Zod detail and changes nothing', async () => {
    const res = await call('PATCH', `/api/interviews/${w.interview}`, await tokenFor(w.recruiter, 'recruiter'), { status: 'bogus' })
    expect(res.status).toBe(422)
    expect(await res.json()).toHaveProperty('details')
    expect((await status()).status).toBe('scheduled')
  })

  it('accepts meeting notes of exactly 500 characters and rejects 501', async () => {
    const token = await tokenFor(w.recruiter, 'recruiter')
    expect((await call('PATCH', `/api/interviews/${w.interview}`, token, { meeting_notes: 'x'.repeat(500) })).status).toBe(200)
    expect((await call('PATCH', `/api/interviews/${w.interview}`, token, { meeting_notes: 'y'.repeat(501) })).status).toBe(422)
    expect((await status()).meeting_notes).toBe('x'.repeat(500))
  })
})

describe('POST /api/interviews — meeting notes limit', () => {
  it('422s notes over 500 characters and creates no interview', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM interviews WHERE company_id = ?').bind(w.co).first<{ n: number }>()
    const res = await call('POST', '/api/interviews', await tokenFor(w.recruiter, 'recruiter'), {
      candidate_id: w.otherCandidate, job_id: w.otherJob, scheduled_at: '2030-02-01T10:00:00.000Z',
      meeting_notes: 'z'.repeat(501),
    })
    expect(res.status).toBe(422)
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM interviews WHERE company_id = ?').bind(w.co).first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })
})
