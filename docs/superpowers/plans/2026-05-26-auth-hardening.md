# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate XSS token-theft vectors and add refresh-token rotation so stolen access tokens expire in 15 minutes instead of 24 hours.

**Architecture:** Access tokens become short-lived (15 min) JWTs set as `HttpOnly; Secure; SameSite=Strict` cookies by the backend, so JavaScript can never read them. A parallel long-lived (30-day) refresh token stored in a new D1 table `refresh_tokens` is rotated on every use. The frontend API client intercepts 401s, calls `POST /api/auth/refresh`, and retries the original request once before redirecting to login.

**Tech Stack:** Cloudflare Workers (Hono), D1 (SQLite), `jose` (JWT sign/verify), Next.js 14 App Router, React Query v5.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/src/db/migrations/0002_refresh_tokens.sql` | Adds `refresh_tokens` table |
| Modify | `backend/src/types/bindings.ts` | Add `REFRESH_TOKEN_EXPIRY_SECONDS` var |
| Modify | `backend/src/middleware/auth.ts` | `signToken` adds `iss`/`aud`; `authMiddleware` reads cookie then Bearer fallback; new `signRefreshToken` + `verifyRefreshToken` helpers |
| Modify | `backend/src/routes/auth.ts` | Login/signup set cookies + write refresh token; `/refresh` endpoint; logout revokes + clears; per-email rate limiting |
| Modify | `frontend/lib/auth.ts` | Remove localStorage + manual cookie writes; add cookie-read helpers for user data; keep `removeToken` to clear user state |
| Modify | `frontend/lib/api.ts` | Remove `Authorization` header injection; add `credentials: 'include'`; add 401-interceptor with refresh-and-retry logic |
| Modify | `frontend/context/AuthContext.tsx` | Remove `setToken`/`setStoredUser` calls post-login (server sets cookie); user state from `/api/auth/me` only |

---

### Task 1: D1 migration + backend binding types

**Files:**
- Create: `backend/src/db/migrations/0002_refresh_tokens.sql`
- Modify: `backend/src/types/bindings.ts`

- [ ] **Step 1: Create the migration file**

Create `backend/src/db/migrations/0002_refresh_tokens.sql` with this exact content:

```sql
-- Synthire — Refresh Token Rotation
-- Apply locally: wrangler d1 migrations apply synthire-prod --local
-- Apply prod:    wrangler d1 migrations apply synthire-prod

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

- [ ] **Step 2: Add the new env var to the `Env` interface**

Open `backend/src/types/bindings.ts`. In the `// Auth` section (after `JWT_EXPIRY_SECONDS`), add:

```typescript
  REFRESH_TOKEN_EXPIRY_SECONDS: string  // default: "2592000" (30 days)
```

The full Auth block should now read:

```typescript
  // Auth
  JWT_EXPIRY_SECONDS: string         // default: "900" (15 min — access token)
  REFRESH_TOKEN_EXPIRY_SECONDS: string  // default: "2592000" (30 days)
```

- [ ] **Step 3: Add the var to `wrangler.toml`**

Open `backend/wrangler.toml`. Find the `[vars]` block and update `JWT_EXPIRY_SECONDS` from `"86400"` to `"900"`, then add `REFRESH_TOKEN_EXPIRY_SECONDS`:

```toml
# Auth
JWT_EXPIRY_SECONDS = "900"                  # 15 min — access token lifetime
REFRESH_TOKEN_EXPIRY_SECONDS = "2592000"    # 30 days — refresh token lifetime
```

- [ ] **Step 4: Apply migration locally**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend
wrangler d1 migrations apply synthire-prod --local
```

Expected output: `✅ Applied 1 migration` (migration `0002_refresh_tokens`).

- [ ] **Step 5: Typecheck backend**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend
npm run typecheck
```

Expected: 0 errors in `src/`.

- [ ] **Step 6: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add backend/src/db/migrations/0002_refresh_tokens.sql \
        backend/src/types/bindings.ts \
        backend/wrangler.toml
git commit -m "feat: add refresh_tokens table + REFRESH_TOKEN_EXPIRY_SECONDS binding"
```

---

### Task 2: Backend auth middleware + auth route hardening

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/routes/auth.ts`

This task covers Tasks 1, 3, and 4 from the spec: HttpOnly cookie setting, JWT `iss`/`aud` claims hardening, and per-email rate limiting, plus the new `/refresh` endpoint.

