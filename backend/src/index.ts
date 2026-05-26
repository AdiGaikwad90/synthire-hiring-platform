import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { loggerMiddleware } from './middleware/logger'
import { rateLimitMiddleware } from './middleware/rate-limit'
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
import healthRoutes from './routes/health'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', loggerMiddleware)
app.use('*', corsMiddleware)
app.use('/api/*', rateLimitMiddleware)
app.onError(errorHandler)

// Public routes
app.route('/api/auth', authRoutes)

// Protected routes — authMiddleware is registered INSIDE each route file
// (Hono's `path/*` matcher does not match the exact `path`, which silently
// bypassed auth on list endpoints like GET /api/candidates. Per-router
// registration via `router.use('*', authMiddleware)` is path-agnostic.)
app.route('/api/jobs', jobRoutes)
app.route('/api/candidates', candidateRoutes)
app.route('/api/interviews', interviewRoutes)
app.route('/api/interview-types', interviewTypeRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/settings', settingsRoutes)

// Health check
app.route('/health', healthRoutes)

// Export for Workers + Scheduled trigger
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      processEmailQueue(env).catch((err) => {
        console.error('[scheduled] processEmailQueue failed', err)
        // Sentry capture would go here when SENTRY_DSN is configured:
        // if (env.SENTRY_DSN) createSentry(new Request('https://worker/scheduled'), ctx, env.SENTRY_DSN).captureException(err)
      }),
    )
  },
}
