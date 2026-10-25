/** Every role the product has. Anything else in a token is refused by authMiddleware. */
export const ROLES = ['recruiter', 'interviewer', 'admin'] as const
export type Role = (typeof ROLES)[number]

export interface JWTPayload {
  sub: string          // user.id
  email: string
  name: string
  role: Role
  company_id: string
  iat: number
  exp: number
}
