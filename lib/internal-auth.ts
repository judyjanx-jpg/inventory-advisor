import { NextRequest, NextResponse } from 'next/server'

/**
 * Simple internal API protection.
 *
 * Validates that API requests come from internal sources:
 * 1. Same-origin requests from the Next.js app (via referer/origin headers)
 * 2. Server-side requests (no origin = server-to-server)
 * 3. Requests with valid internal API key (for external integrations)
 *
 * Usage in API routes:
 * ```
 * import { requireInternalAccess } from '@/lib/internal-auth'
 *
 * export async function GET(request: NextRequest) {
 *   const authError = requireInternalAccess(request)
 *   if (authError) return authError
 *   // ... rest of handler
 * }
 * ```
 */

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY

export function requireInternalAccess(request: NextRequest): NextResponse | null {
  // Check for internal API key header (for external integrations)
  const apiKey = request.headers.get('x-internal-key')
  if (INTERNAL_API_KEY && apiKey === INTERNAL_API_KEY) {
    return null // Authorized
  }

  // Get origin and referer
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  // Server-side requests (from Next.js server components) have no origin
  if (!origin && !referer) {
    return null // Likely server-to-server, allow
  }

  // Check if request is from same origin
  const host = request.headers.get('host')
  if (host) {
    const allowedOrigins = [
      `http://${host}`,
      `https://${host}`,
      'http://localhost:3000',
      'http://localhost:3001',
    ]

    if (origin && allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return null // Same origin, authorized
    }

    if (referer && allowedOrigins.some(allowed => referer.startsWith(allowed))) {
      return null // Same origin via referer, authorized
    }
  }

  // Unauthorized
  console.warn(`[Internal Auth] Blocked request from origin: ${origin}, referer: ${referer}`)
  return NextResponse.json(
    { error: 'Unauthorized access' },
    { status: 401 }
  )
}

/**
 * Stricter version that requires explicit API key.
 * Use for sensitive operations like updating claims, changing ticket status, etc.
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('x-internal-key')

  if (!INTERNAL_API_KEY) {
    console.warn('[Internal Auth] INTERNAL_API_KEY not set - allowing request in development')
    // In development without key set, allow same-origin
    return requireInternalAccess(request)
  }

  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 }
    )
  }

  return null // Authorized
}
