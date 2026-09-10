import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

/**
 * Route gating. This is a UX guard, not a security boundary — it reads the JWT
 * WITHOUT verifying it, so it must never be relied on for authorization. The
 * backend's authMiddleware is the real gate. What is tested here is that the
 * routing decisions are right and that a hostile cookie cannot crash the edge.
 */

const jwt = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`

const req = (path: string, token?: string) => {
  const r = new NextRequest(new URL(`https://app.test${path}`))
  if (token) r.cookies.set('synthire_token', token)
  return r
}

const recruiter = jwt({ role: 'recruiter' })
const interviewer = jwt({ role: 'interviewer' })

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
})

describe('malformed and hostile cookies', () => {
  /**
   * The payload is attacker-controlled: this decodes base64 without verifying
   * the signature. It must never throw — an exception here fails the request at
   * the edge for every route.
   */
  const hostile = [
    'not-a-jwt',
    'a.b',
    'a..c',
    'a.!!!not-base64!!!.c',
    `header.${Buffer.from('not json').toString('base64')}.sig`,
    `header.${Buffer.from('null').toString('base64')}.sig`,
    `header.${Buffer.from('[]').toString('base64')}.sig`,
    '...',
    '',
  ]

  for (const token of hostile) {
    it(`does not throw on ${JSON.stringify(token).slice(0, 32)}`, () => {
      expect(() => middleware(req('/dashboard', token))).not.toThrow()
    })
  }

  it('falls through to the backend rather than guessing when the payload is unreadable', () => {
    // A malformed token is deliberately let through — the API rejects it. The
    // point is that the edge does not 500.
    const res = middleware(req('/dashboard', 'garbage'))
    expect(res.status).toBe(200)
  })

  it('ignores a forged role claim for routing only — the API still enforces it', () => {
    // Anyone can craft this; it changes which page renders, nothing more.
    const forged = jwt({ role: 'recruiter' })
    expect(location(middleware(req('/dashboard', forged)))).toBeNull()
  })
})
