/**
 * Security headers for every page. middleware.ts is the ONLY place they are
 * applied — not next.config.mjs `headers()`, which `next dev` honours but the
 * Cloudflare Pages build (next-on-pages) silently drops, so production shipped
 * with no CSP or clickjacking protection at all (SYN-060).
 */

/** Same default lib/api.ts uses when NEXT_PUBLIC_API_URL is unset. */
const DEFAULT_API_URL = 'http://localhost:8787'

function apiOrigin(apiUrl: string | undefined): string | null {
  try {
    return new URL(apiUrl || DEFAULT_API_URL).origin
  } catch {
    return null
  }
}

export function securityHeaders(apiUrl: string | undefined): Record<string, string> {
  const api = apiOrigin(apiUrl)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Google Fonts serves CSS from googleapis and font files from gstatic;
    // without both the UI silently drops to system fonts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // The resume and JD viewers fetch the file with an auth header, wrap it in
    // a blob: URL and render it in an <iframe>; without blob: the pane is blank.
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    // Must name the API origin the app calls, or every request is blocked.
    ['connect-src', ...new Set(["'self'", api].filter(Boolean))].join(' '),
    // 'self', not 'none': Safari applies this to the blob: documents the
    // viewers frame, so 'none' blanked our own previews (SYN-058). Other sites
    // still cannot frame the app.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': csp,
  }
}
