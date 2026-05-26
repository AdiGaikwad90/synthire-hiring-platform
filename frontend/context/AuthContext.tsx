"use client"
import * as React from "react"
import { authApi } from "@/lib/api"
import { setToken, removeToken, getStoredUser, setStoredUser } from "@/lib/auth"
import type { StoredUser } from "@/lib/auth"

interface AuthContextValue {
  user: StoredUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string, company_name: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<StoredUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  // On mount: render cached user immediately, then verify via /api/auth/me
  React.useEffect(() => {
    const cached = getStoredUser()
    if (cached) setUser(cached)

    authApi.me()
      .then(u => { setUser(u); setStoredUser(u) })
      .catch(() => {
        // /me failed — session is gone; clear cached user
        removeToken()
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const { user: u, token } = await authApi.login(email, password) as { user: StoredUser; token?: string }
    if (token) setToken(token)
    setStoredUser(u)
    setUser(u)
  }

  const signup = async (email: string, password: string, name: string, company_name: string) => {
    const { user: u, token } = await authApi.signup(email, password, name, company_name) as { user: StoredUser; company: unknown; token?: string }
    if (token) setToken(token)
    setStoredUser(u)
    setUser(u)
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Best-effort — proceed with local cleanup even if backend call fails
    }
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

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
