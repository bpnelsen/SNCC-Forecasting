import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Service-role client. Bypasses Row Level Security — use ONLY in trusted
 * server-side code (route handlers), never expose to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Cookie-bound server client used in route handlers and server components to
 * read the authenticated user's session. Subject to RLS as that user.
 */
export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // set() can throw in a Server Component render; middleware refreshes.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            /* see above */
          }
        },
      },
    },
  )
}

/**
 * Returns the authenticated user or null. Use in route handlers as a
 * defense-in-depth check on top of middleware.
 */
export async function getSessionUser() {
  const sb = createServerSupabase()
  const { data } = await sb.auth.getUser()
  return data.user ?? null
}
