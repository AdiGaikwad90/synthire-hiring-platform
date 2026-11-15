/**
 * Same-origin forwarder for the four cookie-based auth calls.
 *
 * The app (pages.dev) and the API (workers.dev) are different sites, so a
 * cookie the API sets directly is a third-party cookie. Safari blocks those by
 * default: the refresh cookie was never stored and every Safari session ended
 * when the 15-minute access token did (SYN-007). Routed through here, the
 * refresh cookie belongs to the app's own origin.
 *
 * Deliberately narrow — it must never become a general relay to the API:
 *  - only login, signup, refresh and logout; anything else is 404;
 *  - only the refresh cookie crosses, in either direction. The API's access
 *    cookie is dropped: the browser authenticates with the Bearer header, and
 *    that cookie's name is what collided with the route gate;
 *  - no caller-supplied header is forwarded except Content-Type.
 *
 * Every forwarded call reaches the API from Cloudflare's address, so they
 * share one rate-limit bucket there. That is why /api/auth/me and all other
 * calls still go straight to the API (lib/api.ts).
 */
export const runtime = 'edge'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const FORWARDED = new Set(['login', 'signup', 'refresh', 'logout'])
const REFRESH_COOKIE = 'synthire_refresh'

const refusal = (error: string, status: number) =>
  Response.json({ success: false, data: null, error, timestamp: new Date().toISOString() }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (path.length !== 1 || !FORWARDED.has(path[0])) return refusal('Not found', 404)

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  const refresh = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)synthire_refresh=([^;]+)/)
  if (refresh) headers.set('Cookie', `${REFRESH_COOKIE}=${refresh[1]}`)

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/auth/${path[0]}`, {
      method: 'POST',
      headers,
      body: (await request.text()) || undefined,
      redirect: 'manual',
    })
  } catch {
    // 502, never 401: an unreachable API must not read as an expired session.
    return refusal('Sign-in service unavailable. Try again.', 502)
  }

  const out = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'no-store',
  })
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) out.set('Retry-After', retryAfter)
  for (const cookie of upstream.headers.getSetCookie()) {
    // First-party now, so Lax is enough — and it stops another site's page from
    // triggering a refresh or a logout with the user's cookie.
    if (cookie.startsWith(`${REFRESH_COOKIE}=`)) out.append('Set-Cookie', cookie.replace(/SameSite=None/i, 'SameSite=Lax'))
  }
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
