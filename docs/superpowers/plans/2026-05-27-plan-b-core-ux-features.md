# Plan B: Core UX Fixes + Missing Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every dead button, wrong component, hardcoded fake data, and placeholder text visible to end users, and implement the three missing flows that block SaaS launch: forgot password, team invites, and user profile settings.

**Architecture:** Backend-first: add new endpoints for password reset, team invites, and profile management. Frontend: fix broken UI state, replace placeholder text with real data, implement the new forms and flows. All new backend routes follow the existing Hono + D1 pattern with Zod validation.

**Tech Stack:** Hono, D1, bcryptjs, Zod, React Query v5, Next.js 14 App Router, existing email queue infrastructure

---

## Files Modified / Created

| File | Change |
|------|--------|
| `backend/src/routes/auth.ts` | Add `POST /forgot-password`, `POST /reset-password` |
| `backend/src/routes/team.ts` | NEW — `GET /team/members`, `POST /team/invite`, `DELETE /team/members/:id` |
| `backend/src/routes/settings.ts` | Add `GET /settings/profile`, `PATCH /settings/profile`, `POST /settings/change-password` |
| `backend/src/db/queries/users.ts` | Add helpers: `getUsersByCompany`, `updateUser`, `createPasswordReset`, `verifyPasswordReset` |
| `backend/src/db/migrations/0009_password_reset.sql` | NEW — `password_reset_tokens` table |
| `backend/src/services/email/templates/password-reset.ts` | NEW — password reset email template |
| `backend/src/services/email/templates/index.ts` | Register new template type |
| `backend/src/types/email.ts` | Add `password_reset` and `team_invite` to `EmailType` |
| `backend/src/index.ts` | Mount new `teamRouter`, `settingsRouter` |
| `frontend/app/(auth)/forgot-password/page.tsx` | NEW |
| `frontend/app/(auth)/reset-password/page.tsx` | NEW |
| `frontend/app/(auth)/join/page.tsx` | NEW — team invite accept |
| `frontend/components/(auth)/ForgotPasswordForm.tsx` | NEW |
| `frontend/components/(auth)/ResetPasswordForm.tsx` | NEW |
| `frontend/components/(auth)/JoinForm.tsx` | NEW — accept invite + set password |
| `frontend/components/(recruiter)/Settings.tsx` | Replace all placeholders: Profile + Team tabs real, others stubbed properly |
| `frontend/components/shared/Navigation.tsx` | Fix logout-on-click; add user profile dropdown; fix search bar; fix breadcrumb |
| `frontend/components/(recruiter)/Dashboard.tsx` | Replace hardcoded "Sarah" + fake counts with real data |
| `frontend/components/(auth)/LoginForm.tsx` | Fix "Forgot?" link; fix OAuth buttons to show toast not navigate |
| `frontend/components/(auth)/SignupForm.tsx` | Fix Terms/Privacy links |
| `frontend/app/(recruiter)/interviews/page.tsx` | Replace wrong component with RecruiterInterviewsList |
| `frontend/components/(recruiter)/InterviewsList.tsx` | NEW — recruiter-scoped interviews view |
| `frontend/components/(recruiter)/PipelineKanban.tsx` | Fix "Add candidate" buttons |
| `frontend/hooks/queries/useSettings.ts` | Add profile + team query hooks |

---

## Task 1: Password reset backend (DB + route)

**Files:**
- Create: `backend/src/db/migrations/0009_password_reset.sql`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/db/queries/users.ts`

- [ ] **Step 1: Create migration**

```sql
-- backend/src/db/migrations/0009_password_reset.sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);
```

Apply locally:
```bash
cd backend && wrangler d1 migrations apply synthire-prod --local
```

- [ ] **Step 2: Add DB helpers to `users.ts`**

```typescript
import crypto from 'node:crypto'

export async function createPasswordResetToken(db: D1Database, userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
  await db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).bind(userId, hash, expiresAt).run()
  return raw // send this in the email
}