- [ ] **Step 1: Rewrite `backend/src/middleware/auth.ts`**

Replace the entire file with:

```typescript
import { createMiddleware } from 'hono/factory'
import { jwtVerify, SignJWT } from 'jose'
import { nanoid } from 'nanoid'
import type { Env } from '../types/bindings'
import type { JWTPayload } from '../types/auth'
import { AppError } from '../types/api'

const ISS = 'synthire'
const AUD = 'synthire-app'

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload
  }
}

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const secret = new TextEncoder().encode(c.env.JWT_SECRET)

  // Prefer HttpOnly cookie; fall back to Bearer header for programmatic API clients
  let token: string | undefined
  const cookieHeader = c.req.header('Cookie') ?? ''
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)synthire_token=([^;]+)/)
  if (cookieMatch) {
    token = cookieMatch[1]
  } else {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7)
  }

  if (!token) throw new AppError('Missing authorization token', 401)

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISS,
      audience: AUD,
      clockTolerance: 5,
    })
    c.set('user', payload as unknown as JWTPayload)
  } catch {
    throw new AppError('Invalid or expired token', 401)
  }

  await next()
})

export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expirySeconds: number
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(new TextEncoder().encode(secret))
}

/** Returns raw refresh token string (store token_hash = SHA-256 hex in DB). */
export function generateRefreshToken(): string {
  return nanoid(64)
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function buildAccessCookie(token: string, maxAgeSec: number, secure: boolean): string {
  const securePart = secure ? '; Secure' : ''
  return `synthire_token=${token}; HttpOnly${securePart}; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}`
}

export function buildRefreshCookie(token: string, maxAgeSec: number, secure: boolean): string {
  const securePart = secure ? '; Secure' : ''
  return `synthire_refresh=${token}; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=${maxAgeSec}`
}

export function clearAccessCookie(secure: boolean): string {
  const securePart = secure ? '; Secure' : ''
  return `synthire_token=; HttpOnly${securePart}; SameSite=Strict; Path=/; Max-Age=0`
}

export function clearRefreshCookie(secure: boolean): string {
  const securePart = secure ? '; Secure' : ''
  return `synthire_refresh=; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=0`
}
```

- [ ] **Step 2: Rewrite `backend/src/routes/auth.ts`**

Replace the entire file with:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { hash, compare } from 'bcryptjs'
import { nanoid } from 'nanoid'
import type { Env } from '../types/bindings'
import { loginSchema, signupSchema, apiResponse, AppError } from '../types/api'
import {
  signToken,
  authMiddleware,
  generateRefreshToken,
  hashToken,
  buildAccessCookie,
  buildRefreshCookie,
  clearAccessCookie,
  clearRefreshCookie,
} from '../middleware/auth'
import {
  findUserByEmail,
  findUserById,
  toPublicUser,
} from '../db/queries/users'

const router = new Hono<{ Bindings: Env }>()

const isSecure = (env: Env) => env.ENVIRONMENT !== 'development'

// ── Helpers ────────────────────────────────────────────────────────────────────

async function issueTokenPair(
  c: { env: Env; header: (k: string, v: string) => void },
  userId: string,
  payload: Parameters<typeof signToken>[0]
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessExpiry = parseInt(c.env.JWT_EXPIRY_SECONDS, 10)
  const refreshExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY_SECONDS, 10)

  const accessToken = await signToken(payload, c.env.JWT_SECRET, accessExpiry)
  const refreshToken = generateRefreshToken()
  const tokenHash = await hashToken(refreshToken)
  const now = Math.floor(Date.now() / 1000)

  await (c.env as unknown as { DB: D1Database }).DB
    .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(nanoid(), userId, tokenHash, now + refreshExpiry, now)
    .run()

  const secure = isSecure(c.env)
  c.header('Set-Cookie', buildAccessCookie(accessToken, accessExpiry, secure))
  c.header('Set-Cookie', buildRefreshCookie(refreshToken, refreshExpiry, secure))

  return { accessToken, refreshToken }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/auth/signup
