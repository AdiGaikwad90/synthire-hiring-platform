import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { Env } from '../types/bindings'
import { apiResponse, paginatedResponse, AppError, updateEmailPreferencesSchema } from '../types/api'
import { authMiddleware } from '../middleware/auth'
import {
  updateEmailLogStatus,
  listEmailLogs,
  getUserEmailPreferences,
  updateUserEmailPreferences,
} from '../db/queries/email'
import { escapeHtml } from '../utils/html'

const router = new Hono<{ Bindings: Env }>()

// POST /api/email/resend-callback — public Resend webhook
router.post('/resend-callback', async (c) => {
  const rawBody = await c.req.text()

  const svixId = c.req.header('svix-id') ?? ''
  const svixTimestamp = c.req.header('svix-timestamp') ?? ''
  const svixSignature = c.req.header('svix-signature') ?? ''

  const payload = `${svixId}.${svixTimestamp}.${rawBody}`

  // Strip whsec_ prefix and base64-decode to get raw secret bytes (Svix format)
  const secretStr = c.env.RESEND_WEBHOOK_SECRET.startsWith('whsec_')
    ? c.env.RESEND_WEBHOOK_SECRET.slice(6)
    : c.env.RESEND_WEBHOOK_SECRET
  const secretBytes = Uint8Array.from(atob(secretStr), ch => ch.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  // svix-signature may contain multiple signatures: "v1,<base64> v1,<base64>"
  // Verify each one against the payload using the Web Crypto verify API
  const signatures = svixSignature.split(' ')
  let valid = false
  for (const s of signatures) {
    const base64Part = s.startsWith('v1,') ? s.slice(3) : s
    let sigBytes: Uint8Array
    try {
      sigBytes = Uint8Array.from(atob(base64Part), ch => ch.charCodeAt(0))
    } catch {
      continue
    }
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
    if (ok) { valid = true; break }
  }

  if (!valid) {
    console.warn('[resend-webhook] Signature verification failed', { svixId, svixTimestamp })
    return c.json({ error: 'Invalid signature' }, 401)
  }

  interface WebhookPayload {
    type: string
    data: {
      email_id: string
      to: string[]
      created_at: string
    }
  }

  let body: WebhookPayload
  try {
    body = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }
  const { type, data } = body
  const now = new Date().toISOString()

  let status: string
  let timestampField: Record<string, string> = {}

  switch (type) {
    case 'email.delivered':
      status = 'delivered'
      timestampField = { delivered_at: now }
      break
    case 'email.bounced':
      status = 'bounced'
      timestampField = { bounced_at: now }
      break
    case 'email.complained':
      status = 'complained'
      timestampField = { complained_at: now }
      break
    default:
      // Acknowledge but don't process unknown events
      return c.json({ received: true })
  }

  await updateEmailLogStatus(c.env.DB, data.email_id, { status, ...timestampField })

  return c.json({ received: true })
})

// GET /api/email/unsubscribe?token=X — show confirmation page (CSRF protection)
router.get('/unsubscribe', async (c) => {
  const token = c.req.query('token')

  if (!token) {
    return new Response(
      `<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Invalid unsubscribe link</h2>
        <p>This unsubscribe link is missing a token.</p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:400px;margin:40px auto;text-align:center">
<h2>Unsubscribe from Synthire emails?</h2>
<p>You will no longer receive notifications.</p>
<form method="POST" action="/api/email/unsubscribe">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <button type="submit" style="background:#ef4444;color:white;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:16px">Confirm Unsubscribe</button>
</form>
<p><small><a href="/">Cancel</a></small></p>
</body></html>
`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// POST /api/email/unsubscribe — perform the actual unsubscribe
router.post('/unsubscribe', async (c) => {
  const formData = await c.req.formData()
  const token = formData.get('token') as string | null

  if (!token) {
    return new Response(
      `<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Invalid unsubscribe request</h2>
        <p>Token is missing.</p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const prefs = await c.env.DB.prepare(
    'SELECT * FROM email_preferences WHERE unsubscribe_token = ?'
  )
    .bind(token)
    .first<{ user_id: string; unsubscribed_at: string | null }>()

  if (!prefs) {
    return new Response(
      `<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Invalid unsubscribe link</h2>
        <p>This unsubscribe link is invalid or has already been used.</p>
      </body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Check replay
  const replayKey = `unsub_used:${token}`
  const alreadyUsed = await c.env.KV_CACHE.get(replayKey)
  if (alreadyUsed) {
    return new Response('This unsubscribe link has already been used.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  await c.env.DB.prepare(
    "UPDATE email_preferences SET unsubscribed_at = datetime('now') WHERE unsubscribe_token = ?"
  )
    .bind(token)
    .run()

  // Mark token as used (90 days)
  await c.env.KV_CACHE.put(replayKey, '1', { expirationTtl: 7776000 })

  return new Response(
    `<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
      <h2>You've been unsubscribed</h2>
      <p>You'll no longer receive email notifications from Synthire.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
})

// Protected routes — auth required
router.use('/logs', authMiddleware)
router.use('/preferences', authMiddleware)

// GET /api/email/logs
router.get(
  '/logs',
  zValidator(
    'query',
    z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
  ),
  async (c) => {
    const user = c.get('user')

    if (user.role === 'interviewer') {
      throw new AppError('Forbidden', 403)
    }

    const { type, status, page, limit } = c.req.valid('query')

    const result = await listEmailLogs(c.env.DB, user.company_id, {
      type,
      status,
      page,
      limit,
    })

    return c.json(paginatedResponse(result.items, result.total, page, limit))
  }
)

// GET /api/email/preferences
router.get('/preferences', async (c) => {
  const user = c.get('user')
  const prefs = await getUserEmailPreferences(c.env.DB, user.sub)

  if (!prefs) {
    return c.json(
      apiResponse({
        user_id: user.sub,
        resume_notifications: true,
        interview_notifications: true,
        feedback_notifications: true,
        reminder_notifications: true,
        unsubscribe_token: null,
        unsubscribed_at: null,
        created_at: null,
      })
    )
  }

  return c.json(apiResponse(prefs))
})

// PATCH /api/email/preferences
router.patch(
  '/preferences',
  zValidator('json', updateEmailPreferencesSchema),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')

    const updated = await updateUserEmailPreferences(c.env.DB, user.sub, body)
    if (!updated) {
      // Preferences row doesn't exist (edge case) — create it first
      const { nanoid } = await import('nanoid')
      await c.env.DB.prepare(`
        INSERT INTO email_preferences (user_id, unsubscribe_token, created_at)
        VALUES (?, ?, datetime('now'))
      `).bind(user.sub, nanoid()).run()
      const created = await updateUserEmailPreferences(c.env.DB, user.sub, body)
      return c.json(apiResponse(created))
    }

    return c.json(apiResponse(updated))
  }
)

export default router