export async function verifyAndConsumeResetToken(
  db: D1Database, raw: string
): Promise<string | null> {
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const row = await db.prepare(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`
  ).bind(hash).first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>()
  if (!row) return null
  if (row.used_at) return null // already used
  if (new Date(row.expires_at) < new Date()) return null // expired
  await db.prepare(
    `UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), row.id).run()
  return row.user_id
}
```

- [ ] **Step 3: Add `POST /forgot-password` and `POST /reset-password` to `auth.ts`**

```typescript
// POST /api/auth/forgot-password
authRouter.post('/forgot-password', async (c) => {
  const { email } = await c.req.json()
  const db = c.env.DB
  const user = await getUserByEmail(db, email)
  // Always return 200 to prevent email enumeration
  if (user) {
    const token = await createPasswordResetToken(db, user.id)
    const resetUrl = `${c.env.FRONTEND_ORIGIN}/reset-password?token=${token}`
    await queueEmail(db, {
      recipientEmail: email,
      emailType: 'password_reset',
      templateData: { name: user.name, resetUrl },
    })
  }
  return c.json(apiResponse({ message: 'If this email exists, a reset link has been sent.' }))
})

// POST /api/auth/reset-password
authRouter.post('/reset-password', async (c) => {
  const { token, newPassword } = await c.req.json()
  if (!token || !newPassword || newPassword.length < 8) {
    throw new AppError('Invalid request', 400)
  }
  const db = c.env.DB
  const userId = await verifyAndConsumeResetToken(db, token)
  if (!userId) throw new AppError('Reset link is invalid or has expired', 400)
  const hashed = await bcrypt.hash(newPassword, 10)
  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(hashed, userId).run()
  // Revoke all refresh tokens for this user
  await db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(new Date().toISOString(), userId).run()
  return c.json(apiResponse({ message: 'Password updated successfully' }))
})
```

- [ ] **Step 4: Create password reset email template**

```typescript
// backend/src/services/email/templates/password-reset.ts
export function renderPasswordReset(data: { name: string; resetUrl: string }): { subject: string; html: string } {
  return {
    subject: 'Reset your Synthire password',
    html: `
      <p>Hi ${data.name},</p>
      <p>We received a request to reset your password. Click the link below (valid for 1 hour):</p>
      <p><a href="${data.resetUrl}">Reset my password</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
      <p>— The Synthire team</p>
    `,
  }
}
```

In `backend/src/services/email/templates/index.ts`, add `password_reset` to the switch and `EmailType`:
```typescript
case 'password_reset':
  return renderPasswordReset(data as { name: string; resetUrl: string })
```

In `backend/src/types/email.ts`:
```typescript
export type EmailType = 'magic_link' | 'resume_uploaded' | 'interview_scheduled' |
  'feedback_reminder' | 'interview_reminder' | 'password_reset' | 'team_invite'
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/0009_password_reset.sql \
        backend/src/db/queries/users.ts \
        backend/src/routes/auth.ts \
        backend/src/services/email/templates/password-reset.ts \
        backend/src/services/email/templates/index.ts \
        backend/src/types/email.ts
