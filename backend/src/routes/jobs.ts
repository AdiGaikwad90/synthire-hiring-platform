import { Hono } from 'hono'
import type { Env } from '../types/bindings'

const router = new Hono<{ Bindings: Env }>()

router.get('/', (c) => c.json({ message: 'TODO: implement' }))

export default router
