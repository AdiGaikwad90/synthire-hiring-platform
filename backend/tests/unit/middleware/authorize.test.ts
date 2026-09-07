import { describe, it, expect } from 'vitest'
import {
  requireRecruiter,
  requireAdmin,
  requireOwnInterview,
} from '../../../src/middleware/authorize'
import type { JWTPayload } from '../../../src/types/auth'

/**
 * Tier A. These are the authorization rules for the whole API, so they get the
 * full matrix — including that an unexpected role value is DENIED rather than
 * allowed through (fail-closed).
 */

const user = (over: Partial<JWTPayload> = {}): JWTPayload =>
  ({
    sub: 'usr_1',
    email: 'a@b.c',
    name: 'A',
    role: 'recruiter',
    company_id: 'co_1',
    iat: 0,
    exp: 0,
    ...over,
  }) as JWTPayload

describe('requireRecruiter', () => {
  it('allows a recruiter', () => {
    expect(() => requireRecruiter(user({ role: 'recruiter' }))).not.toThrow()
  })

  it('allows an admin', () => {
    expect(() => requireRecruiter(user({ role: 'admin' }))).not.toThrow()
  })

  it('403s an interviewer', () => {
    expect(() => requireRecruiter(user({ role: 'interviewer' }))).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  // Fail-closed: an allowlist, not a denylist. A role added later (or a
  // corrupted token claim) must be rejected until explicitly permitted.
  it('403s an unknown role rather than letting it through', () => {
    for (const role of ['', 'guest', 'Recruiter', 'ADMIN', 'superuser']) {
      expect(
        () => requireRecruiter(user({ role: role as JWTPayload['role'] })),
        `role "${role}" must be denied`,
      ).toThrowError(expect.objectContaining({ statusCode: 403 }))
    }
  })
})

describe('requireAdmin', () => {
  it('allows only an admin', () => {
    expect(() => requireAdmin(user({ role: 'admin' }))).not.toThrow()
  })

  it('403s a recruiter and an interviewer', () => {
    for (const role of ['recruiter', 'interviewer'] as const) {
      expect(() => requireAdmin(user({ role })), role).toThrowError(
        expect.objectContaining({ statusCode: 403 }),
      )
    }
  })
})

describe('requireOwnInterview', () => {
  it('allows an interviewer their own interview', () => {
    expect(() => requireOwnInterview(user({ role: 'interviewer', sub: 'usr_1' }), 'usr_1')).not.toThrow()
  })

  it("403s an interviewer on someone else's interview", () => {
    expect(() => requireOwnInterview(user({ role: 'interviewer', sub: 'usr_1' }), 'usr_2')).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('403s an interviewer on an unassigned interview', () => {
    expect(() => requireOwnInterview(user({ role: 'interviewer', sub: 'usr_1' }), null)).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('lets recruiters and admins through regardless of assignee', () => {
    for (const role of ['recruiter', 'admin'] as const) {
      expect(() => requireOwnInterview(user({ role, sub: 'usr_1' }), 'usr_2'), role).not.toThrow()
      expect(() => requireOwnInterview(user({ role, sub: 'usr_1' }), null), role).not.toThrow()
    }
  })
})
