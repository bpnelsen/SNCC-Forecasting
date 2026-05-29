'use client'

import { useEffect, useState } from 'react'
import { Assumptions, LoanProgram } from '@/lib/types'
import { Settings2, Save, AlertCircle, CheckCircle } from 'lucide-react'
import { ParentCompaniesSection } from '@/components/assumptions/ParentCompaniesSection'

export default function AssumptionsPage() {
  const [data, setData]       = useState<Assumptions | null>(null)
  const [programs, setPrograms] = useState<LoanProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [aRes, pRes] = await Promise.all([
          fetch('/api/assumptions'),
          fetch('/api/loan-programs'),
        ])
        const aBody = await aRes.json().catch(() => null)
        const pBody = await pRes.json().catch(() => null)
        if (!aRes.ok || aBody?.error) {
          setMsg({
            type: 'err',
            text: `Failed to load assumptions: ${aBody?.error ?? aRes.statusText}`,
          })
          setData(null)
        } else {
          setData(aBody)
        }
        setPrograms(Array.isArray(pBody) ? pBody : [])
      } finally { setLoading(false) }
    })()
  }, [])

  const save = async () => {
    if (!data) return
    setSaving(true); setMsg(null)
    try {
      // Save sequentially so we know which endpoint failed and can surface its
      // real error. Promise.all would mask one failure with the other.
      const a = await fetch('/api/assumptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!a.ok) throw new Error(await readError(a, 'Assumptions'))

      if (programs.length > 0) {
        const p = await fetch('/api/loan-programs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(programs),
        })
        if (!p.ok) throw new Error(await readError(p, 'Loan programs'))
      }

      setMsg({ type: 'ok', text: 'Assumptions and loan programs saved.' })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  // Reads a non-ok Response body without throwing on empty / non-JSON bodies.
  // Without this, calling .json() on an empty body produces the cryptic
  // "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
  // message and hides whatever the API actually said.
  async function readError(r: Response, scope: string): Promise<string> {
    const text = await r.text().catch(() => '')
    if (text) {
      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
          return `${scope} save failed: ${parsed.error}`
        }
      } catch { /* fall through to raw text */ }
      return `${scope} save failed (${r.status} ${r.statusText}): ${text.slice(0, 300)}`
    }
    return `${scope} save failed: ${r.status} ${r.statusText || '(empty response body)'}`
  }

  const update = (field: keyof Assumptions, value: unknown) =>
    setData(prev => prev ? { ...prev, [field]: value } : prev)

  const updateProgram = (id: string, patch: Partial<LoanProgram>) =>
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>
  if (!data)   return null

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-accent" />
            Assumptions
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">Edit forecast variables · changes apply on next Dashboard load</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${
          msg.type === 'ok'
            ? 'bg-success/10 border-success/30 text-success-light'
            : 'bg-danger-strong/10 border-danger-strong/30 text-danger'
        }`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Profit Sharing */}
      <Section title="Profit Sharing (per unit)">
        <Row label="Holmes SFR"><NumInput value={data.ps_holmes_sfr} onChange={v => update('ps_holmes_sfr', v)} /></Row>
        <Row label="Holmes MFR"><NumInput value={data.ps_holmes_mfr} onChange={v => update('ps_holmes_mfr', v)} /></Row>
        <Row label="Arive SFR"><NumInput value={data.ps_arive_sfr} onChange={v => update('ps_arive_sfr', v)} /></Row>
        <Row label="Arive MFR"><NumInput value={data.ps_arive_mfr} onChange={v => update('ps_arive_mfr', v)} /></Row>
      </Section>

      {/* NHCF tables previously lived here (legacy assumptions.nhcf_loan_counts /
          nhcf_payoff_counts JSON blobs). The calculator never read those fields —
          the dashboard's Fcst SFR / Fcst MFR come from the /originations tab via
          the new_origination_schedule table. The editor was removed to stop the
          UI from implying that NHCF inputs here affect the forecast. The legacy
          columns still exist in the assumptions table so older data isn't lost.

          To plan new starts: New Originations tab → New Entry. */}

      <ParentCompaniesSection />

      {/* Loan Programs — single source of truth for new-origination rates,
          terms and draw curves. Mirrored in the New Originations tab. */}
      <Section title="Loan Programs · source of truth for rates &amp; draw curves">
        <p className="text-xs text-fg-dim mb-3">
          These are the assumptions the forecast actually uses. The rate, term, and
          draw curve below feed every new vertical loan cohort — the same rate
          shows up per entry on the New Originations tab (overridable there).
          When a lot sells, a cohort is originated under the program assigned to that Land
          Bucket project and ramps its balance through this curve.
        </p>
        {programs.length === 0 ? (
          <div className="text-xs text-fg-dim">
            No loan programs found. Run <code>supabase/migrations/002_modular_assumptions.sql</code>.
          </div>
        ) : (
          <div className="space-y-4">
            {/* MFR Construction and SFR Construction are hidden here on
                purpose — SFR/MFR cohorts are modeled only through manual New
                Originations entries. The rows still exist in loan_programs and
                feed the engine where referenced by data (e.g. land bucket
                projects, builder defaults). */}
            {programs
              .filter(p => p.name !== 'MFR Construction' && p.name !== 'SFR Construction')
              .map(p => (
              <div key={p.id} className="border border-border-strong rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-fg">{p.name}</div>
                    <div className="text-[10px] text-fg-dim">Product type: {p.product_type}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-fg-dim mb-1">Default rate (%)</div>
                    <input type="number" step="0.01" className="form-input text-right"
                           value={(p.default_rate * 100).toFixed(2)}
                           onChange={e => updateProgram(p.id, { default_rate: Number(e.target.value) / 100 })} />
                  </div>
                  <div>
                    <div className="text-[10px] text-fg-dim mb-1">Default term (months)</div>
                    <input type="number" className="form-input text-right" value={p.default_term_months}
                           onChange={e => updateProgram(p.id, { default_term_months: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] text-fg-dim">
                      Draw curve — incremental % of max balance per month (sum ≈ 100%)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost text-[10px] px-1.5 py-0.5"
                        onClick={() => {
                          const len = Math.max(24, p.draw_curve.length)
                          updateProgram(p.id, {
                            draw_curve: Array.from({ length: len + 1 }, (_, j) => p.draw_curve[j] ?? 0),
                          })
                        }}
                      >+ Month</button>
                      <button
                        type="button"
                        className="btn-ghost text-[10px] px-1.5 py-0.5 disabled:opacity-40"
                        disabled={Math.max(24, p.draw_curve.length) <= 24}
                        onClick={() => {
                          const len = Math.max(24, p.draw_curve.length)
                          if (len <= 24) return
                          updateProgram(p.id, { draw_curve: p.draw_curve.slice(0, len - 1) })
                        }}
                      >− Month</button>
                    </div>
                  </div>
                  {(() => {
                    // Show at least 24 month inputs; never truncate a longer
                    // curve (e.g. an 18- or 30-month program). The stored
                    // curve is fractions; the grid edits percentages.
                    const count = Math.max(24, p.draw_curve.length)
                    const sumPct = p.draw_curve.reduce((a, b) => a + b, 0) * 100
                    return (
                      <>
                        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                          {Array.from({ length: count }, (_, i) => (
                            <div key={i}>
                              <div className="text-[10px] text-fg-dim mb-0.5 text-center">M{i + 1}</div>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                className="form-input text-right text-xs"
                                value={Math.round((p.draw_curve[i] ?? 0) * 100)}
                                onChange={e => {
                                  const pct = Math.round(Number(e.target.value))
                                  const next = Array.from({ length: count }, (_, j) => p.draw_curve[j] ?? 0)
                                  next[i] = !isFinite(pct) || pct < 0 ? 0 : pct / 100
                                  updateProgram(p.id, { draw_curve: next })
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="text-[10px] text-fg-dim mt-2">
                          Months: {count} · sum: {Math.round(sumPct)}%
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Land Bucket — read-only pointer; full editor lives in /land-bucket */}
      <Section title="Land Bucket Developments">
        <p className="text-xs text-fg-dim">
          Edit land bucket projects and their per-project assumptions on the{' '}
          <a href="/land-bucket" className="text-accent underline">Land Bucket</a> tab.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card fade-up fade-up-2">
      <div className="card-header"><span className="card-title">{title}</span></div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-medium text-fg">{label}</div>
        {hint && <div className="text-[10px] text-fg-dim">{hint}</div>}
      </div>
      <div className="w-36 shrink-0">{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, pct = false }: { value: number; onChange: (v: number) => void; pct?: boolean }) {
  return (
    <input
      type="number"
      className="form-input text-right"
      value={pct ? (value * 100).toFixed(2) : value}
      step={pct ? '0.01' : '1000'}
      onChange={e => onChange(pct ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value))}
    />
  )
}

