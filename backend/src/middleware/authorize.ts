import { AppError } from '../types/api'
import type { JWTPayload } from '../types/auth'

/**
 * Role guards.
 *
 * These exist so the authorization rule lives in ONE place. Before this, the
 * interviewer check was copy-pasted across routes with three different
 * messages, and five analytics routes had simply been missed — company-wide
 * hiring analytics were reachable by a role scoped to its own interviews.
 *
 * Reach for these instead of writing `if (user.role === 'interviewer')` again.
 */

/** Recruiters and admins only. Interviewers are scoped to their own interviews. */
export function requireRecruiter(user: JWTPayload): void {
  if (user.role !== 'recruiter' && user.role !== 'admin') {
    throw new AppError('Forbidden: insufficient permissions', 403)
  }
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
  if (user.role === 'interviewer' && interviewerId !== user.sub) {
    throw new AppError('Forbidden: you can only access your own interviews', 403)
  }
}
