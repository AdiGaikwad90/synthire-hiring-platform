const USER_KEY = 'synthire_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
}

const TOKEN_KEY = 'synthire_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  // Also write a non-HttpOnly cookie for Next.js middleware route protection
  document.cookie = `synthire_token=${token}; path=/; max-age=86400; SameSite=Lax`
}

export function removeToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie = 'synthire_token=; path=/; max-age=0'
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
