import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/auth/[...path]/route'

/**
 * SYN-007. The frontend (pages.dev) and the API (workers.dev) are different
 * sites, so the API's refresh cookie was a third-party cookie. Safari blocks
 * those by default: the cookie was never stored, the session could not be
 * renewed, and Safari users were signed out 15 minutes after login.
 *
 * The four cookie-based auth calls now go to the frontend's own origin, and
 * this handler forwards them to the API — which makes the refresh cookie
 * first-party. It forwards exactly those four calls and exactly that cookie.
 */

const API = 'http://localhost:8787'
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const call = (segments: string[], init: RequestInit = {}) =>
  POST(new Request(`https://app.test/api/auth/${segments.join('/')}`, { method: 'POST', ...init }), {
    params: Promise.resolve({ path: segments }),
  })

const upstream = (body: unknown, status = 200, setCookies: string[] = []) => {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const c of setCookies) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}
const sent = () => fetchMock.mock.calls[0] as [string, RequestInit]
const sentHeaders = () => new Headers(sent()[1].headers)

describe('auth proxy — happy path', () => {
  it('forwards a login to the API and returns its answer', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true, data: { token: 't' } }))
    const res = await call(['login'], {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'pw' }),
    })
    expect(sent()[0]).toBe(`${API}/api/auth/login`)
    expect(sent()[1].method).toBe('POST')
    expect(sent()[1].body).toBe(JSON.stringify({ email: 'a@b.co', password: 'pw' }))
    expect(sentHeaders().get('content-type')).toBe('application/json')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { token: 't' } })
  })
})

describe('auth proxy — positive variants', () => {
  it.each([['login'], ['signup'], ['refresh'], ['logout']])('forwards %s', async (name) => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true }))
    expect((await call([name])).status).toBe(200)
    expect(sent()[0]).toBe(`${API}/api/auth/${name}`)
  })

  it('sends the refresh cookie on to the API, and nothing else from the cookie jar', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true }))
    await call(['refresh'], { headers: { Cookie: 'theme=dark; synthire_refresh=r-123; synthire_session=recruiter' } })
    expect(sentHeaders().get('cookie')).toBe('synthire_refresh=r-123')
  })

  it('sends no Cookie header when there is no refresh cookie', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: false }, 401))
    await call(['refresh'], { headers: { Cookie: 'theme=dark' } })
    expect(sentHeaders().has('cookie')).toBe(false)
  })

  it('hands the refresh cookie back as a first-party Lax cookie, and drops the access cookie', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true }, 200, [
      'synthire_token=jwt; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=900',
      'synthire_refresh=r-456; HttpOnly; SameSite=None; Secure; Path=/api/auth; Max-Age=2592000',
    ]))
    const res = await call(['login'])
    // The access cookie is what collided with the gate cookie; the browser authenticates with the header.
    expect(res.headers.getSetCookie()).toEqual([
      'synthire_refresh=r-456; HttpOnly; SameSite=Lax; Secure; Path=/api/auth; Max-Age=2592000',
    ])
  })

  it('passes the cookie-clearing header through on logout', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true }, 200, [
      'synthire_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0',
    ]))
    const res = await call(['logout'])
    expect(res.headers.getSetCookie()).toEqual(['synthire_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0'])
  })
})

describe('auth proxy — error contract', () => {
  it('passes an API refusal through unchanged, so the client can tell 401 from 429', async () => {
    for (const status of [401, 422, 429, 500]) {
      fetchMock.mockResolvedValueOnce(upstream({ success: false, error: 'nope' }, status))
      const res = await call(['login'])
      expect(res.status, String(status)).toBe(status)
      expect(await res.json()).toEqual({ success: false, error: 'nope' })
    }
  })

  // 502, not 401: an unreachable API must not look like an expired session.
  it('answers 502 in the API envelope when the API cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const res = await call(['refresh'])
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ success: false, data: null, error: expect.stringMatching(/unavailable/i) })
  })
})

describe('auth proxy — anything else is refused without calling the API', () => {
  // Hostile cases included: this must never become an open relay to the API.
  it.each([
    [['me']], [['users']], [[]], [['login', 'extra']], [['..', 'jobs']], [['LOGIN']], [['login?x=1']], [['refresh ']],
    [['https:', '', 'evil.io']],
  ] as [string[]][])('%j → 404', async (segments) => {
    const res = await call(segments)
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ success: false, data: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not forward caller-supplied headers that could impersonate another client', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ success: true }))
    await call(['login'], { headers: { 'X-Forwarded-For': '1.2.3.4', 'CF-Connecting-IP': '1.2.3.4', Host: 'evil.io', Authorization: 'Bearer x' } })
    const h = sentHeaders()
    expect([...h.keys()].sort()).toEqual([])
  })
})
