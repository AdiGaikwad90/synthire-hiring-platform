import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from '../../../src/middleware/cors'
import type { Env } from '../../../src/types/bindings'

const PROD = 'https://synthire-frontend.pages.dev'
const STAGING = 'https://staging.synthire-frontend.pages.dev'

const env = (over: Partial<Env> = {}) => ({ ENVIRONMENT: 'production', ...over }) as Env

describe('isAllowedOrigin', () => {
  it('allows the hardcoded production Pages origin', () => {
    expect(isAllowedOrigin(PROD, env())).toBe(true)
  })

  it('allows the environment-specific FRONTEND_ORIGIN (this is what unblocks staging)', () => {
    expect(isAllowedOrigin(STAGING, env({ ENVIRONMENT: 'staging', FRONTEND_ORIGIN: STAGING }))).toBe(true)
  })

  it('still rejects the staging origin when FRONTEND_ORIGIN is not set to it', () => {
    expect(isAllowedOrigin(STAGING, env())).toBe(false)
  })

  // The reason this widening is safe: it permits exactly one extra origin,
  // the one the operator configured — not a prefix, suffix, or subdomain of it.
  it('matches FRONTEND_ORIGIN exactly — no prefix/suffix/subdomain slack', () => {
    const e = env({ FRONTEND_ORIGIN: PROD })
    for (const hostile of [
      'https://synthire-frontend.pages.dev.evil.com',
      'https://evil.com/https://synthire-frontend.pages.dev',
      'https://evil-synthire-frontend.pages.dev',
      'http://synthire-frontend.pages.dev', // scheme downgrade
      `${PROD}/`, // trailing slash is a different origin
    ]) {
      expect(isAllowedOrigin(hostile, e), `${hostile} must be rejected`).toBe(false)
    }
  })

  it('rejects an empty or missing Origin header', () => {
    expect(isAllowedOrigin('', env())).toBe(false)
    expect(isAllowedOrigin('', env({ FRONTEND_ORIGIN: '' }))).toBe(false)
  })

  it('allows localhost only outside production', () => {
    expect(isAllowedOrigin('http://localhost:3000', env({ ENVIRONMENT: 'development' }))).toBe(true)
    expect(isAllowedOrigin('http://localhost:3001', env({ ENVIRONMENT: 'staging' }))).toBe(true)
    expect(isAllowedOrigin('http://localhost:3000', env({ ENVIRONMENT: 'production' }))).toBe(false)
  })

  it('does not treat a localhost-lookalike host as localhost', () => {
    for (const e of ['development', 'production']) {
      expect(isAllowedOrigin('http://localhost.evil.com', env({ ENVIRONMENT: e }))).toBe(false)
      expect(isAllowedOrigin('http://notlocalhost', env({ ENVIRONMENT: e }))).toBe(false)
    }
  })

  it('rejects an unknown origin outright', () => {
    expect(isAllowedOrigin('https://example.com', env({ FRONTEND_ORIGIN: PROD }))).toBe(false)
  })
})