git commit -m "feat: implement forgot/reset password flow with time-limited tokens"
```

---

## Task 2: Forgot password frontend flow

**Files:**
- Create: `frontend/app/(auth)/forgot-password/page.tsx`
- Create: `frontend/app/(auth)/reset-password/page.tsx`
- Create: `frontend/components/(auth)/ForgotPasswordForm.tsx`
- Create: `frontend/components/(auth)/ResetPasswordForm.tsx`
- Modify: `frontend/components/(auth)/LoginForm.tsx`

- [ ] **Step 1: Create `ForgotPasswordForm.tsx`**

```typescript
// frontend/components/(auth)/ForgotPasswordForm.tsx
'use client'
import { useState } from 'react'
import { authApi } from '@/lib/api'
import { useToast } from '@/components/ui'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      toast({ type: 'error', message: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="tsAuthCard">
        <h2 className="h2">Check your email</h2>
        <p className="tsBody">If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox.</p>
      </div>
    )
  }

  return (
    <form className="tsAuthCard" onSubmit={handleSubmit}>
      <h2 className="h2">Reset your password</h2>
      <p className="tsBody tsTextMuted">Enter your email and we'll send a reset link.</p>
      <input
        className="tsInput"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <button className="tsBtn tsBtnPrimary" type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send reset link'}
      </button>
      <a href="/login" className="tsLink">Back to login</a>
    </form>
  )
}
```

- [ ] **Step 2: Create `ResetPasswordForm.tsx`**

```typescript
// frontend/components/(auth)/ResetPasswordForm.tsx
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useToast } from '@/components/ui'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const router = useRouter()
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast({ type: 'error', message: 'Password must be at least 8 characters.' })
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      toast({ type: 'success', message: 'Password updated. Please log in.' })
      router.push('/login')
    } catch {
      toast({ type: 'error', message: 'Reset link is invalid or expired.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="tsAuthCard" onSubmit={handleSubmit}>
      <h2 className="h2">Set a new password</h2>
      <input
        className="tsInput"
        type="password"
        placeholder="New password (min 8 chars)"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <button className="tsBtn tsBtnPrimary" type="submit" disabled={loading || !token}>
        {loading ? 'Saving...' : 'Update password'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create page files**

```typescript
// frontend/app/(auth)/forgot-password/page.tsx
import { ForgotPasswordForm } from '@/components/(auth)/ForgotPasswordForm'
export default function ForgotPasswordPage() { return <ForgotPasswordForm /> }
```

```typescript
// frontend/app/(auth)/reset-password/page.tsx
import { ResetPasswordForm } from '@/components/(auth)/ResetPasswordForm'
export default function ResetPasswordPage() { return <ResetPasswordForm /> }
```

- [ ] **Step 4: Add API methods to `lib/api.ts`**

In `authApi` group:
```typescript
forgotPassword: (email: string) =>
  apiFetch<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

resetPassword: (token: string, newPassword: string) =>
  apiFetch<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
```

- [ ] **Step 5: Fix "Forgot?" link in `LoginForm.tsx`**

Find `// Forgot? link` and change it to navigate instead of toast:
```typescript
<a href="/forgot-password" className="tsLink">Forgot?</a>
```

- [ ] **Step 6: Fix OAuth buttons to toast only (not navigate)**

Find the Google/LinkedIn onClick handlers. Replace any `router.push('/dashboard')` with:
```typescript
onClick={() => toast({ type: 'info', message: 'Google login coming soon.' })}
```
Verify the buttons do NOT navigate after the toast.

- [ ] **Step 7: Fix Terms/Privacy links in LoginForm and SignupForm**

Change placeholder links to:
```typescript
<a href="/terms" className="tsLink" target="_blank" rel="noopener">Terms of Service</a>
<a href="/privacy" className="tsLink" target="_blank" rel="noopener">Privacy Policy</a>
```
Create stub pages:
```typescript
// frontend/app/terms/page.tsx
export default function TermsPage() {
  return <main className="tsContainer"><h1 className="h1">Terms of Service</h1><p>Coming soon.</p></main>
}
```
```typescript
// frontend/app/privacy/page.tsx
export default function PrivacyPage() {
  return <main className="tsContainer"><h1 className="h1">Privacy Policy</h1><p>Coming soon.</p></main>
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/(auth)/forgot-password frontend/app/(auth)/reset-password \
        frontend/components/(auth)/ForgotPasswordForm.tsx \
        frontend/components/(auth)/ResetPasswordForm.tsx \
        frontend/app/terms/page.tsx frontend/app/privacy/page.tsx \
        frontend/components/(auth)/LoginForm.tsx \
        frontend/components/(auth)/SignupForm.tsx \
        frontend/lib/api.ts
git commit -m "feat: forgot/reset password UI + fix OAuth buttons and Terms/Privacy links"
```

---

## Task 3: Team invite backend

**Files:**
- Create: `backend/src/routes/team.ts`

- [ ] **Step 1: Create team router**

```typescript
// backend/src/routes/team.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { recruiterOnly } from '../middleware/role'
import { AppError, apiResponse } from '../types/api'
import { queueEmail } from '../db/queries/email'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Env } from '../types/bindings'

const teamRouter = new Hono<{ Bindings: Env }>()
teamRouter.use('*', authMiddleware)

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['recruiter', 'interviewer']),
})

// GET /api/team/members
teamRouter.get('/members', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const rows = await db.prepare(
    `SELECT id, name, email, role, created_at FROM users WHERE company_id = ? ORDER BY created_at ASC`
  ).bind(user.company_id).all<{ id: string; name: string; email: string; role: string; created_at: string }>()
  return c.json(apiResponse(rows.results))
})

// POST /api/team/invite
teamRouter.post('/invite', recruiterOnly, zValidator('json', inviteSchema), async (c) => {
  const user = c.get('user')
  const { email, name, role } = c.req.valid('json')
  const db = c.env.DB

  const existing = await db.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()
  if (existing) throw new AppError('A user with this email already exists', 409)

  // Create user with a random temp password (they must reset via invite email)
  const tempPassword = crypto.randomBytes(16).toString('hex')
  const passwordHash = await bcrypt.hash(tempPassword, 10)
  const userId = crypto.randomUUID()
  
  await db.prepare(
    `INSERT INTO users (id, company_id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(userId, user.company_id, name, email, passwordHash, role).run()

  // Create a password reset token so they can set a real password
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  await db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).bind(userId, hash, expiresAt).run()

  const joinUrl = `${c.env.FRONTEND_ORIGIN}/join?token=${raw}`
  await queueEmail(db, {
    recipientEmail: email,
    emailType: 'team_invite',
    templateData: { name, inviterName: user.name, joinUrl },
  })

  return c.json(apiResponse({ message: 'Invitation sent', userId }), 201)
})

// DELETE /api/team/members/:id
teamRouter.delete('/members/:id', recruiterOnly, async (c) => {
  const user = c.get('user')
  const targetId = c.req.param('id')
  if (targetId === user.sub) throw new AppError("Can't remove yourself", 400)
  const db = c.env.DB
  const target = await db.prepare(`SELECT company_id FROM users WHERE id = ?`).bind(targetId).first<{ company_id: string }>()
  if (!target || target.company_id !== user.company_id) throw new AppError('User not found', 404)
  await db.prepare(`DELETE FROM users WHERE id = ?`).bind(targetId).run()
  return c.json(apiResponse({ message: 'Member removed' }))
})

export { teamRouter }
```

- [ ] **Step 2: Mount teamRouter in `index.ts`**

```typescript
import { teamRouter } from './routes/team'
// ...
app.route('/api/team', teamRouter)
```

- [ ] **Step 3: Add team_invite email template**

```typescript
// backend/src/services/email/templates/team-invite.ts
export function renderTeamInvite(data: { name: string; inviterName: string; joinUrl: string }): { subject: string; html: string } {
  return {
    subject: `${data.inviterName} invited you to Synthire`,
    html: `
      <p>Hi ${data.name},</p>
      <p>${data.inviterName} has invited you to join their team on Synthire.</p>
      <p><a href="${data.joinUrl}">Accept invitation & set your password</a></p>
      <p>This link expires in 7 days.</p>
      <p>— The Synthire team</p>
    `,
  }
}
```

Register in `index.ts` switch and `EmailType`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/team.ts backend/src/services/email/templates/team-invite.ts \
        backend/src/types/email.ts backend/src/index.ts
git commit -m "feat: team invite backend — invite by email, accept via /join link"
```

---

## Task 4: Team invite frontend + join page

**Files:**
- Create: `frontend/app/(auth)/join/page.tsx`
- Create: `frontend/components/(auth)/JoinForm.tsx`
- Modify: `frontend/hooks/queries/useSettings.ts`

- [ ] **Step 1: Create `JoinForm.tsx`**

```typescript
// frontend/components/(auth)/JoinForm.tsx
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useToast } from '@/components/ui'

export function JoinForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const router = useRouter()
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast({ type: 'error', message: 'Passwords do not match.' })
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      toast({ type: 'success', message: 'Account set up. Please log in.' })
      router.push('/login')
    } catch {
      toast({ type: 'error', message: 'Invite link is invalid or expired.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="tsAuthCard" onSubmit={handleSubmit}>
      <h2 className="h2">Welcome to Synthire</h2>
      <p className="tsBody tsTextMuted">Set a password to activate your account.</p>
      <input className="tsInput" type="password" placeholder="Password (min 8 chars)" value={password}
        onChange={e => setPassword(e.target.value)} required minLength={8} />
      <input className="tsInput" type="password" placeholder="Confirm password" value={confirm}
        onChange={e => setConfirm(e.target.value)} required />
      <button className="tsBtn tsBtnPrimary" type="submit" disabled={loading || !token}>
        {loading ? 'Setting up...' : 'Activate account'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create join page**

```typescript
// frontend/app/(auth)/join/page.tsx
import { JoinForm } from '@/components/(auth)/JoinForm'
export default function JoinPage() { return <JoinForm /> }
```

- [ ] **Step 3: Add team hooks to `useSettings.ts`**

```typescript
import { apiFetch } from '@/lib/api'

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => apiFetch<Array<{ id: string; name: string; email: string; role: string; created_at: string }>>('/api/team/members'),
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; name: string; role: 'recruiter' | 'interviewer' }) =>
      apiFetch('/api/team/invite', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/team/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/(auth)/join/page.tsx frontend/components/(auth)/JoinForm.tsx \
        frontend/hooks/queries/useSettings.ts
git commit -m "feat: team invite accept flow and team management hooks"
```

---

## Task 5: Profile settings backend + frontend

**Files:**
- Modify: `backend/src/routes/settings.ts`
- Modify: `frontend/components/(recruiter)/Settings.tsx`

- [ ] **Step 1: Add profile endpoints to `settings.ts`**

```typescript
// GET /api/settings/profile
settingsRouter.get('/profile', authMiddleware, async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const row = await db.prepare(
    `SELECT id, name, email, role FROM users WHERE id = ?`
  ).bind(user.sub).first<{ id: string; name: string; email: string; role: string }>()
  if (!row) throw new AppError('User not found', 404)
  return c.json(apiResponse(row))
})

