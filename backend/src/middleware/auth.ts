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

  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret || jwtSecret.length < 32) {
    return c.json({ success: false, error: 'Server misconfiguration', data: null, timestamp: new Date().toISOString() }, 500)
  }

  const token = authHeader.slice(7)
  const secret = new TextEncoder().encode(jwtSecret)

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'https://api.synthire.io',
      audience: 'https://app.synthire.io',
      clockTolerance: 5,
    })
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
    .setIssuer('https://api.synthire.io')
    .setAudience('https://app.synthire.io')
    .setExpirationTime(`${expirySeconds}s`)
    .sign(new TextEncoder().encode(secret))
}
