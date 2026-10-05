'use client'

import { useEffect, useState } from 'react'
import type { PayoffMode } from '@/lib/types'

const OPTIONS: { mode: PayoffMode; label: string; title: string }[] = [
  { mode: 'maturity',   label: 'Maturity',   title: 'Loans pay off at their maturity date' },
  { mode: 'historical', label: 'Historical', title: 'Loans pay off at funded + the assumed months on the Payoff Schedules tab' },
]

/**
 * Maturity / Historical switch. The mode lives on the active forecast_settings
 * row (/api/payoff-mode), so it switches the whole app — every page, every
 * viewer and the /ask assistant. After saving, the page reloads so whatever
 * is on screen recomputes under the new mode.
 */
export function PayoffModeToggle() {
  const [mode, setMode]           = useState<PayoffMode | null>(null)
  const [supported, setSupported] = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/payoff-mode', { cache: 'no-store' })
      .then(r => r.json())
      .then(body => {
        if (body?.error) { setError(body.error); return }
        setMode(body.mode)
        setSupported(body.supported !== false)
      })
      .catch(() => setError('Could not load payoff mode'))
  }, [])

  const choose = async (next: PayoffMode) => {
    if (next === mode || saving || !supported) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/payoff-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      setMode(next)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch')
      setSaving(false)
    }
  }

  const disabledTitle = 'Run supabase/migrations/023_payoff_schedules.sql to enable the Historical mode'

  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-fg-dim mb-1">Payoff</div>
      <div
        role="radiogroup"
        aria-label="Payoff assumption"
        className="grid grid-cols-2 rounded-lg border border-border bg-bg p-0.5"
      >
        {OPTIONS.map(o => {
          const on = mode === o.mode
          return (
            <button
              key={o.mode}
              role="radio"
              aria-checked={on}
              disabled={saving || mode === null || (!supported && !on)}
              onClick={() => choose(o.mode)}
              title={supported ? o.title : disabledTitle}
              className={`px-1.5 py-1 rounded-md text-[10px] font-medium transition-all
                          disabled:cursor-not-allowed
                          ${on
                            ? 'bg-accent/15 text-accent'
                            : 'text-fg-dim hover:text-fg disabled:hover:text-fg-dim'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {error && <div className="text-[9px] text-danger mt-1 leading-tight" title={error}>Switch failed</div>}
    </div>
  )
}
