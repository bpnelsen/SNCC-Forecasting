import { createClient } from '@supabase/supabase-js'

/**
 * Reads the Supabase project URL, failing loudly rather than letting
 * `undefined!` reach the client constructor (which produces an opaque
 * "Invalid URL" from deep inside supabase-js).
 *
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is no longer read anywhere: the browser client
 * existed only for sign-in, which has been removed. It can stay set in the
 * environment harmlessly, but nothing depends on it.
 */
function projectUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL. Set it in .env.local (local) and in ' +
      'the Vercel project settings (deployed).',
    )
  }
  return url
}

/**
 * Service-role client. Bypasses RLS, so it must NEVER be constructed in code
 * that can run in the browser.
 *
 * NOTE: this app has no authentication. Every /api route uses this client, so
 * every route is reachable by anyone who can reach the deployment. Row Level
 * Security (migration 020) still blocks the public anon key from hitting the
 * Supabase REST endpoint directly, but it does not restrict these routes —
 * service_role carries BYPASSRLS by design.
 */
export function createServiceClient() {
  const url = projectUrl()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (local) and in ' +
      'the Vercel project settings (deployed). It must not be prefixed with ' +
      'NEXT_PUBLIC_ — that would ship it to the browser.',
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
