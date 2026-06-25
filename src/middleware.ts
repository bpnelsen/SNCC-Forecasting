import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Auth gate. Every request that is not explicitly public must carry a valid
 * Supabase session. Unauthenticated page requests are redirected to /login;
 * unauthenticated /api/* requests get a 401 JSON response.
 *
 * This is the primary access-control layer in front of all data.
 */
export async function middleware(req: NextRequest) {
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
