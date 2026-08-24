// Server-side Supabase client. Reads the session from the incoming Next.js
// cookies so server components, layouts, and route handlers see the same
// auth state the browser does. Mutations to the session (sign-in, refresh,
// sign-out) write back via the same cookie store.
//
// Next 15 made cookies() async, so this factory is async too and every caller
// must await it.

import { createServerClient as ssrCreateServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieMutation = { name: string; value: string; options: CookieOptions }

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set both in .env.local (local) and in the Vercel project settings (deployed).',
    )
  }
  return ssrCreateServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookieMutation[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Setting cookies in a Server Component is a no-op. The auth
          // middleware refreshes them, so this only matters in Route
          // Handlers / Server Actions where it's legal anyway.
        }
      },
    },
  })
}
