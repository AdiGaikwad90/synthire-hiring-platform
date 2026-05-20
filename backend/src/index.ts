import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { authMiddleware } from './middleware/auth'
import type { Env } from './types/bindings'
import { processEmailQueue } from './services/email/queue'

// Route imports (implemented in later phases)
import authRoutes from './routes/auth'
import jobRoutes from './routes/jobs'
import candidateRoutes from './routes/candidates'
import interviewRoutes from './routes/interviews'
import interviewTypeRoutes from './routes/interview-types'
import analyticsRoutes from './routes/analytics'
import emailRoutes from './routes/email'
import settingsRoutes from './routes/settings'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', corsMiddleware)
app.onError(errorHandler)

// Public routes
app.route('/api/auth', authRoutes)

// Email public endpoints (webhook + unsubscribe — no JWT needed)
// These are handled inside emailRoutes with their own auth

// Protected routes (require JWT)
app.use('/api/jobs/*', authMiddleware)
app.use('/api/candidates/*', authMiddleware)
app.use('/api/interviews/*', authMiddleware)
app.use('/api/interview-types/*', authMiddleware)
app.use('/api/analytics/*', authMiddleware)
app.use('/api/settings/*', authMiddleware)
app.use('/api/email/logs', authMiddleware)
app.use('/api/email/preferences', authMiddleware)

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
