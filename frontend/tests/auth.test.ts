/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getToken,
  setToken,
  removeToken,
  getStoredUser,
  setStoredUser,
} from '@/lib/auth'
import type { StoredUser } from '@/lib/auth'

/**
 * Token storage is dual on purpose: localStorage is the primary (read by
 * apiFetch for the Bearer header) and a non-HttpOnly cookie is the secondary,
 * existing only so Next middleware can gate routes. The two must move together
 * — a cookie left behind after logout keeps middleware letting the user in.
 */

const cookieHas = (value: string) => document.cookie.includes(value)

const user: StoredUser = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Ada',
  role: 'recruiter',
  company_id: 'co1',
}

beforeEach(() => {
  localStorage.clear()
  // happy-dom keeps cookies between tests; expire anything left over.
  for (const c of document.cookie.split(';')) {
    document.cookie = `${c.split('=')[0].trim()}=; path=/; max-age=0`
  }
})

describe('setToken / getToken', () => {
  it('round-trips through localStorage', () => {
    setToken('tok123')
    expect(getToken()).toBe('tok123')
  })

  it('also writes the cookie middleware reads', () => {
    setToken('tok123')
    expect(cookieHas('synthire_token=tok123')).toBe(true)
  })

  it('returns null when nothing is stored', () => {
    expect(getToken()).toBeNull()
  })

  it('overwrites rather than appending on re-login', () => {
    setToken('first')
    setToken('second')
    expect(getToken()).toBe('second')
    expect(cookieHas('synthire_token=second')).toBe(true)
  })
})

describe('removeToken', () => {
  it('clears BOTH stores — a surviving cookie would keep middleware fooled', () => {
    setToken('tok123')
    setStoredUser(user)
    removeToken()

    expect(getToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
    expect(cookieHas('synthire_token=tok123')).toBe(false)
  })

  it('is safe to call when nothing is stored', () => {
    expect(() => removeToken()).not.toThrow()
    expect(getToken()).toBeNull()
  })
})

describe('stored user', () => {
  it('round-trips', () => {
    setStoredUser(user)
    expect(getStoredUser()).toEqual(user)
  })

  it('returns null when absent', () => {
    expect(getStoredUser()).toBeNull()
  })

  // The value is attacker-writable via devtools, and a throw here would break
  // every page that reads the session on mount.
  it('returns null instead of throwing on corrupt JSON', () => {
    localStorage.setItem('synthire_user', '{not json')
    expect(() => getStoredUser()).not.toThrow()
    expect(getStoredUser()).toBeNull()
  })

  it('does not throw on an empty or non-object value', () => {
    for (const raw of ['', 'null', '[]', '"str"', '42']) {
      localStorage.setItem('synthire_user', raw)
      expect(() => getStoredUser(), `raw=${raw}`).not.toThrow()
    }
  })
})
