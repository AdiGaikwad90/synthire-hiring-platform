import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { hash, compare } from 'bcryptjs'
import type { Env } from '../types/bindings'
import { loginSchema, signupSchema, apiResponse, AppError } from '../types/api'
import { signToken, authMiddleware } from '../middleware/auth'
import {
  createCompany,
  createUser,
  findUserByEmail,
  findUserById,
  toPublicUser,
  createEmailPreferences,
} from '../db/queries/users'

const router = new Hono<{ Bindings: Env }>()

// POST /api/auth/signup
router.post('/signup', zValidator('json', signupSchema), async (c) => {
  const { email, password, name, company_name } = c.req.valid('json')

  // Check if email already taken
  const existing = await findUserByEmail(c.env.DB, email)
  if (existing) {
    throw new AppError('Email already registered', 409)
  }

  // Create company + user atomically
  const company = await createCompany(c.env.DB, company_name)
  const passwordHash = await hash(password, 10)
  const user = await createUser(c.env.DB, {
    company_id: company.id,
    email,
    password_hash: passwordHash,
    name,
    role: 'recruiter',
  })

  // Create default email preferences
  await createEmailPreferences(c.env.DB, user.id)

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

  const user = await findUserByEmail(c.env.DB, email)
  if (!user) {
    throw new AppError('Invalid email or password', 401)
  }

  const passwordMatch = await compare(password, user.password_hash)
  if (!passwordMatch) {
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
