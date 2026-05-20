import { createMiddleware } from 'hono/factory'
import { jwtVerify, SignJWT } from 'jose'
import type { Env } from '../types/bindings'
import type { JWTPayload } from '../types/auth'
import { AppError } from '../types/api'

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload
  }
}

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Missing authorization token', 401)
  }

  const token = authHeader.slice(7)
  const secret = new TextEncoder().encode(c.env.JWT_SECRET)

  try {
    const { payload } = await jwtVerify(token, secret)
    c.set('user', payload as unknown as JWTPayload)
  } catch {
    throw new AppError('Invalid or expired token', 401)
  }

  await next()
})

export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expirySeconds: number
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(new TextEncoder().encode(secret))
}
