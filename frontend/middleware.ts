import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RECRUITER_ROUTES = ['/dashboard', '/jobs', '/candidates', '/pipeline', '/analytics', '/settings']
const INTERVIEWER_ROUTES = ['/interviewer']
// /interviews is accessible to both roles

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = [...RECRUITER_ROUTES, ...INTERVIEWER_ROUTES, '/interviews'].some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
  if (!isProtected) return NextResponse.next()

  const token = request.cookies.get('synthire_token')?.value
  if (!token) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }

  // Decode JWT payload (no verification needed — just read claims for routing)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const role = payload.role as string

    const isRecruiterRoute = RECRUITER_ROUTES.some(p => pathname === p || pathname.startsWith(p + '/'))
    const isInterviewerRoute = INTERVIEWER_ROUTES.some(p => pathname === p || pathname.startsWith(p + '/'))

    if (isRecruiterRoute && role === 'interviewer') {
      return NextResponse.redirect(new URL('/interviewer', request.url))
    }
    if (isInterviewerRoute && role === 'recruiter') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  } catch {
    // If token is malformed, let it through — auth middleware will catch it
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
