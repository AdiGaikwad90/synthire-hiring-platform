import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { hash, compare } from 'bcryptjs'
import type { Env } from '../types/bindings'
import { loginSchema, signupSchema, apiResponse, AppError } from '../types/api'
import {
  signToken,
  authMiddleware,
  generateRefreshToken,
  hashToken,
  buildAccessCookie,
  buildRefreshCookie,
  clearAccessCookie,
  clearRefreshCookie,
} from '../middleware/auth'
import {
  findUserByEmail,
  findUserById,
  toPublicUser,
} from '../db/queries/users'
import { nanoid } from 'nanoid'

const router = new Hono<{ Bindings: Env }>()

// ── helpers ───────────────────────────────────────────────────────────────────

function isSecure(env: Env): boolean {
  return env.ENVIRONMENT === 'production'
}

async function insertRefreshToken(
  db: Env['DB'],
  userId: string,
  tokenHash: string,
  expirySeconds: number
): Promise<string> {
  const id = nanoid()
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, userId, tokenHash, now + expirySeconds, now)
    .run()
  return id
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────

router.post('/signup', zValidator('json', signupSchema), async (c) => {
  const { email, password, name, company_name } = c.req.valid('json')
  const normalizedEmail = email.trim().toLowerCase()

  // Check if email already taken
  const existing = await findUserByEmail(c.env.DB, normalizedEmail)
  if (existing) {
    throw new AppError('Email already registered', 409)
  }

  // Generate IDs and hash before batch
  const companyId = nanoid()
  const userId = nanoid()
  const unsubscribeToken = nanoid(32)
  const passwordHash = await hash(password, 10)

  // Create company + user + email preferences atomically
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO companies (id, name) VALUES (?, ?)').bind(companyId, company_name),
    c.env.DB.prepare(
      'INSERT INTO users (id, company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, companyId, normalizedEmail, passwordHash, name, 'recruiter'),
    c.env.DB.prepare(
      'INSERT INTO email_preferences (user_id, unsubscribe_token) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING'
    ).bind(userId, unsubscribeToken),
  ])

  const company = { id: companyId, name: company_name, plan: 'free', created_at: new Date().toISOString() }
  const user = { id: userId, company_id: companyId, email: normalizedEmail, password_hash: passwordHash, name, role: 'recruiter', created_at: new Date().toISOString() }

  // Issue access token
  const accessExpiry = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const accessToken = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'recruiter' | 'interviewer' | 'admin',
      company_id: user.company_id,
    },
    c.env.JWT_SECRET,
    accessExpiry
  )

  // Issue refresh token
  const refreshExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY_SECONDS, 10)
  const refreshToken = generateRefreshToken()
  const refreshHash = await hashToken(refreshToken)
  await insertRefreshToken(c.env.DB, user.id, refreshHash, refreshExpiry)

  const secure = isSecure(c.env)
  c.header('Set-Cookie', buildAccessCookie(accessToken, accessExpiry, secure), { append: true })
  c.header('Set-Cookie', buildRefreshCookie(refreshToken, refreshExpiry, secure), { append: true })

  return c.json(
    apiResponse({
      user: toPublicUser(user),
      company: { id: company.id, name: company.name },
    }),
    201
  )
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  // Per-email rate limiting: 5 failed attempts per 60s
  const emailNorm = email.trim().toLowerCase()
  const rlKey = `rl:login:${emailNorm}`
  const rlRaw = await c.env.KV_CACHE.get(rlKey)
  const attempts = rlRaw ? parseInt(rlRaw, 10) : 0
  if (attempts >= 5) {
    throw new AppError('Too many login attempts. Please try again in a minute.', 429)
  }

  const user = await findUserByEmail(c.env.DB, emailNorm)
  if (!user) {
    await c.env.KV_CACHE.put(rlKey, String(attempts + 1), { expirationTtl: 60 })
    throw new AppError('Invalid email or password', 401)
  }

  const passwordMatch = await compare(password, user.password_hash)
  if (!passwordMatch) {
    await c.env.KV_CACHE.put(rlKey, String(attempts + 1), { expirationTtl: 60 })
    throw new AppError('Invalid email or password', 401)
  }

  await c.env.KV_CACHE.delete(rlKey)

  // Issue access token
  const accessExpiry = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const accessToken = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'recruiter' | 'interviewer' | 'admin',
      company_id: user.company_id,
    },
    c.env.JWT_SECRET,
    accessExpiry
  )

  // Issue refresh token
  const refreshExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY_SECONDS, 10)
  const refreshToken = generateRefreshToken()
  const refreshHash = await hashToken(refreshToken)
  await insertRefreshToken(c.env.DB, user.id, refreshHash, refreshExpiry)

  const secure = isSecure(c.env)
  c.header('Set-Cookie', buildAccessCookie(accessToken, accessExpiry, secure), { append: true })
  c.header('Set-Cookie', buildRefreshCookie(refreshToken, refreshExpiry, secure), { append: true })

  return c.json(
    apiResponse({
      user: toPublicUser(user),
    })
  )
})

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

router.post('/refresh', async (c) => {
  // Extract refresh token from cookie
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)synthire_refresh=([^;]+)/)
  if (!match) {
    throw new AppError('No refresh token', 401)
  }
  const rawToken = match[1]
  const tokenHash = await hashToken(rawToken)

  const now = Math.floor(Date.now() / 1000)

  // Look up token in DB
  const row = await c.env.DB
    .prepare(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1'
    )
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string; expires_at: number }>()

  if (!row) {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  const user = await findUserById(c.env.DB, row.user_id)
  if (!user) {
    throw new AppError('User not found', 401)
  }

  // Revoke old refresh token
  await c.env.DB
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
    .bind(now, row.id)
    .run()

  // Issue new access token
  const accessExpiry = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const accessToken = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'recruiter' | 'interviewer' | 'admin',
      company_id: user.company_id,
    },
    c.env.JWT_SECRET,
    accessExpiry
  )

  // Issue new refresh token (rotation)
  const refreshExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY_SECONDS, 10)
  const newRefreshToken = generateRefreshToken()
  const newRefreshHash = await hashToken(newRefreshToken)
  await insertRefreshToken(c.env.DB, user.id, newRefreshHash, refreshExpiry)

  const secure = isSecure(c.env)
  c.header('Set-Cookie', buildAccessCookie(accessToken, accessExpiry, secure), { append: true })
  c.header('Set-Cookie', buildRefreshCookie(newRefreshToken, refreshExpiry, secure), { append: true })

  return c.json(apiResponse({ user: toPublicUser(user) }))
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post('/logout', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)synthire_refresh=([^;]+)/)

  if (match) {
    const tokenHash = await hashToken(match[1])
    const now = Math.floor(Date.now() / 1000)
    // Best-effort revocation — ignore if token not found
    await c.env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(now, tokenHash)
      .run()
  }

  const secure = isSecure(c.env)
  c.header('Set-Cookie', clearAccessCookie(secure), { append: true })
  c.header('Set-Cookie', clearRefreshCookie(secure), { append: true })

  return c.json(apiResponse({ message: 'Logged out successfully' }))
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.use('/me', authMiddleware)

router.get('/me', async (c) => {
  const jwtPayload = c.get('user')  // set by authMiddleware
  const user = await findUserById(c.env.DB, jwtPayload.sub)
  if (!user) {
    throw new AppError('User not found', 404)
  }
  return c.json(apiResponse(toPublicUser(user)))
})

export default router
