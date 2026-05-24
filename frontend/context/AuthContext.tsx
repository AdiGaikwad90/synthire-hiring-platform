"use client"
import * as React from "react"
import { authApi } from "@/lib/api"
import { getToken, setToken, removeToken, getStoredUser, setStoredUser } from "@/lib/auth"
import type { StoredUser } from "@/lib/auth"

interface AuthContextValue {
  user: StoredUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string, company_name: string) => Promise<void>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<StoredUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  // Verify token on mount
  React.useEffect(() => {
    const token = getToken()
    if (!token) { setIsLoading(false); return }
    authApi.me()
      .then(u => { setUser(u); setStoredUser(u) })
      .catch(() => removeToken())
      .finally(() => setIsLoading(false))
  }, [])

  // Navigation is handled by the calling component so useRouter() doesn't
  // need to live in the root-level provider (which can silently fail in App Router).
  const login = async (email: string, password: string) => {
    const { token, user: u } = await authApi.login(email, password)
    setToken(token)
    setStoredUser(u)
    setUser(u)
  }

  const signup = async (email: string, password: string, name: string, company_name: string) => {
    const { token, user: u } = await authApi.signup(email, password, name, company_name)
    setToken(token)
    setStoredUser(u)
    setUser(u)
  }

  const logout = () => {
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
