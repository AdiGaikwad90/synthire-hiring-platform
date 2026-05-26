import { Hono } from 'hono'
import type { Env } from '../types/bindings'

const router = new Hono<{ Bindings: Env }>()

router.get('/', async (c) => {
  const checks: Record<string, boolean> = {
    db: false,
    kv: false,
  }

  try {
    await c.env.DB.prepare('SELECT 1').first()
    checks.db = true
  } catch {
    // DB unavailable
  }

  try {
    await c.env.KV_CACHE.get('_health_ping')
    checks.kv = true
  } catch {
    // KV unavailable
  }

  const healthy = Object.values(checks).every(Boolean)
  return c.json({
    ok: healthy,
    checks,
    uptime: Date.now(),
    version: '1.0.0',
  }, healthy ? 200 : 503)
})

export default router
