import { createClient } from '@supabase/supabase-js'

/**
 * Reads the required public Supabase config, failing loudly rather than letting
 * `undefined!` reach the client constructor (which produces an opaque
 * "Invalid URL" from deep inside supabase-js).
 */
function publicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set both in .env.local (local) and in the Vercel project settings (deployed).',
    )
  }
  return { url, anonKey }
}

export function createBrowserClient() {
  const { url, anonKey } = publicConfig()
  return createClient(url, anonKey)
}

/**
 * Service-role client. Bypasses RLS, so it must NEVER be constructed in code
 * that can run in the browser, and must only be reached after the caller has
 * been authenticated — see requireUser() in src/lib/auth.ts and the session
 * gate in src/middleware.ts.
 */
export function createServiceClient() {
  const { url } = publicConfig()
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