// PATCH /api/settings/profile
settingsRouter.patch('/profile', authMiddleware, zValidator('json', z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
})), async (c) => {
  const user = c.get('user')
  const { name, email } = c.req.valid('json')
  const db = c.env.DB
  if (email) {
    const conflict = await db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).bind(email, user.sub).first()
    if (conflict) throw new AppError('Email already taken', 409)
  }
  const updates: string[] = []
  const values: unknown[] = []
  if (name) { updates.push('name = ?'); values.push(name) }
  if (email) { updates.push('email = ?'); values.push(email) }
  if (updates.length === 0) return c.json(apiResponse({ message: 'No changes' }))
  values.push(user.sub)
  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json(apiResponse({ message: 'Profile updated' }))
})

// POST /api/settings/change-password
settingsRouter.post('/change-password', authMiddleware, zValidator('json', z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})), async (c) => {
  const user = c.get('user')
  const { currentPassword, newPassword } = c.req.valid('json')
  const db = c.env.DB
  const row = await db.prepare(`SELECT password_hash FROM users WHERE id = ?`).bind(user.sub).first<{ password_hash: string }>()
  if (!row || !await bcrypt.compare(currentPassword, row.password_hash)) {
    throw new AppError('Current password is incorrect', 400)
  }
  const newHash = await bcrypt.hash(newPassword, 10)
  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(newHash, user.sub).run()
  return c.json(apiResponse({ message: 'Password changed' }))
})
```

- [ ] **Step 2: Rewrite Settings.tsx — Profile tab**

Replace the Profile placeholder section with a real form. Use `useAuth()` for current values and call `PATCH /api/settings/profile`:

```typescript
function ProfileSection() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/api/settings/profile', { method: 'PATCH', body: JSON.stringify({ name, email }) })
      toast({ type: 'success', message: 'Profile updated' })
    } catch (err: unknown) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update profile' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="tsSettingsSection">
      <h3 className="h3">Profile</h3>
      <label className="tsLabel">Name
        <input className="tsInput" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="tsLabel">Email
        <input className="tsInput" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <button className="tsBtn tsBtnPrimary" type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Rewrite Settings.tsx — Team tab**

