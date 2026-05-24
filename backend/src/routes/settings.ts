import { Hono } from 'hono'
import type { Env } from '../types/bindings'
import { authMiddleware } from '../middleware/auth'

const router = new Hono<{ Bindings: Env }>()

router.use('*', authMiddleware)

router.get('/', (c) => c.json({ message: 'TODO: implement' }))

export default router
