// Auth gate. Every page AND every /api route goes through this — if the user
// has no Supabase session, pages redirect to /login and API routes get a 401.
// The middleware also refreshes the session cookie if it's expired (per
// @supabase/ssr's docs: without this, server components would see stale auth
// state).
//
// /login and /signup are the only routes that don't require a session.
//
// API routes are NOT exempt. They previously were, on the reasoning that they
// "use the service-role key, which bypasses auth" — but that is exactly the
// problem: the service role bypasses RLS, so an unauthenticated GET on
// /api/calculate returned the whole loan book to anyone with the URL. Route
// handlers also call requireUser() themselves (src/lib/auth.ts) so a mistake
// in `matcher` cannot silently reopen the API.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieMutation = { name: string; value: string; options: CookieOptions }

const PUBLIC_PATHS = new Set([
  '/login',
  '/signup',
  // Account creation is unauthenticated by definition. The route enforces an
  // email-domain allowlist itself (src/app/api/auth/signup/route.ts).
  '/api/auth/signup',
])

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req })
  const path = req.nextUrl.pathname
  const isApi = path.startsWith('/api/')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fail closed: a deploy missing its env vars must not serve data unguarded.
  if (!url || !anonKey) {
    if (PUBLIC_PATHS.has(path)) return res
    const message = 'Supabase environment variables are not configured for this deployment.'
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { 'content-type': 'text/plain' } })
  }

  const supabase = createServerClient(
    url,
    anonKey,
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

  const isPublic = PUBLIC_PATHS.has(path)

  if (!user && !isPublic) {
    // An API caller wants a status code, not a redirect to an HTML page.
    if (isApi) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in to continue.' },
        { status: 401 },
      )
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // Bounce signed-in users away from /login or /signup — they don't need them.
  if (user && isPublic) {
    const dash = req.nextUrl.clone()
    dash.pathname = '/dashboard'
    dash.searchParams.delete('next')
    return NextResponse.redirect(dash)
  }

  return res
}

export const config = {
  // Runs on every page AND every /api request. Excludes only Next internals
  // and static assets. `api/` is deliberately NOT excluded any more — that
  // exclusion is what left all 48 route handlers publicly reachable.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$).*)',
  ],
}