```typescript
function TeamSection() {
  const { data: members, isLoading } = useTeamMembers()
  const inviteMember = useInviteMember()
  const removeMember = useRemoveMember()
  const [form, setForm] = useState({ name: '', email: '', role: 'recruiter' as const })
  const toast = useToast()
  const { user } = useAuth()

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    inviteMember.mutate(form, {
      onSuccess: () => { toast({ type: 'success', message: 'Invitation sent' }); setForm({ name: '', email: '', role: 'recruiter' }) },
      onError: (err: unknown) => toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to invite' }),
    })
  }

  if (isLoading) return <div className="tsSkeleton" />

  return (
    <div className="tsSettingsSection">
      <h3 className="h3">Team Members</h3>
      <ul className="tsList">
        {members?.map(m => (
          <li key={m.id} className="tsListItem">
            <span>{m.name} <span className="tsChip">{m.role}</span></span>
            <span className="tsTextMuted">{m.email}</span>
            {m.id !== user?.id && (
              <button className="tsBtn tsBtnGhost tsBtnSm" onClick={() => removeMember.mutate(m.id)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      <h4 className="h4">Invite someone</h4>
      <form onSubmit={handleInvite} className="tsInlineForm">
        <input className="tsInput" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <input className="tsInput" type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <select className="tsInput" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'recruiter' | 'interviewer' }))}>
          <option value="recruiter">Recruiter</option>
          <option value="interviewer">Interviewer</option>
        </select>
        <button className="tsBtn tsBtnPrimary" type="submit" disabled={inviteMember.isPending}>
          {inviteMember.isPending ? 'Sending...' : 'Send invite'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Replace remaining placeholder sections with proper empty states**

For Email templates, Integrations, and Billing sections, replace `"Pretend this is configured..."` with:

```typescript
function ComingSoonSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="tsSettingsSection tsEmptyState">
      <h3 className="h3">{title}</h3>
      <p className="tsBody tsTextMuted">{description}</p>
      <span className="tsChip">Coming soon</span>
    </div>
  )
}

