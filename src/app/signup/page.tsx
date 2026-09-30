'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Building2, AlertCircle, Loader2 } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get('next') || '/dashboard'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('sncc-theme') === 'dark') {
        document.documentElement.classList.add('dark')
      }
    } catch { /* private mode etc. */ }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError(null); setNeedsConfirm(false)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      // If email confirmation is disabled in the Supabase project (per the
      // requested setup), signUp returns a session immediately. If it's
      // still on, data.session will be null and the user has to confirm
      // before they can sign in — flag it so they know what happened.
      if (!data.session) {
        setNeedsConfirm(true)
        return
      }
      router.push(nextPath)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-up failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-fg-strong leading-none">
              SNCC Residential Forecasting
            </div>
            <div className="text-[10px] text-fg-dim leading-none mt-1">
              Create your account
            </div>
          </div>
        </div>

        {needsConfirm ? (
          <div className="text-xs text-fg space-y-2">
            <p>
              Your account was created, but the Supabase project still has
              <strong> email confirmation enabled</strong>. Either confirm via
              the email we sent or — to disable confirmation entirely —
              an admin can flip it off in the Supabase dashboard under
              <em> Authentication → Sign In / Up → Email → Confirm email</em>,
              then sign in below.
            </p>
            <Link href="/login" className="btn-secondary inline-flex text-xs">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                className="form-input text-xs"
                placeholder="you@security-national.com"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                className="form-input text-xs"
                placeholder="At least 6 characters"
              />
            </div>
            {error && (
              <div className="text-[10px] text-danger flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <div>{error}</div>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full inline-flex items-center justify-center gap-1.5 text-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create account
            </button>
          </form>
        )}

        <div className="text-[10px] text-fg-dim text-center pt-2 border-t border-border">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
