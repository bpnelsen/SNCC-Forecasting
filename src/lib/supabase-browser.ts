import { createBrowserClient } from '@supabase/ssr'

/** Browser client for the login page / client components (anon key, RLS-bound). */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
