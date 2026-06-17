// Auth gate. Every page request goes through this — if the user has no
// Supabase session, they're redirected to /login. The middleware also
// refreshes the session cookie if it's expired (per @supabase/ssr's docs:
// without this, server components would see stale auth state).
//
// /login and /signup are the only routes that don't require a session.
// API routes pass through — they use createServiceClient with the
// service-role key, which bypasses auth. (If we later add per-user data
// or RLS, API routes will need their own session checks.)

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieMutation = { name: string; value: string; options: CookieOptions }

const PUBLIC_PATHS = new Set(['/login', '/signup'])

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: CookieMutation[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.has(path)

  if (!user && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  // Bounce signed-in users away from /login or /signup — they don't need them.
  if (user && isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    url.searchParams.delete('next')
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  // Run on every page request. Excludes Next internals (_next/*), the
  // Supabase auth callback path, and common public assets so they don't
  // get redirected.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$|api/).*)',
  ],
}
