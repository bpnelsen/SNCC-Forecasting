import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { allowedSignupDomains, isSignupEmailAllowed } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Server-side account creation with an email-domain allowlist.
 *
 * The signup page previously called supabase.auth.signUp() straight from the
 * browser with no restriction whatsoever, so anyone on the internet could
 * create an account and — once /api routes started requiring a session — read
 * the entire loan book. This route is the gate: it only creates accounts whose
 * email domain appears in SIGNUP_ALLOWED_DOMAINS, and if that variable is unset
 * self-service signup is refused outright.
 *
 * IMPORTANT: this route is not sufficient on its own. The anon key is public,
 * so anyone can still POST directly to Supabase's own /auth/v1/signup endpoint
 * and bypass this check. You must ALSO turn off
 *   Supabase → Authentication → Sign In / Providers → "Allow new users to sign up"
 * and create accounts from the dashboard (or leave this route as the only path
 * and keep the allowlist tight). See the README.
 *
 * This route is deliberately excluded from the session requirement in
 * middleware — signing up is by definition unauthenticated — so it must do its
 * own validation, which is why the allowlist lives here and not in the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json().catch(() => ({}))

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 },
      )
    }

    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters.' },
        { status: 400 },
      )
    }

    if (allowedSignupDomains().length === 0) {
      return NextResponse.json({
        error:
          'Self-service sign-up is disabled. Ask an administrator to create ' +
          'your account in Supabase → Authentication → Users.',
      }, { status: 403 })
    }

    if (!isSignupEmailAllowed(email)) {
      return NextResponse.json({
        error:
          'That email domain is not permitted to create an account. Use your ' +
          'company email address, or ask an administrator to create the account.',
      }, { status: 403 })
    }

    // createUser (admin API) rather than signUp so the domain check cannot be
    // sidestepped, and so the account is confirmed without an email round-trip.
    const sb = createServiceClient()
    const { error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      // Don't confirm or deny whether an address already has an account.
      const alreadyExists = /already|registered|exists/i.test(error.message)
      return NextResponse.json({
        error: alreadyExists
          ? 'That account could not be created. If you already have one, sign in instead.'
          : error.message,
      }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('/api/auth/signup error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sign-up failed' },
      { status: 500 },
    )
  }
}
