import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { rateLimitMiddleware } from './middleware/rate-limit'
import type { Env } from './types/bindings'
import { processEmailQueue } from './services/email/queue'

// Route imports (implemented in later phases)
import authRoutes from './routes/auth'
import jobRoutes from './routes/jobs'
import jobsParseRoutes from './routes/jobs-parse'
import candidateRoutes from './routes/candidates'
import interviewRoutes from './routes/interviews'
import interviewTypeRoutes from './routes/interview-types'
import analyticsRoutes from './routes/analytics'
import emailRoutes from './routes/email'
import settingsRoutes from './routes/settings'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', corsMiddleware)
app.use('/api/*', rateLimitMiddleware)
app.onError(errorHandler)

// Public routes
app.route('/api/auth', authRoutes)

// Protected routes — authMiddleware is registered INSIDE each route file
// (Hono's `path/*` matcher does not match the exact `path`, which silently
// bypassed auth on list endpoints like GET /api/candidates. Per-router
// registration via `router.use('*', authMiddleware)` is path-agnostic.)
app.route('/api/jobs/parse-jd', jobsParseRoutes)
app.route('/api/jobs', jobRoutes)
app.route('/api/candidates', candidateRoutes)
app.route('/api/interviews', interviewRoutes)
app.route('/api/interview-types', interviewTypeRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/settings', settingsRoutes)

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'synthire-backend',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  })
)

// Export for Workers + Scheduled trigger
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processEmailQueue(env))
  },
}
