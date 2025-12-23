import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'app_session'
const SESSION_MAX_AGE_DEFAULT = 60 * 60 * 24 * 1 // 1 day (default for new devices)
const SESSION_MAX_AGE_REMEMBER = 60 * 60 * 24 * 30 // 30 days (when "remember me" is checked)

/**
 * Simple app-wide password protection
 * For production, consider using a proper auth solution like NextAuth.js
 */

export function getAppPassword(): string {
  const password = process.env.APP_PASSWORD
  if (!password) {
    console.warn('APP_PASSWORD environment variable is not set. Using default password "admin".')
    return 'admin'
  }
  return password
}

/**
 * Generate a simple session token
 * In a real app, use a proper session management library
 */
export function generateSessionToken(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 15)
  return `${timestamp}-${random}`
}

/**
 * Verify the provided password matches the app password
 */
export function verifyPassword(password: string): boolean {
  return password === getAppPassword()
}

/**
 * Set the session cookie after successful login
 * @param rememberMe - If true, session lasts 30 days; otherwise 1 day
 */
export async function setSessionCookie(rememberMe: boolean = false): Promise<string> {
  const cookieStore = await cookies()
  const token = generateSessionToken()
  const maxAge = rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })

  return token
}

/**
 * Clear the session cookie on logout
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

/**
 * Check if the user is authenticated (for server components)
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE_NAME)
  return !!session?.value && session.value.length >= 10
}
