import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { securityHeaders } from '@/lib/security-headers'
import { SESSION_COOKIE, isSessionRole } from '@/lib/auth'

const RECRUITER_ROUTES = ['/dashboard', '/jobs', '/candidates', '/pipeline', '/analytics', '/settings']
const INTERVIEWER_ROUTES = ['/interviewer']
// /interviews is accessible to both roles

// NEXT_PUBLIC_ vars are inlined at build time, so this is computed once.
const SECURITY_HEADERS = securityHeaders(process.env.NEXT_PUBLIC_API_URL)

/**
 * Every page response passes through here, in `next dev` and on Cloudflare
 * Pages alike — which is why the security headers are set here rather than in
 * next.config.mjs, whose `headers()` the Pages build ignores (SYN-060).
 */
export function middleware(request: NextRequest) {
  const res = route(request)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  return res
}

function route(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  const isProtected = [...RECRUITER_ROUTES, ...INTERVIEWER_ROUTES, '/interviews'].some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
  if (!isProtected) return NextResponse.next()

  // The gate cookie holds the role only (lib/auth.ts). It is a UX guard, not a
  // security boundary: anyone can edit it, and the API enforces the real rules.
  // Anything that is not a real role counts as signed out.
  const role = request.cookies.get(SESSION_COOKIE)?.value
  if (!isSessionRole(role)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }

  const isRecruiterRoute = RECRUITER_ROUTES.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isInterviewerRoute = INTERVIEWER_ROUTES.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isRecruiterRoute && role === 'interviewer') {
    return NextResponse.redirect(new URL('/interviewer', request.url))
  }
  if (isInterviewerRoute && role === 'recruiter') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
