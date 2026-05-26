import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { hash, compare } from 'bcryptjs'
import type { Env } from '../types/bindings'
import { loginSchema, signupSchema, apiResponse, AppError } from '../types/api'
import { signToken, authMiddleware } from '../middleware/auth'
import {
  findUserByEmail,
  findUserById,
  toPublicUser,
} from '../db/queries/users'
import { nanoid } from 'nanoid'

const router = new Hono<{ Bindings: Env }>()

// POST /api/auth/signup
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

  // Issue JWT
  const expirySeconds = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const token = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'recruiter' | 'interviewer' | 'admin',
      company_id: user.company_id,
    },
    c.env.JWT_SECRET,
    expirySeconds
  )

  return c.json(
    apiResponse({
      token,
      user: toPublicUser(user),
      company: { id: company.id, name: company.name },
    }),
    201
  )
})

// POST /api/auth/login
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

  const expirySeconds = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const token = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'recruiter' | 'interviewer' | 'admin',
      company_id: user.company_id,
    },
    c.env.JWT_SECRET,
    expirySeconds
  )

  await c.env.KV_CACHE.delete(rlKey)

  return c.json(
    apiResponse({
      token,
      user: toPublicUser(user),
    })
  )
})

// POST /api/auth/logout
router.post('/logout', async (c) => {
  // JWT is stateless — client deletes the token
  return c.json(apiResponse({ message: 'Logged out successfully' }))
})

// GET /api/auth/me  (authMiddleware applied to this specific path)
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
