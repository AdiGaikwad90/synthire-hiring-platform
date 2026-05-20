export interface JWTPayload {
  sub: string          // user.id
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
  iat: number
  exp: number
}
