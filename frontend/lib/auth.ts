const USER_KEY = 'synthire_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
}

const TOKEN_KEY = 'synthire_token'

/**
 * The route gate's cookie: the ROLE only, read by middleware.ts. It is not a
 * credential — the API authenticates the Bearer token — so it never holds one.
 *
 * It must not share a name with the backend's cookies. It used to be called
 * `synthire_token`, the name of the API's HttpOnly 15-minute access cookie; on
 * localhost the two collided and the gate vanished 15 minutes after login
 * (SYN-007).
 */
export const SESSION_COOKIE = 'synthire_session'
export const SESSION_ROLES = ['recruiter', 'interviewer', 'admin'] as const
export type SessionRole = (typeof SESSION_ROLES)[number]
export const isSessionRole = (value: unknown): value is SessionRole =>
  SESSION_ROLES.includes(value as SessionRole)

/** As long as the refresh token lives — keep in step with REFRESH_TOKEN_EXPIRY_SECONDS in backend/wrangler.toml. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60
/** The gate cookie's name before SYN-007; still cleared so upgraded browsers don't keep a stale one. */
const LEGACY_GATE_COOKIE = 'synthire_token'

/** The role claim of a JWT, unverified — used only to label the gate cookie. */
function roleOf(token: string): SessionRole | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return isSessionRole(payload?.role) ? payload.role : null
  } catch {
    return null
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

/** Writes or renews the gate cookie. Called on login, on every token refresh and when /api/auth/me confirms the session. */
export function markSession(role: SessionRole): void {
  if (typeof window === 'undefined') return
  const secure = window.location?.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_COOKIE}=${role}; path=/; max-age=${SESSION_MAX_AGE}; SameSite=Lax${secure}`
}

/** True when the gate cookie is present and holds a real role — i.e. middleware will let the user in. */
export function hasSession(): boolean {
  if (typeof window === 'undefined') return false
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))
  return isSessionRole(match?.[1])
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  const role = roleOf(token)
  if (role) markSession(role)
}

export function removeToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`
  document.cookie = `${LEGACY_GATE_COOKIE}=; path=/; max-age=0`
}

/**
 * Where to send someone after sign-in: the page they were heading for when it
 * is a path on this site, else the dashboard (middleware moves an interviewer
 * on to /interviewer). `//evil.io` and `/\\evil.io` start with "/" but leave
 * the site, so they are refused.
 */
export function postLoginPath(from: string | null | undefined): string {
  return from && /^\/(?![/\\])/.test(from) ? from : '/dashboard'
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
