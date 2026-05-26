import { createMiddleware } from 'hono/factory'
import { jwtVerify, SignJWT } from 'jose'
import { nanoid } from 'nanoid'
import type { Env } from '../types/bindings'
import type { JWTPayload } from '../types/auth'
import { AppError } from '../types/api'

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload
  }
}

export const ISS = 'https://api.synthire.io'
export const AUD = 'https://app.synthire.io'

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret || jwtSecret.length < 32) {
    return c.json({ success: false, error: 'Server misconfiguration', data: null, timestamp: new Date().toISOString() }, 500)
  }

  // Prefer HttpOnly cookie, fall back to Authorization: Bearer header
  const cookieHeader = c.req.header('Cookie') ?? ''
  let token: string | null = null

  const cookieMatch = cookieHeader.match(/(?:^|;\s*)synthire_token=([^;]+)/)
  if (cookieMatch) {
    token = cookieMatch[1]
  } else {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }
  }

  if (!token) {
    throw new AppError('Missing authorization token', 401)
  }

  const secret = new TextEncoder().encode(jwtSecret)

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISS,
      audience: AUD,
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
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(`${expirySeconds}s`)
    .sign(new TextEncoder().encode(secret))
}

export function generateRefreshToken(): string {
  return nanoid(64)
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function buildAccessCookie(token: string, maxAge: number, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `synthire_token=${token}; HttpOnly${secureFlag}; SameSite=None; Path=/; Max-Age=${maxAge}`
}

export function buildRefreshCookie(token: string, maxAge: number, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `synthire_refresh=${token}; HttpOnly${secureFlag}; SameSite=None; Path=/api/auth; Max-Age=${maxAge}`
}

export function clearAccessCookie(secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `synthire_token=; HttpOnly${secureFlag}; SameSite=None; Path=/; Max-Age=0`
}

export function clearRefreshCookie(secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `synthire_refresh=; HttpOnly${secureFlag}; SameSite=None; Path=/api/auth; Max-Age=0`
}
