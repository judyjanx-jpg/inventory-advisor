import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require authentication (on main domain)
// Note: /support routes are only public on the SUPPORT_DOMAIN
const PUBLIC_ROUTES = [
  '/login',
  '/portal',
  '/time-clock',
  '/api/auth',
  '/api/portal',
  '/api/employees/clock',
  '/api/employees/verify',
  '/_next',
  '/favicon.ico',
]

// Custom support domain (set via environment variable)
// Example: support.yourdomain.com
const SUPPORT_DOMAIN = process.env.SUPPORT_DOMAIN || process.env.NEXT_PUBLIC_SUPPORT_DOMAIN

// Check if a path starts with any of the public routes
function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(route => path.startsWith(route))
}

// Check if request is coming from the support domain
function isSupportDomain(host: string): boolean {
  if (!SUPPORT_DOMAIN) return false
  // Remove port if present and compare
  const hostWithoutPort = host.split(':')[0].toLowerCase()
  const supportDomainLower = SUPPORT_DOMAIN.toLowerCase()
  // Exact match or ends with the support domain (for subdomains)
  return hostWithoutPort === supportDomainLower || hostWithoutPort.endsWith(`.${supportDomainLower}`)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''

  // If accessing from support domain, allow public access to support routes only
  if (isSupportDomain(host)) {
    // On support domain, allow access to support routes and login
    if (pathname.startsWith('/support') || pathname.startsWith('/api/support') || pathname === '/login' || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
      return NextResponse.next()
    }
    // Redirect everything else on support domain to /support
    if (pathname !== '/support' && !pathname.startsWith('/support/') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/support', request.url))
    }
    return NextResponse.next()
  }

  // For main domain: support routes require authentication
  // Only allow /support on main domain if explicitly enabled, otherwise redirect to login
  if (pathname.startsWith('/support') || pathname.startsWith('/api/support')) {
    // On main domain, support routes require authentication (will be checked below)
    // This ensures support is only publicly accessible on the custom support domain
  }

  // For main domain, check other public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // Check for auth session cookie
  const authSession = request.cookies.get('app_session')

  if (!authSession?.value) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login' },
        { status: 401 }
      )
    }

    // For page routes, redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify the session token matches expected format
  // The token is a simple hash that we validate on the server
  const sessionValue = authSession.value
  if (!sessionValue || sessionValue.length < 10) {
    // Invalid session, clear it and redirect
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url))

    response.cookies.delete('app_session')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