router.post('/signup', zValidator('json', signupSchema), async (c) => {
  const { email, password, name, company_name } = c.req.valid('json')

  const existing = await findUserByEmail(c.env.DB, email)
  if (existing) throw new AppError('Email already registered', 409)

  const companyId = nanoid()
  const userId = nanoid()
  const unsubscribeToken = nanoid(32)
  const passwordHash = await hash(password, 10)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO companies (id, name) VALUES (?, ?)').bind(companyId, company_name),
    c.env.DB.prepare(
      'INSERT INTO users (id, company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, companyId, email, passwordHash, name, 'recruiter'),
    c.env.DB.prepare(
      'INSERT INTO email_preferences (user_id, unsubscribe_token) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING'
    ).bind(userId, unsubscribeToken),
  ])

  const user = { id: userId, company_id: companyId, email, password_hash: passwordHash, name, role: 'recruiter', created_at: new Date().toISOString() }

  await issueTokenPair(
    { env: c.env, header: (k, v) => c.header(k, v) },
    userId,
    { sub: user.id, email: user.email, name: user.name, role: 'recruiter', company_id: user.company_id }
  )

  return c.json(
    apiResponse({
      user: toPublicUser(user),
      company: { id: companyId, name: company_name },
    }),
    201
  )
})

// POST /api/auth/login
router.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')
  const normalizedEmail = email.toLowerCase().trim()

  // Per-account rate limiting: 5 attempts per email per 5-minute window
  const window = Math.floor(Date.now() / 1000 / 300)
  const kvKey = `login_attempts:${normalizedEmail}:${window}`
  const attemptsRaw = await c.env.KV_CACHE.get(kvKey)
  const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0

  if (attempts >= 5) {
    return c.json(
      { success: false, data: null, error: 'Too many login attempts. Try again in 5 minutes.', timestamp: new Date().toISOString() },
      429,
      { 'Retry-After': '300' }
    )
  }

  // Increment before password check — prevents enumeration via timing
  await c.env.KV_CACHE.put(kvKey, String(attempts + 1), { expirationTtl: 600 })

  const user = await findUserByEmail(c.env.DB, normalizedEmail)
  if (!user) throw new AppError('Invalid email or password', 401)

  const passwordMatch = await compare(password, user.password_hash)
  if (!passwordMatch) throw new AppError('Invalid email or password', 401)

  await issueTokenPair(
    { env: c.env, header: (k, v) => c.header(k, v) },
    user.id,
    { sub: user.id, email: user.email, name: user.name, role: user.role as 'recruiter' | 'interviewer' | 'admin', company_id: user.company_id }
  )

  return c.json(apiResponse({ user: toPublicUser(user) }))
})

// POST /api/auth/refresh
router.post('/refresh', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)synthire_refresh=([^;]+)/)
  if (!match) throw new AppError('Missing refresh token', 401)

  const rawToken = match[1]
  const tokenHash = await hashToken(rawToken)
  const now = Math.floor(Date.now() / 1000)

  const row = await c.env.DB
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?')
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string; token_hash: string; expires_at: number; created_at: number }>()

  if (!row) throw new AppError('Invalid or expired refresh token', 401)

  // Revoke old refresh token (rotation)
  await c.env.DB
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
    .bind(now, row.id)
    .run()

  const user = await findUserById(c.env.DB, row.user_id)
  if (!user) throw new AppError('User not found', 401)

  await issueTokenPair(
    { env: c.env, header: (k, v) => c.header(k, v) },
    user.id,
    { sub: user.id, email: user.email, name: user.name, role: user.role as 'recruiter' | 'interviewer' | 'admin', company_id: user.company_id }
  )

  return c.json(apiResponse({ user: toPublicUser(user) }))
})

// POST /api/auth/logout
router.post('/logout', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)synthire_refresh=([^;]+)/)

  if (match) {
    const tokenHash = await hashToken(match[1])
    const now = Math.floor(Date.now() / 1000)
    await c.env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(now, tokenHash)
      .run()
  }

  const secure = isSecure(c.env)
  c.header('Set-Cookie', clearAccessCookie(secure))
  c.header('Set-Cookie', clearRefreshCookie(secure))

  return c.json(apiResponse({ message: 'Logged out successfully' }))
})

// GET /api/auth/me
router.use('/me', authMiddleware)
router.get('/me', async (c) => {
  const jwtPayload = c.get('user')
  const user = await findUserById(c.env.DB, jwtPayload.sub)
  if (!user) throw new AppError('User not found', 404)
  return c.json(apiResponse(toPublicUser(user)))
})

export default router
```

- [ ] **Step 3: Typecheck backend**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend
npm run typecheck
```