// Usage:
<ComingSoonSection title="Email Templates" description="Customize interview invitation and reminder emails." />
<ComingSoonSection title="Integrations" description="Connect Slack, LinkedIn, and your calendar." />
<ComingSoonSection title="Billing" description="Manage your plan and payment method." />
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/settings.ts frontend/components/(recruiter)/Settings.tsx \
        frontend/hooks/queries/useSettings.ts
git commit -m "feat: profile settings (edit name/email, change password) + team members tab"
```

---

## Task 6: Fix Navigation — avatar dropdown, breadcrumb, search

**Files:**
- Modify: `frontend/components/shared/Navigation.tsx`

- [ ] **Step 1: Replace avatar `onClick={logout}` with a dropdown**

Find the outer div with `onClick={logout}` (approximately line 72 in the earlier audit). Replace with a popover/dropdown:

```typescript
const [dropdownOpen, setDropdownOpen] = useState(false)

// Replace the avatar div:
<div className="tsNavUser" style={{ position: 'relative' }}>
  <button
    className="tsNavUserBtn"
    onClick={() => setDropdownOpen(o => !o)}
    aria-haspopup="true"
    aria-expanded={dropdownOpen}
  >
    <div className="tsAvatar">{initials(user?.name ?? '')}</div>
    <span className="tsNavUserName">{user?.name ?? ''}</span>
  </button>
  {dropdownOpen && (
    <div className="tsDropdown" role="menu">
      <a className="tsDropdownItem" href="/settings" role="menuitem">Profile & Settings</a>
      <hr className="tsDropdownDivider" />
      <button className="tsDropdownItem tsDropdownItemDanger" role="menuitem" onClick={() => { setDropdownOpen(false); logout() }}>
        Log out
      </button>
    </div>
  )}
