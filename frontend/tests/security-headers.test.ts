import { describe, it, expect } from 'vitest'
import { securityHeaders } from '@/lib/security-headers'

/**
 * SYN-058 / SYN-060. These headers are applied by middleware.ts to every page.
 * They used to live in next.config.mjs `headers()`, which `next dev` honours
 * but the Cloudflare Pages build silently drops — production had no CSP.
 */

const csp = (h: Record<string, string>) =>
  Object.fromEntries(
    h['Content-Security-Policy'].split(';').map((d) => d.trim()).filter(Boolean)
      .map((d) => [d.split(/\s+/)[0], d.split(/\s+/).slice(1)]),
  ) as Record<string, string[]>

describe('securityHeaders — happy path', () => {
  it('sends the full header set', () => {
    expect(Object.keys(securityHeaders('https://api.example.com')).sort()).toEqual([
      'Content-Security-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ])
  })

  it('lets the app reach its API and nothing else', () => {
    expect(csp(securityHeaders('https://api.example.com'))['connect-src']).toEqual(["'self'", 'https://api.example.com'])
  })

  it('allows blob: frames — the resume and JD viewers render a blob: URL in an iframe', () => {
    expect(csp(securityHeaders('https://api.example.com'))['frame-src']).toEqual(["'self'", 'blob:'])
  })
})

// Safari applies the page's frame-ancestors to the blob: documents the
// viewers frame. 'none' blocked our own resume/JD previews there (Chrome does
// not inherit it, which is how it went unnoticed). 'self' fixes that while
// other sites still cannot frame the app.
describe('securityHeaders — framing (do not tighten back to none/DENY)', () => {
  it("allows only same-origin framing", () => {
    const h = securityHeaders('https://api.example.com')
    expect(csp(h)['frame-ancestors']).toEqual(["'self'"])
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN')
  })
})

describe('securityHeaders — API origin variants and invalid input', () => {
  it('reduces an API URL with a path or trailing slash to its origin', () => {
    expect(csp(securityHeaders('https://api.example.com/v1/'))['connect-src']).toEqual(["'self'", 'https://api.example.com'])
  })

  it('defaults to the local API, the same default lib/api.ts uses', () => {
    expect(csp(securityHeaders(undefined))['connect-src']).toEqual(["'self'", 'http://localhost:8787'])
    expect(csp(securityHeaders(''))['connect-src']).toEqual(["'self'", 'http://localhost:8787'])
  })

  it('drops an unparseable API URL instead of emitting a broken directive', () => {
    expect(csp(securityHeaders('not a url'))['connect-src']).toEqual(["'self'"])
  })

  it("never lists 'self' twice when the API is same-origin", () => {
    const sources = csp(securityHeaders('https://api.example.com'))['connect-src']
    expect(new Set(sources).size).toBe(sources.length)
  })
})