Expected: 0 errors in `src/`. If you see `Property 'DB' does not exist on type 'Env'` in the `issueTokenPair` helper cast, replace the cast line with `await (c.env.DB as D1Database)` — the `Env` interface already has `DB: D1Database` so the cast should be unnecessary; remove it and access `c.env.DB` directly.

- [ ] **Step 4: Verify login sets cookies manually**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/backend
npm run dev &
sleep 3

curl -s -D - -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"wrongpassword"}' | head -20
```

Expected: `HTTP/1.1 401` with JSON `{"success":false,"error":"Invalid email or password",...}`. No `Set-Cookie` on 401 is correct.

Then create a real test user and try again — confirm `Set-Cookie: synthire_token=...; HttpOnly` and `Set-Cookie: synthire_refresh=...; HttpOnly; Path=/api/auth` appear in the response headers.

- [ ] **Step 5: Kill dev server, commit**

```bash
kill %1 2>/dev/null; true

cd /Users/newpage/Documents/TS_CF_Hackathon
git add backend/src/middleware/auth.ts backend/src/routes/auth.ts
git commit -m "feat: HttpOnly cookies, refresh token rotation, iss/aud claims, per-email rate limiting"
```

---

### Task 3: Frontend API client — remove Bearer injection, add refresh interceptor

**Files:**
- Modify: `frontend/lib/api.ts`

The browser automatically sends HttpOnly cookies on same-origin requests. We add `credentials: 'include'` to cross-origin requests (backend runs on port 8787 during dev), remove manual `Authorization` header injection, and add a 401-interceptor that calls `POST /api/auth/refresh` once before giving up and redirecting to login.

- [ ] **Step 1: Rewrite `apiFetch` in `frontend/lib/api.ts`**

Replace lines 92–121 (the `apiFetch` function) with:

```typescript
let _isRefreshing = false
let _refreshQueue: Array<(ok: boolean) => void> = []

async function attemptRefresh(): Promise<boolean> {
  if (_isRefreshing) {
    return new Promise(resolve => _refreshQueue.push(resolve))
  }
  _isRefreshing = true
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    const ok = res.ok
    _refreshQueue.forEach(cb => cb(ok))
    _refreshQueue = []
    return ok
  } catch {
    _refreshQueue.forEach(cb => cb(false))
    _refreshQueue = []
    return false
  } finally {
    _isRefreshing = false
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _retried = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  const json = await res.json() as { success: boolean; data: T; error: string | null }

  if (res.status === 401) {
    if (!_retried) {
      const refreshed = await attemptRefresh()
      if (refreshed) {
        return apiFetch<T>(path, options, true)
      }
    }
    // Refresh failed or second 401 — clear client state and redirect
    const { removeToken } = await import('./auth')
    removeToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError(json.error ?? 'Session expired', 401)
  }

  if (!res.ok || !json.success) {
    throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status, json)
  }
  return json.data
}
```

- [ ] **Step 2: Rewrite `apiUpload` in `frontend/lib/api.ts`**

Replace lines 123–138 (the `apiUpload` function) with:

```typescript
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (res.status === 401) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      const res2 = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res2.ok) throw new ApiError(`HTTP ${res2.status}`, res2.status)
      const json2 = await res2.json() as { success: boolean; data: T; error: string | null }
      if (!json2.success) throw new ApiError(json2.error ?? `HTTP ${res2.status}`, res2.status)
      return json2.data
    }
    const { removeToken } = await import('./auth')
    removeToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError('Session expired', 401)
  }
  const json = await res.json() as { success: boolean; data: T; error: string | null }
  if (!res.ok || !json.success) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json.data
}
```

- [ ] **Step 3: Update `authApi.login` and `authApi.signup` return types**

The backend no longer returns `token` in the JSON body (it's set as a cookie). Update the `authApi` group (lines ~141–151):

```typescript
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ user: StoredUser }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    }),
  signup: (email: string, password: string, name: string, company_name: string) =>
    apiFetch<{ user: StoredUser; company: { id: string; name: string } }>('/api/auth/signup', {
      method: 'POST', body: JSON.stringify({ email, password, name, company_name })
    }),
  me: () => apiFetch<StoredUser>('/api/auth/me'),
  logout: () => apiFetch<{ message: string }>('/api/auth/logout', { method: 'POST' }),
}
```

- [ ] **Step 4: Typecheck frontend**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend
npm run typecheck
```

Expected: 0 errors in `src/` (TypeScript `strict: false` — ignore pre-existing warnings in node_modules).

