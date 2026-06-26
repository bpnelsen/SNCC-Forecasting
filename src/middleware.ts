import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Lightweight in-memory fixed-window rate limiter, keyed by client IP.
 *
 * NOTE: state lives per server instance, so on a multi-instance/serverless host
 * the effective global limit is higher than the per-instance number. This is a
 * solid first line against brute-force and accidental floods; for strict global
 * limits, swap in a shared store (e.g. Upstash Redis via @upstash/ratelimit).
 */
const WINDOW_MS = 60_000
const hits = new Map<string, { count: number; reset: number }>()

function rateLimited(key: string, limit: number): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > limit
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? 'unknown')
}

/**
 * Auth gate + rate limiting. Every request that is not explicitly public must
 * carry a valid Supabase session. Unauthenticated page requests are redirected
 * to /login; unauthenticated /api/* requests get a 401 JSON response.
 *
 * This is the primary access-control layer in front of all data.
 */
export async function middleware(req: NextRequest) {
  const { pathname: path } = req.nextUrl

  // Rate limit API traffic before doing any auth/DB work. Imports are heavy and
  // destructive, so they get a much tighter budget than ordinary reads/writes.
  if (path.startsWith('/api/')) {
    const ip = clientIp(req)
    const isImport = path.startsWith('/api/import')
    const limit = isImport ? 10 : 120
    if (rateLimited(`${ip}:${isImport ? 'import' : 'api'}`, limit)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) return res

  // Unauthenticated:
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('redirectedFrom', pathname)
  return NextResponse.redirect(loginUrl)
}

/**
 * Run on everything EXCEPT: the login page, the auth callback, Next internals,
 * and static assets. Keep this list tight — anything not matched is unguarded.
 */
export const config = {
  matcher: [
    '/((?!login|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