</div>
```

Close dropdown when clicking outside:
```typescript
const dropdownRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])
```

- [ ] **Step 2: Fix breadcrumb to show job title**

In the breadcrumb rendering logic, if `pathname` matches `/jobs/[id]` and there is a `job` in context/query, show `job.title` instead of the raw ID:

```typescript
// If pathname is /jobs/[id], use useJob(id) in the parent component
// In Navigation, read from the page title or a context. The simplest approach:
// Check if the last segment is a known-format UUID / ID and try to resolve it.
// For now: truncate long IDs with an ellipsis as a minimal fix.
const prettifySegment = (segment: string) => {
  if (segment.length > 20) return segment.slice(0, 8) + '…'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}
```

Full solution: pass `pageTitle` as a prop from the page layout or use a global `usePageTitle` context. The minimal approach above prevents the raw 22-char ID from showing.

- [ ] **Step 3: Wire search bar to open CommandPalette**

```typescript
// Find the search input or search button
<button className="tsSearch" onClick={onCommandPaletteOpen}>
  <SearchIcon className="tsSearchIcon" />
  <span className="tsSearchPlaceholder">Search candidates, jobs…</span>
  <kbd className="tsKbd">⌘K</kbd>
</button>
```

Pass `onCommandPaletteOpen` as a prop from the layout, or wire a global command palette state.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/shared/Navigation.tsx
git commit -m "fix: replace logout-on-avatar with dropdown; fix breadcrumb and search bar"
```

---

## Task 7: Fix Dashboard hardcoded data

**Files:**
- Modify: `frontend/components/(recruiter)/Dashboard.tsx`

- [ ] **Step 1: Replace hardcoded "Sarah" with real user name**

Find the welcome message line (approximately line 35). Replace:
```typescript
// Before:
Welcome back, Sarah

// After:
const { user } = useAuth()
// In JSX:
Welcome back, {user?.name?.split(' ')[0] ?? 'there'}
```

- [ ] **Step 2: Replace hardcoded interview + candidate counts**

```typescript
// The data already comes from useAnalyticsSummary() and useInterviews()
// Replace hardcoded strings like "You have 5 interviews and 23 new candidates" with:
const todayInterviews = interviews?.filter(i => isToday(new Date(i.scheduled_at))).length ?? 0
const newCandidates = summary?.new_candidates_this_week ?? 0

// In JSX:
{todayInterviews > 0
  ? `You have ${todayInterviews} interview${todayInterviews > 1 ? 's' : ''} today`
  : 'No interviews scheduled today'}
{newCandidates > 0 && ` · ${newCandidates} new candidate${newCandidates > 1 ? 's' : ''} this week`}
```

- [ ] **Step 3: Remove hardcoded trend percentages from stat cards**

Find where `+15%`, `+8%`, etc. are rendered. These come from hardcoded `spark` arrays. Replace:
```typescript
// Before: { value: 15, label: '+15%', spark: [8, 9, 10, ...] }
// After: only show trend if we have prior-period data
{stat.trend != null
  ? <span className={stat.trend >= 0 ? 'tsStatTrendUp' : 'tsStatTrendDown'}>{stat.trend > 0 ? '+' : ''}{stat.trend}%</span>
  : null
}
```

Where `stat.trend` comes from the analytics API response, not hardcoded.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/(recruiter)/Dashboard.tsx
git commit -m "fix: replace hardcoded name and fake metrics in dashboard with real data"
```

---

## Task 8: Fix recruiter Interviews page

**Files:**
- Create: `frontend/components/(recruiter)/InterviewsList.tsx`
- Modify: `frontend/app/(recruiter)/interviews/page.tsx`

- [ ] **Step 1: Create `InterviewsList.tsx`**

```typescript
// frontend/components/(recruiter)/InterviewsList.tsx
'use client'
import { useState } from 'react'
import { useInterviews } from '@/hooks/queries/useInterviews'
import { formatDate } from '@/lib/utils'

