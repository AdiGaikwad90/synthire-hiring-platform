const USER_KEY = 'synthire_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
}

/**
 * getToken — stub. The JWT is now stored in an HttpOnly cookie managed by the
 * browser/backend. This returns null so any lingering call-sites are no-ops.
 */
export function getToken(): string | null {
  return null
}

/**
 * setToken — stub. Cookie is set by Set-Cookie response header from backend.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setToken(_token: string): void {
  // no-op — cookie is managed by the browser via backend Set-Cookie
}

/**
 * removeToken — clears cached user profile from localStorage.
 * Does NOT touch the HttpOnly cookie — that is cleared by the backend /logout
 * endpoint via a Set-Cookie: Max-Age=0 response header.
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
