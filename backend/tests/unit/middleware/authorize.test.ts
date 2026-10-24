import { describe, it, expect, vi } from 'vitest'
import type { Context } from 'hono'
import {
  requireRecruiter,
  requireAdmin,
  requireOwnInterview,
  requireInterviewAccess,
  recruiterOnly,
  isRole,
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

  // It used to deny only role === 'interviewer', so any other value fell through
  // to "recruiter" access. An allowlist denies what it doesn't recognise.
  it('403s an unknown role even when it matches the assignee', () => {
    for (const role of ['', 'guest', 'Interviewer', 'superuser']) {
      expect(
        () => requireOwnInterview(user({ role: role as JWTPayload['role'], sub: 'usr_1' }), 'usr_1'),
        `role "${role}" must be denied`,
      ).toThrowError(expect.objectContaining({ statusCode: 403 }))
    }
  })
})

describe('requireInterviewAccess — happy path and variants', () => {
  it('lets recruiters and admins through without looking up an assignment', async () => {
    for (const role of ['recruiter', 'admin'] as const) {
      const isAssigned = vi.fn(async () => false)
      await expect(requireInterviewAccess(user({ role }), isAssigned), role).resolves.toBeUndefined()
      expect(isAssigned, `${role} must not cost a lookup`).not.toHaveBeenCalled()
    }
  })

  it('lets an interviewer through when they have an interview for the record', async () => {
    await expect(requireInterviewAccess(user({ role: 'interviewer' }), async () => true)).resolves.toBeUndefined()
  })
})

describe('requireInterviewAccess — error contract', () => {
  it('403s an interviewer with no interview for the record', async () => {
    await expect(requireInterviewAccess(user({ role: 'interviewer' }), async () => false)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('403s an unknown role without looking up an assignment', async () => {
    const isAssigned = vi.fn(async () => true)
    await expect(
      requireInterviewAccess(user({ role: 'guest' as JWTPayload['role'] }), isAssigned),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(isAssigned).not.toHaveBeenCalled()
  })

  it('propagates a failed lookup instead of granting access', async () => {
    const boom = new Error('D1 unavailable')
    await expect(requireInterviewAccess(user({ role: 'interviewer' }), async () => { throw boom })).rejects.toBe(boom)
  })
})

describe('recruiterOnly — route middleware', () => {
  const ctx = (role: string) => ({ get: () => user({ role: role as JWTPayload['role'] }) }) as unknown as Context

  it('calls the next handler for recruiters and admins', async () => {
    for (const role of ['recruiter', 'admin']) {
      const next = vi.fn(async () => {})
      await recruiterOnly(ctx(role), next)
      expect(next, role).toHaveBeenCalledOnce()
    }
  })

  // It runs before validators and handlers, so a refusal must stop the chain:
  // nothing after it may parse the body or write.
  it('403s an interviewer or unknown role without calling the next handler', async () => {
    for (const role of ['interviewer', 'guest', '']) {
      const next = vi.fn(async () => {})
      await expect(recruiterOnly(ctx(role), next), `role "${role}"`).rejects.toMatchObject({ statusCode: 403 })
      expect(next, `role "${role}" reached the handler`).not.toHaveBeenCalled()
    }
  })
})

describe('isRole', () => {
  it('accepts exactly the three roles the product has', () => {
    for (const role of ['recruiter', 'interviewer', 'admin']) expect(isRole(role), role).toBe(true)
  })

  it('rejects anything else, including wrong case and non-strings', () => {
    for (const value of ['', 'guest', 'Recruiter', 'ADMIN', ' admin', null, undefined, 1, {}, ['admin']]) {
      expect(isRole(value), `${JSON.stringify(value)} must be rejected`).toBe(false)
    }
  })
})
