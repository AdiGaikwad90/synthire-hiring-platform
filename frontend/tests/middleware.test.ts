import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

/**
 * Route gating. This is a UX guard, not a security boundary: it trusts a
 * cookie anyone can edit, so it must never be relied on for authorization. The
 * backend's authMiddleware is the real gate. What is tested here is that the
 * routing decisions are right and that a hostile cookie cannot crash the edge.
 *
 * SYN-007: the gate reads `synthire_session` (the role, 30 days), not
 * `synthire_token`, which is the backend's 15-minute access cookie's name.
 */

const req = (path: string, session?: string, extraCookies: Record<string, string> = {}) => {
  const r = new NextRequest(new URL(`https://app.test${path}`))
  if (session !== undefined) r.cookies.set('synthire_session', session)
  for (const [name, value] of Object.entries(extraCookies)) r.cookies.set(name, value)
  return r
}

const recruiter = 'recruiter'
const interviewer = 'interviewer'

const location = (res: Response) => res.headers.get('location')

describe('public routes pass through', () => {
  for (const path of ['/', '/login', '/signup']) {
    it(`allows ${path} with no cookie`, () => {
      const res = middleware(req(path))
      expect(res.status).toBe(200)
      expect(location(res)).toBeNull()
    })
  }
})

describe('protected routes require a cookie', () => {
  const protectedPaths = [
    '/dashboard',
    '/jobs',
    '/jobs/abc',
    '/candidates',
    '/pipeline',
    '/analytics',
    '/settings',
    '/interviewer',
    '/interviews',
    '/interviews/xyz',
  ]

  for (const path of protectedPaths) {
    it(`redirects ${path} to /login when unauthenticated`, () => {
      const res = middleware(req(path))
      expect(location(res)).toContain('/login')
    })
  }

  it('preserves the original path in ?from= so login can return the user', () => {
    const res = middleware(req('/jobs/abc'))
    expect(location(res)).toContain('from=%2Fjobs%2Fabc')
  })

  // Prefix matching must not treat an unrelated path as protected.
  it('does not protect a path that merely starts with a protected segment', () => {
    const res = middleware(req('/jobsearch'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })
})

describe('role routing', () => {
  it('sends an interviewer away from recruiter routes', () => {
    expect(location(middleware(req('/dashboard', interviewer)))).toContain('/interviewer')
    expect(location(middleware(req('/analytics', interviewer)))).toContain('/interviewer')
  })

  it('sends a recruiter away from interviewer routes', () => {
    expect(location(middleware(req('/interviewer', recruiter)))).toContain('/dashboard')
  })

  it('lets each role reach its own routes', () => {
    expect(location(middleware(req('/dashboard', recruiter)))).toBeNull()
    expect(location(middleware(req('/interviewer', interviewer)))).toBeNull()
  })

  it('lets BOTH roles reach /interviews, which is shared', () => {
    expect(location(middleware(req('/interviews', recruiter)))).toBeNull()
    expect(location(middleware(req('/interviews', interviewer)))).toBeNull()
  })

  it('lets an admin reach recruiter and interviewer routes', () => {
    expect(location(middleware(req('/dashboard', 'admin')))).toBeNull()
    expect(location(middleware(req('/interviewer', 'admin')))).toBeNull()
  })
})

describe('the gate cookie is independent of the access cookie (SYN-007 regression)', () => {
  // Before the fix the gate read `synthire_token`. On localhost that name
  // belonged to the backend's HttpOnly cookie, which expires with the 15-minute
  // access token — so a signed-in user was sent to /login on the next click.
  it('lets a signed-in user through after the access cookie has expired', () => {
    const res = middleware(req('/dashboard', recruiter))  // no synthire_token at all
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })

  it('does not treat the backend access cookie as a session', () => {
    const res = middleware(req('/dashboard', undefined, { synthire_token: 'header.eyJyb2xlIjoicmVjcnVpdGVyIn0.sig' }))
    expect(location(res)).toContain('/login')
  })
})

// SYN-060: the middleware is the one place security headers are set, so every
// response it returns — pass-through AND redirect — must carry them.
describe('security headers on every response', () => {
  const cases: [string, ReturnType<typeof req>][] = [
    ['a public page', req('/login')],
    ['a protected page with a cookie', req('/dashboard', recruiter)],
    ['the redirect to /login', req('/jobs/abc')],
    ['the interviewer redirect away from recruiter pages', req('/dashboard', interviewer)],
    ['the redirect for an unusable cookie', req('/dashboard', 'garbage')],
  ]
  for (const [label, request] of cases) {
    it(`sets the CSP and framing headers on ${label}`, () => {
      const res = middleware(request)
      expect(res.headers.get('Content-Security-Policy'), label).toContain("frame-ancestors 'self'")
      expect(res.headers.get('X-Frame-Options'), label).toBe('SAMEORIGIN')
      expect(res.headers.get('X-Content-Type-Options'), label).toBe('nosniff')
    })
  }
})

describe('malformed and hostile cookies', () => {
  /**
   * The cookie is attacker-controlled. It must never throw — an exception here
   * fails the request at the edge for every route — and anything that is not a
   * real role is "not signed in", never a guess.
   */
  const hostile = ['superuser', 'RECRUITER', 'recruiter ', 'recruiter,admin', '1', 'true', '{"role":"recruiter"}', '../admin', '%00', 'a'.repeat(5000), '']

  for (const value of hostile) {
    it(`sends ${JSON.stringify(value).slice(0, 32)} to /login without throwing`, () => {
      let res!: Response
      expect(() => { res = middleware(req('/dashboard', value)) }).not.toThrow()
      expect(location(res)).toContain('/login')
    })
  }

  it('lets a forged role change which page renders — the API still enforces it', () => {
    // Anyone can write this cookie; it decides the page shell, nothing more.
    expect(location(middleware(req('/dashboard', 'recruiter')))).toBeNull()
  })
})
