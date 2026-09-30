'use client'

// Browser-side Supabase client for auth + reads. Uses @supabase/ssr's
// createBrowserClient so the session is persisted in cookies (NOT
// localStorage) — that's what lets the Next.js middleware see the same
// session and gate pages server-side.
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
