/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getToken,
  setToken,
  removeToken,
  markSession,
  hasSession,
  postLoginPath,
  getStoredUser,
  setStoredUser,
} from '@/lib/auth'
import type { StoredUser } from '@/lib/auth'

/**
 * Two stores that must move together: localStorage holds the access token
 * (read by apiFetch for the Bearer header), and the `synthire_session` cookie
 * holds only the ROLE so Next middleware can gate routes. A cookie left behind
 * after logout keeps middleware letting the user in.
 *
 * SYN-007: the gate cookie used to be called `synthire_token` — the same name
 * as the backend's HttpOnly 15-minute access cookie. On localhost the two
 * collided (cookies ignore the port, and script cannot overwrite an HttpOnly
 * cookie), so the gate disappeared 15 minutes after login. It also lasted 24 h
 * against a 30-day session.
 */

const cookieHas = (value: string) => document.cookie.includes(value)
/** A token shaped like the backend's: the role sits in the unverified payload. */
const jwt = (payload: unknown) => `header.${btoa(JSON.stringify(payload))}.sig`

const user: StoredUser = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Ada',
  role: 'recruiter',
  company_id: 'co1',
}

beforeEach(() => {
  localStorage.clear()
  // happy-dom keeps cookies between tests; expire anything left over.
  for (const c of document.cookie.split(';')) {
    document.cookie = `${c.split('=')[0].trim()}=; path=/; max-age=0`
  }
})

describe('setToken / getToken', () => {
  it('round-trips through localStorage', () => {
    setToken('tok123')
    expect(getToken()).toBe('tok123')
  })

  it('writes the gate cookie with the role only — never the token', () => {
    const token = jwt({ role: 'recruiter' })
    setToken(token)
    expect(cookieHas('synthire_session=recruiter')).toBe(true)
    expect(cookieHas(token), 'the token must not be readable from a cookie').toBe(false)
    expect(cookieHas('synthire_token='), 'must not reuse the backend cookie name').toBe(false)
  })

  it('returns null when nothing is stored', () => {
    expect(getToken()).toBeNull()
  })

  it('overwrites rather than appending on re-login', () => {
    setToken(jwt({ role: 'recruiter' }))
    const second = jwt({ role: 'interviewer' })
    setToken(second)
    expect(getToken()).toBe(second)
    expect(cookieHas('synthire_session=interviewer')).toBe(true)
    expect(cookieHas('synthire_session=recruiter')).toBe(false)
  })

  // The payload is not verified here; anything but a known role writes no gate.
  it('writes no gate cookie for a token without a usable role', () => {
    for (const token of ['not-a-jwt', 'a.b', jwt({ role: 'superuser' }), jwt({}), jwt(null), jwt('recruiter'), 'a.!!!.c', '']) {
      setToken(token)
      expect(hasSession(), `token=${token.slice(0, 24)}`).toBe(false)
    }
  })
})

describe('markSession / hasSession', () => {
  it('marks a session for each real role', () => {
    for (const role of ['recruiter', 'interviewer', 'admin'] as const) {
      markSession(role)
      expect(cookieHas(`synthire_session=${role}`), role).toBe(true)
      expect(hasSession(), role).toBe(true)
    }
  })

  it('reports no session when the cookie is absent', () => {
    expect(hasSession()).toBe(false)
  })

  // A hand-edited cookie must not count: the login page forwards only when the
  // gate will let the user through, or the two would bounce off each other.
  it('does not count a cookie holding anything but a real role', () => {
    for (const value of ['superuser', '1', 'true', 'recruiter2', 'RECRUITER']) {
      document.cookie = `synthire_session=${value}; path=/`
      expect(hasSession(), value).toBe(false)
    }
  })
})

describe('removeToken', () => {
  it('clears BOTH stores — a surviving cookie would keep middleware fooled', () => {
    setToken(jwt({ role: 'recruiter' }))
    setStoredUser(user)
    removeToken()

    expect(getToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
    // happy-dom keeps an expired cookie's name with an empty value, so assert on
    // the value; a real browser removes it (checked in the live pass).
    expect(hasSession()).toBe(false)
    expect(cookieHas('synthire_session=recruiter')).toBe(false)
  })

  it('also clears the pre-SYN-007 gate cookie left in upgraded browsers', () => {
    document.cookie = 'synthire_token=old-token; path=/'
    removeToken()
    expect(cookieHas('synthire_token=old-token')).toBe(false)
  })

  it('is safe to call when nothing is stored', () => {
    expect(() => removeToken()).not.toThrow()
    expect(getToken()).toBeNull()
  })
})

describe('stored user', () => {
  it('round-trips', () => {
    setStoredUser(user)
    expect(getStoredUser()).toEqual(user)
  })

  it('returns null when absent', () => {
    expect(getStoredUser()).toBeNull()
  })

  // The value is attacker-writable via devtools, and a throw here would break
  // every page that reads the session on mount.
  it('returns null instead of throwing on corrupt JSON', () => {
    localStorage.setItem('synthire_user', '{not json')
    expect(() => getStoredUser()).not.toThrow()
    expect(getStoredUser()).toBeNull()
  })

  it('does not throw on an empty or non-object value', () => {
    for (const raw of ['', 'null', '[]', '"str"', '42']) {
      localStorage.setItem('synthire_user', raw)
      expect(() => getStoredUser(), `raw=${raw}`).not.toThrow()
    }
  })
})

describe('postLoginPath', () => {
  it('returns the page the user was heading for', () => {
    expect(postLoginPath('/jobs/abc')).toBe('/jobs/abc')
    expect(postLoginPath('/candidates?stage=new')).toBe('/candidates?stage=new')
  })

  it('falls back to the dashboard when there is nowhere to return to', () => {
    for (const from of [null, undefined, '']) expect(postLoginPath(from)).toBe('/dashboard')
  })

  // ?from= is attacker-controlled (a crafted login link). These all start with
  // "/" or look like paths, but would leave the site.
  it('refuses anything that is not a path on this site', () => {
    for (const from of ['//evil.io', '//evil.io/dashboard', '/\\evil.io', 'https://evil.io', 'javascript:alert(1)', 'dashboard', ' /dashboard']) {
      expect(postLoginPath(from), `"${from}" must be refused`).toBe('/dashboard')
    }
  })
})
