/**
 * @vitest-environment happy-dom
 *
 * apiFetch's 401 handling is the highest-consequence logic in the frontend: it
 * decides when a user gets silently logged out. A DOM environment is used
 * because the code reads localStorage and assigns window.location — this is
 * still logic testing, not component rendering (TESTING.md tier D).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiFetch, ApiError } from '@/lib/api'
import { setToken, getToken } from '@/lib/auth'

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data, error: null }), { status })

const fail = (status: number, error = 'nope') =>
  new Response(JSON.stringify({ success: false, data: null, error }), { status })

let fetchMock: ReturnType<typeof vi.fn>
let redirectedTo: string | null

beforeEach(() => {
  localStorage.clear()
  redirectedTo = null

  // happy-dom would attempt a real navigation on assignment; capture instead.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return 'http://localhost/'
      },
      set href(v: string) {
        redirectedTo = v
      },
    },
  })

  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const refreshCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/auth/refresh')).length

describe('apiFetch — happy path', () => {
  it('unwraps the standard envelope and returns data', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 'j1' }))
    await expect(apiFetch('/api/jobs')).resolves.toEqual({ id: 'j1' })
  })

  it('attaches the Bearer header when a token is stored', async () => {
    setToken('tok123')
    fetchMock.mockResolvedValueOnce(ok([]))
    await apiFetch('/api/jobs')
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok123')
  })

  it('omits the Bearer header when there is no token', async () => {
    fetchMock.mockResolvedValueOnce(ok([]))
    await apiFetch('/api/jobs')
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('apiFetch — non-401 errors do NOT log the user out', () => {
  // A 500 or a 422 is not an auth problem. Clearing the session on one would
  // dump the user at /login for a validation mistake.
  for (const status of [400, 403, 422, 500, 503]) {
    it(`throws ApiError(${status}) and keeps the session`, async () => {
      setToken('tok123')
      fetchMock.mockResolvedValueOnce(fail(status))

      await expect(apiFetch('/api/jobs')).rejects.toMatchObject({ status })
      expect(getToken(), `${status} cleared the token`).toBe('tok123')
      expect(redirectedTo, `${status} redirected to login`).toBeNull()
    })
  }

  it('preserves the server error message and body', async () => {
    fetchMock.mockResolvedValueOnce(fail(422, 'title is required'))
    await expect(apiFetch('/api/jobs')).rejects.toMatchObject({
      status: 422,
      message: 'title is required',
    })
  })
})

describe('apiFetch — 401 triggers exactly one refresh, then retries', () => {
  it('refreshes and replays the original request', async () => {
    setToken('stale')
    fetchMock
      .mockResolvedValueOnce(fail(401))            // original
      .mockResolvedValueOnce(ok({ refreshed: true })) // refresh endpoint
      .mockResolvedValueOnce(ok({ id: 'j1' }))     // retry

    await expect(apiFetch('/api/jobs')).resolves.toEqual({ id: 'j1' })
    expect(refreshCalls()).toBe(1)
  })

  it('coalesces concurrent 401s into a SINGLE refresh', async () => {
    setToken('stale')
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/auth/refresh')) return ok({ ok: true })
      // Every business request 401s once, then succeeds after the refresh.
      return refreshCalls() === 0 ? fail(401) : ok({ id: 'x' })
    })

    const results = await Promise.all([
      apiFetch('/api/jobs'),
      apiFetch('/api/candidates'),
      apiFetch('/api/interviews'),
    ])

    expect(results).toHaveLength(3)
    expect(refreshCalls(), 'each caller refreshed separately').toBe(1)
  })

  it('logs out when the refresh endpoint itself fails', async () => {
    setToken('stale')
    fetchMock
      .mockResolvedValueOnce(fail(401))
      .mockResolvedValueOnce(fail(401)) // refresh rejected

    await expect(apiFetch('/api/jobs')).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBeNull()
    expect(redirectedTo).toBe('/login')
  })

  it('logs out when the retry is still 401', async () => {
    setToken('stale')
    fetchMock
      .mockResolvedValueOnce(fail(401))
      .mockResolvedValueOnce(ok({ ok: true })) // refresh succeeded
      .mockResolvedValueOnce(fail(401))        // but the retry is still unauthorized

    await expect(apiFetch('/api/jobs')).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBeNull()
    expect(redirectedTo).toBe('/login')
  })
})

describe('apiFetch — a non-401 failure AFTER a successful refresh', () => {
  /**
   * The session is valid at this point: the refresh succeeded. A 403 or 422 on
   * the replayed request is an authorization or validation outcome, not an
   * expired session, and must not dump the user at /login.
   *
   * This matters more since the analytics routes started returning 403 to
   * interviewers — an interviewer whose token refreshed mid-session would
   * otherwise be logged out by a legitimate permission denial.
   */
  for (const status of [403, 422, 500]) {
    it(`surfaces ApiError(${status}) instead of logging out`, async () => {
      setToken('stale')
      fetchMock
        .mockResolvedValueOnce(fail(401))          // original
        .mockResolvedValueOnce(ok({ ok: true }))   // refresh OK
        .mockResolvedValueOnce(fail(status, 'real error')) // retry fails for another reason

      await expect(apiFetch('/api/jobs')).rejects.toMatchObject({
        status,
        message: 'real error',
      })
      expect(getToken(), `${status} after refresh cleared the token`).toBe('stale')
      expect(redirectedTo, `${status} after refresh redirected to login`).toBeNull()
    })
  }
})