type Filter = 'all' | 'today' | 'upcoming' | 'completed'

export function InterviewsList() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data: interviews, isLoading } = useInterviews()
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const now = new Date()
  const filtered = (interviews ?? []).filter(i => {
    const d = new Date(i.scheduled_at)
    if (filter === 'today') return d.toDateString() === now.toDateString()
    if (filter === 'upcoming') return d > now && i.status !== 'completed'
    if (filter === 'completed') return i.status === 'completed'
    return true
  })

  if (isLoading) return <div className="tsSkeleton" style={{ height: 400 }} />

  return (
    <div className="tsPage">
      <div className="tsPageHeader">
        <h1 className="h1">Interviews</h1>
        <button className="tsBtn tsBtnPrimary" onClick={() => setScheduleOpen(true)}>
          + Schedule Interview
        </button>
      </div>
      <div className="tsTabBar">
        {(['all', 'today', 'upcoming', 'completed'] as Filter[]).map(f => (
          <button
            key={f}
            className={`tsTab ${filter === f ? 'tsTabActive' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="tsEmptyState">
          <p className="tsBody tsTextMuted">No interviews found.</p>
        </div>
      ) : (
        <table className="tsTable">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Job</th>
              <th>Type</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id}>
                <td>{i.candidate_name ?? '—'}</td>
                <td>{i.job_title ?? '—'}</td>
                <td>{i.interview_type_name ?? '—'}</td>
                <td>{formatDate(i.scheduled_at)}</td>
                <td><span className={`tsChip tsChip--${i.status}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `interviews/page.tsx`**

```typescript
// frontend/app/(recruiter)/interviews/page.tsx
import { InterviewsList } from '@/components/(recruiter)/InterviewsList'
export default function InterviewsPage() { return <InterviewsList /> }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/(recruiter)/InterviewsList.tsx \
        frontend/app/(recruiter)/interviews/page.tsx
git commit -m "fix: replace wrong InterviewerHome with recruiter-scoped InterviewsList"
```

---

## Task 9: Fix Pipeline and minor UX dead buttons

**Files:**
- Modify: `frontend/components/(recruiter)/PipelineKanban.tsx`

- [ ] **Step 1: Fix "Add candidate" buttons**

Find all the "Add candidate" buttons at the bottom of Kanban columns. They have no `onClick`. Replace with links:

```typescript
import { useRouter } from 'next/navigation'

const router = useRouter()

// In the button onClick:
<button
  className="tsKanbanAddBtn"
  onClick={() => router.push(`/candidates${jobId ? `?job_id=${jobId}` : ''}`)}
>
  + Add candidate
</button>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/(recruiter)/PipelineKanban.tsx
git commit -m "fix: wire pipeline Add candidate buttons to candidates page"
```

---

## Verification Checklist

- [ ] `cd backend && npm run typecheck` — 0 errors
- [ ] `cd frontend && npm run typecheck` — 0 errors
- [ ] Click "Forgot?" on login page → navigates to `/forgot-password`
- [ ] Submit email → check email arrives (test with real email in staging)
- [ ] Follow reset link → password updates → can log in with new password
- [ ] Recruiter invites interviewer → email arrives → join link → account active
- [ ] Settings → Profile tab shows real name/email, save updates it
- [ ] Settings → Team tab shows all team members, invite form works
- [ ] Settings → Email Templates / Integrations / Billing show "Coming soon" (no placeholder text)
- [ ] Click avatar → dropdown appears with Profile / Log out (no immediate logout)
- [ ] Click Log out in dropdown → logs out and redirects to login
- [ ] Dashboard shows user's real name (not "Sarah")
- [ ] Dashboard shows no fake +15% trend badges when no prior data
- [ ] Recruiter `/interviews` page shows company interview table (not "Your interviews")
- [ ] Google/LinkedIn buttons show toast and do NOT navigate
- [ ] Privacy and Terms links go to `/privacy` and `/terms`
- [ ] Pipeline "Add candidate" buttons navigate to `/candidates`
