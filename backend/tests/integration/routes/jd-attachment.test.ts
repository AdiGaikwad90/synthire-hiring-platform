import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { seedCompanyAndRecruiter, signTestToken, authHeader } from '../../setup/factories'
import { jdParseKvKey, pendingJdKey, JD_PARSE_TTL_SECONDS, type JdParseRecord } from '../../../src/services/jd/attachment'

let companyId: string
let token: string
const PARSE_ID = '11111111-2222-4333-8444-555555555555'

beforeEach(async () => {
  const s = await seedCompanyAndRecruiter(env.DB)
  companyId = s.companyId
  token = await signTestToken(env.JWT_SECRET, { sub: s.recruiterId, company_id: companyId, role: 'recruiter' })
})

async function seedParse(over: Partial<JdParseRecord> = {}, parseId = PARSE_ID, owner = companyId) {
  const pendingKey = pendingJdKey(owner, parseId, 'pdf')
  await env.RESUME_BUCKET.put(pendingKey, new Uint8Array([0x25, 0x50, 0x44, 0x46]), { httpMetadata: { contentType: 'application/pdf' } })
  const record: JdParseRecord = { status: 'done', companyId: owner, pendingKey, ext: 'pdf', result: { title: 'Platform Engineer' }, ...over }
  await env.KV_CACHE.put(jdParseKvKey(parseId), JSON.stringify(record), { expirationTtl: JD_PARSE_TTL_SECONDS })
  return pendingKey
}

const create = (extra: Record<string, unknown>) => SELF.fetch('https://test.local/api/jobs', {
  method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Platform Engineer', ...extra }),
})

describe('POST /api/jobs with jd_parse_id', () => {
  it('moves the pending file to jd/{company}/{jobId} and links it', async () => {
    const pendingKey = await seedParse()
    const res = await create({ jd_parse_id: PARSE_ID })
    expect(res.status).toBe(201)
    const job = ((await res.json()) as { data: { id: string; jd_url: string; jd_attached: boolean } }).data
    expect(job.jd_attached).toBe(true)
    expect(job.jd_url).toBe(`jd/${companyId}/${job.id}.pdf`)
    expect(await env.RESUME_BUCKET.get(job.jd_url)).not.toBeNull()
    expect(await env.RESUME_BUCKET.get(pendingKey)).toBeNull()
  })

  it('creates the job without a JD when no jd_parse_id is sent (no jd_attached field)', async () => {
    const res = await create({})
    const job = ((await res.json()) as { data: Record<string, unknown> }).data
    expect(job.jd_url).toBeNull()
    expect('jd_attached' in job).toBe(false)
  })

  it('422s another company\'s parse and creates nothing', async () => {
    const other = await seedCompanyAndRecruiter(env.DB)
    await seedParse({}, PARSE_ID, other.companyId)
    const res = await create({ jd_parse_id: PARSE_ID })
    expect(res.status).toBe(422)
    const { results } = await env.DB.prepare('SELECT id FROM jobs WHERE company_id = ?').bind(companyId).all()
    expect(results).toEqual([])
  })

  it('422s an expired or unknown parse', async () => {
    expect((await create({ jd_parse_id: PARSE_ID })).status).toBe(422)
  })

  it('422s a parse that is still processing', async () => {
    await seedParse({ status: 'processing' })
    expect((await create({ jd_parse_id: PARSE_ID })).status).toBe(422)
  })

  it('keeps the job and reports jd_attached: false when the pending file vanished', async () => {
    const pendingKey = await seedParse()
    await env.RESUME_BUCKET.delete(pendingKey)
    const res = await create({ jd_parse_id: PARSE_ID })
    expect(res.status).toBe(201)
    const job = ((await res.json()) as { data: { jd_url: string | null; jd_attached: boolean } }).data
    expect(job).toMatchObject({ jd_url: null, jd_attached: false })
  })

  it('rejects a jd_parse_id that is not a UUID with 422', async () => {
    expect((await create({ jd_parse_id: '../../etc/passwd' })).status).toBe(422)
  })

  it('F2: keeps the job and reports jd_attached: false when attachJd throws (R2 put failure)', async () => {
    await seedParse()
    const originalPut = env.RESUME_BUCKET.put.bind(env.RESUME_BUCKET)
    env.RESUME_BUCKET.put = (async () => { throw new Error('simulated R2 put failure') }) as typeof env.RESUME_BUCKET.put
    try {
      const res = await create({ jd_parse_id: PARSE_ID })
      expect(res.status).toBe(201)
      const job = ((await res.json()) as { data: { jd_url: string | null; jd_attached: boolean } }).data
      expect(job).toMatchObject({ jd_url: null, jd_attached: false })
      const { results } = await env.DB.prepare('SELECT id FROM jobs WHERE company_id = ?').bind(companyId).all()
      expect(results).toHaveLength(1)
    } finally {
      env.RESUME_BUCKET.put = originalPut
    }
  })
})

