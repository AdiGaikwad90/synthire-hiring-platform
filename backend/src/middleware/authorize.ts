import type { MiddlewareHandler } from 'hono'
import { AppError } from '../types/api'
import { ROLES, type JWTPayload, type Role } from '../types/auth'

/**
 * Role guards.
 *
 * These exist so the authorization rule lives in ONE place. Before this, the
 * interviewer check was copy-pasted across routes with three different
 * messages, and five analytics routes had simply been missed — company-wide
 * hiring analytics were reachable by a role scoped to its own interviews.
 *
 * Every guard is an allowlist: recruiters and admins pass, an interviewer
 * passes only where scoped to their own interviews, and any other role is
 * denied. Reach for these instead of writing `if (user.role === ...)` again.
 */

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

const isStaff = (user: JWTPayload) => user.role === 'recruiter' || user.role === 'admin'

/** Recruiters and admins only. Interviewers are scoped to their own interviews. */
export function requireRecruiter(user: JWTPayload): void {
  if (!isStaff(user)) {
    throw new AppError('Forbidden: insufficient permissions', 403)
  }
}

/**
 * Route-middleware form of requireRecruiter. Put it FIRST on a route, before
 * any validator: a refused caller never gets a 422 that reveals the request
 * schema, and nothing — body parsing, uploads, writes — runs for them.
 */
export const recruiterOnly: MiddlewareHandler = async (c, next) => {
  requireRecruiter(c.get('user'))
  await next()
}

/** Admins only. */
export function requireAdmin(user: JWTPayload): void {
  if (user.role !== 'admin') {
    throw new AppError('Forbidden: admin only', 403)
  }
}

/**
 * An interviewer may only touch their own interview. Recruiters and admins
 * see all of their company's.
 */
export function requireOwnInterview(user: JWTPayload, interviewerId: string | null): void {
  if (isStaff(user)) return
  if (user.role === 'interviewer' && interviewerId !== null && interviewerId === user.sub) return
  throw new AppError('Forbidden: you can only access your own interviews', 403)
}

/**
 * Reads an interviewer needs to run an interview: the candidate and job of an
 * interview assigned to them. Recruiters and admins pass without the lookup.
 * Call it AFTER the company-scoped fetch, so another company's id stays a 404
 * and only "exists, but not yours" is a 403.
 */
export async function requireInterviewAccess(
  user: JWTPayload,
  isAssigned: () => Promise<boolean>,
): Promise<void> {
  if (isStaff(user)) return
  if (user.role === 'interviewer' && (await isAssigned())) return
  throw new AppError('Forbidden: you can only access candidates and jobs from your own interviews', 403)
}
