import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase-server'

/**
 * Session check for route handlers.
 *
 * Every /api route uses createServiceClient(), which holds the service-role key
 * and bypasses RLS. Before this existed the middleware matcher deliberately
 * excluded `api/`, so all 48 handlers were reachable with no session at all —
 * anyone with the deployment URL could read the entire loan book from
 * /api/calculate, or DELETE rows.
 *
 * The middleware now covers /api too; this is the second layer, because
 * middleware has historically been bypassable (CVE-2025-29927) and a bad
 * `matcher` edit would silently reopen everything.
 *
 * Returns a 401 NextResponse to return immediately, or null when authenticated.
 *
 * Usage:
 *   const denied = await requireUser()
 *   if (denied) return denied
 */
export async function requireUser(): Promise<NextResponse | null> {
  const { user } = await getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated. Sign in to continue.' },
      { status: 401 },
    )
  }
  return null
}

/**
 * Resolves the calling user, or `{ user: null }` when there is no valid
 * session. Uses getUser() (not getSession()) so the JWT is verified with
 * Supabase rather than trusted straight from the cookie.
 */
export async function getUser(): Promise<{ user: User | null }> {
  try {
    const sb = createSupabaseServerClient()
    const { data, error } = await sb.auth.getUser()
    if (error) return { user: null }
    return { user: data.user ?? null }
  } catch {
    // Missing env vars, unreachable auth server, malformed cookie — all mean
    // "we cannot prove who this is", which must fail closed.
    return { user: null }
  }
}

/**
 * Email domains permitted to hold an account, from SIGNUP_ALLOWED_DOMAINS
 * (comma-separated, e.g. "securitynational.com,snfc.com").
 *
 * Empty / unset means no self-service signup at all — accounts must be created
 * by an administrator in the Supabase dashboard. That is the safe default:
 * the signup page previously called supabase.auth.signUp() directly with no
 * restriction, so anyone on the internet could create an account.
 */
export function allowedSignupDomains(): string[] {
  return (process.env.SIGNUP_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

export function isSignupEmailAllowed(email: string): boolean {
  const domains = allowedSignupDomains()
  if (domains.length === 0) return false
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domains.includes(domain)
}