- [ ] **Step 5: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add frontend/lib/api.ts
git commit -m "feat: remove Bearer injection, add credentials:include + 401 refresh interceptor"
```

---

### Task 4: Frontend auth helpers + AuthContext — remove localStorage token storage

**Files:**
- Modify: `frontend/lib/auth.ts`
- Modify: `frontend/context/AuthContext.tsx`

The access token is now HttpOnly — JS can't read it. `setToken` and `getToken` are removed. User data continues to live in `localStorage` (not a security concern — it's just profile data, no token). `removeToken` becomes `clearUserState` semantically but keeps the name for minimal diff.

- [ ] **Step 1: Rewrite `frontend/lib/auth.ts`**

Replace the entire file with:

```typescript
const USER_KEY = 'synthire_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
}

/**
 * getToken is kept as a stub returning null so that existing call sites in
 * AuthContext don't need changes — the token now lives in an HttpOnly cookie
 * that the browser manages automatically.
 */
export function getToken(): string | null {
  return null
}

/** No-op: the server sets the access cookie via Set-Cookie. */
export function setToken(_token: string): void {
  // intentionally empty — HttpOnly cookie is set by the server
}

/** Clears user profile from localStorage. Does NOT clear the HttpOnly cookie —
 *  that is done by calling POST /api/auth/logout (server sets Max-Age=0).
 */
export function removeToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setStoredUser(user: StoredUser): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
```

- [ ] **Step 2: Update `AuthContext.tsx` login/signup/logout handlers**

Open `frontend/context/AuthContext.tsx`. The `login`, `signup`, and `logout` functions reference the now-removed `token` from API responses, and `logout` needs to call the backend to clear the HttpOnly cookie.

Replace the `AuthProvider` body (lines 17–58) with:

```typescript
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<StoredUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  // Verify session on mount by calling /api/auth/me — the HttpOnly cookie is
  // sent automatically; no token read required.
  React.useEffect(() => {
    const cached = getStoredUser()
    if (cached) setUser(cached)

    authApi.me()
      .then(u => { setUser(u); setStoredUser(u) })
      .catch(() => { removeToken(); setUser(null) })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const { user: u } = await authApi.login(email, password)
    setStoredUser(u)
    setUser(u)
  }

  const signup = async (email: string, password: string, name: string, company_name: string) => {
    const { user: u } = await authApi.signup(email, password, name, company_name)
    setStoredUser(u)
    setUser(u)
  }

  const logout = async () => {
    try { await authApi.logout() } catch { /* ignore — clear client state regardless */ }
    removeToken()
    setUser(null)
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

Note: `logout` is now `async` so update the `AuthContextValue` interface at the top of the file:

```typescript
interface AuthContextValue {
  user: StoredUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string, company_name: string) => Promise<void>
  logout: () => Promise<void>
}
```

- [ ] **Step 3: Verify `LoginForm` and `SignupForm` still compile**

`LoginForm` calls `useAuth().login(email, password)` — no change needed; the signature is identical.
`SignupForm` calls `useAuth().signup(...)` — no change needed.

Any component that calls `logout()` without `await` is fine — fire-and-forget is acceptable for logout.

- [ ] **Step 4: Typecheck frontend**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Smoke-test login flow end-to-end**

```bash
# Terminal 1
cd /Users/newpage/Documents/TS_CF_Hackathon/backend && npm run dev

# Terminal 2
cd /Users/newpage/Documents/TS_CF_Hackathon/frontend && npm run dev
```

Open http://localhost:3000/login in Chrome/Firefox. Open DevTools → Application → Cookies.

1. Log in with valid credentials.
2. Confirm `synthire_token` cookie is present, **HttpOnly is checked**, and Secure is NOT checked (localhost dev).
3. Confirm `synthire_refresh` cookie is present with **Path = /api/auth**.
4. Confirm no `synthire_token` key exists in localStorage (Application → Local Storage).
5. Navigate to `/dashboard` — confirm it loads without redirect.
6. Refresh the page — confirm session persists (cookie sent automatically, `/api/auth/me` succeeds).
7. Click logout — confirm both cookies are cleared and you land on `/login`.

- [ ] **Step 6: Commit**

```bash
cd /Users/newpage/Documents/TS_CF_Hackathon
git add frontend/lib/auth.ts frontend/context/AuthContext.tsx
git commit -m "feat: remove localStorage token storage, wire AuthContext to HttpOnly cookie flow"
```
