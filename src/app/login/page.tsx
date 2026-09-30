'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Building2, AlertCircle, Loader2 } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get('next') || '/dashboard'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Apply persisted theme so the login page doesn't flash light-on-dark.
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
    setLoading(true); setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // Hard refresh forces middleware to re-evaluate with the new cookies.
      router.push(nextPath)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
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
              Sign in to continue
            </div>
          </div>
        </div>

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
              autoComplete="current-password"
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              className="form-input text-xs"
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
            Sign in
          </button>
        </form>

        <div className="text-[10px] text-fg-dim text-center pt-2 border-t border-border">
          New here?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
