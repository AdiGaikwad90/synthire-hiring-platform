const TOKEN_KEY = 'synthire_token'
const USER_KEY = 'synthire_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'interviewer' | 'admin'
  company_id: string
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  // Also write to cookie so Next.js middleware can read it
  document.cookie = `synthire_token=${token};path=/;SameSite=Strict;max-age=86400`
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie = 'synthire_token=;path=/;max-age=0'
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