describe('PATCH /api/jobs/:id with jd_parse_id', () => {
  async function createPlainJob() {
    const res = await create({})
    return ((await res.json()) as { data: { id: string } }).data.id
  }

  it('F6: moves the pending file, sets jd_url and deletes the previous file', async () => {
    const jobId = await createPlainJob()
    const firstPendingKey = await seedParse({}, '11111111-1111-4111-8111-111111111111')
    const firstRes = await SELF.fetch(`https://test.local/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_parse_id: '11111111-1111-4111-8111-111111111111' }),
    })
    const firstJob = ((await firstRes.json()) as { data: { jd_url: string; jd_attached: boolean } }).data
    expect(firstRes.status).toBe(200)
    expect(firstJob.jd_attached).toBe(true)
    const previousJdUrl = firstJob.jd_url

    const secondPendingKey = await seedParse({}, '22222222-2222-4222-8222-222222222222')
    const secondRes = await SELF.fetch(`https://test.local/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_parse_id: '22222222-2222-4222-8222-222222222222' }),
    })
    expect(secondRes.status).toBe(200)
    const secondJob = ((await secondRes.json()) as { data: { jd_url: string; jd_attached: boolean } }).data
    expect(secondJob.jd_attached).toBe(true)
    expect(secondJob.jd_url).toBe(previousJdUrl) // same key pattern jd/{company}/{jobId}.pdf
    expect(await env.RESUME_BUCKET.get(firstPendingKey)).toBeNull()
    expect(await env.RESUME_BUCKET.get(secondPendingKey)).toBeNull()
  })

  it('F6: 422s another company\'s parse and leaves the job unchanged', async () => {
    const jobId = await createPlainJob()
    const other = await seedCompanyAndRecruiter(env.DB)
    await seedParse({}, PARSE_ID, other.companyId)
    const res = await SELF.fetch(`https://test.local/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_parse_id: PARSE_ID }),
    })
    expect(res.status).toBe(422)
    const row = await env.DB.prepare('SELECT jd_url FROM jobs WHERE id = ?').bind(jobId).first<{ jd_url: string | null }>()
    expect(row?.jd_url).toBeNull()
  })

  it('F2: keeps the job and reports jd_attached: false when attachJd throws (R2 put failure)', async () => {
    const jobId = await createPlainJob()
    await seedParse()
    const originalPut = env.RESUME_BUCKET.put.bind(env.RESUME_BUCKET)
    env.RESUME_BUCKET.put = (async () => { throw new Error('simulated R2 put failure') }) as typeof env.RESUME_BUCKET.put
    try {
      const res = await SELF.fetch(`https://test.local/api/jobs/${jobId}`, {
        method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_parse_id: PARSE_ID }),
      })
      expect(res.status).toBe(200)
      const job = ((await res.json()) as { data: { jd_url: string | null; jd_attached: boolean } }).data
      expect(job).toMatchObject({ jd_url: null, jd_attached: false })
    } finally {
      env.RESUME_BUCKET.put = originalPut
    }
  })
})

describe('F6: jdparse KV record deleted after successful attach (double-submit)', () => {
  it('422s a second POST that reuses the same jd_parse_id after a successful create', async () => {
    await seedParse()
    const first = await create({ jd_parse_id: PARSE_ID })
    expect(first.status).toBe(201)

    const second = await create({ jd_parse_id: PARSE_ID })
    expect(second.status).toBe(422)
    const { results } = await env.DB.prepare('SELECT id FROM jobs WHERE company_id = ?').bind(companyId).all()
    expect(results).toHaveLength(1)
  })
})

describe('GET /api/jobs/parse-jd/:parseId', () => {
  it('returns the parsed result with parse_id and no storage path', async () => {
    await seedParse({ result: { title: 'Platform Engineer', parse_id: PARSE_ID } })
    const res = await SELF.fetch(`https://test.local/api/jobs/parse-jd/${PARSE_ID}`, { headers: authHeader(token) })
    const data = ((await res.json()) as { data: Record<string, unknown> }).data
    expect(data).toEqual({ status: 'done', result: { title: 'Platform Engineer', parse_id: PARSE_ID } })
  })

  it('treats another company\'s parse as unknown', async () => {
    const other = await seedCompanyAndRecruiter(env.DB)
    await seedParse({}, PARSE_ID, other.companyId)
    const res = await SELF.fetch(`https://test.local/api/jobs/parse-jd/${PARSE_ID}`, { headers: authHeader(token) })
    expect(((await res.json()) as { data: unknown }).data).toEqual({ status: 'processing' })
  })
})
