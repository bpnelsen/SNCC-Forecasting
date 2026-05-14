'use client'

import { useEffect, useState } from 'react'
import { Assumptions, LoanProgram } from '@/lib/types'
import { Settings2, Save, AlertCircle, CheckCircle } from 'lucide-react'

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
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!a.ok) throw new Error(await readError(a, 'Assumptions'))

      if (programs.length > 0) {
        const p = await fetch('/api/loan-programs', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(programs),
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

      {/* Draw Percentages */}
      <Section title="Draw Percentages">
        <Row label="SF Draw %" hint="Default: 90%">
          <NumInput value={data.draw_pct_sf} onChange={v => update('draw_pct_sf', v)} pct />
        </Row>
        <Row label="MF Draw %" hint="Default: 92%">
          <NumInput value={data.draw_pct_mf} onChange={v => update('draw_pct_mf', v)} pct />
        </Row>
        <Row label="Active Loans Draw %" hint="Applied to existing portfolio">
          <NumInput value={data.draw_pct_active} onChange={v => update('draw_pct_active', v)} pct />
        </Row>
      </Section>

      {/* Interest Rates */}
      <Section title="Interest Rates">
        <Row label="Rate — Projected Loans" hint="5.25% default">
          <NumInput value={data.rate_projected_loans} onChange={v => update('rate_projected_loans', v)} pct />
        </Row>
        <Row label="Rate — Land Bucket" hint="5.25% default">
          <NumInput value={data.rate_land_bucket} onChange={v => update('rate_land_bucket', v)} pct />
        </Row>
      </Section>

      {/* Profit Sharing */}
      <Section title="Profit Sharing (per unit)">
        <Row label="Holmes SFR"><NumInput value={data.ps_holmes_sfr} onChange={v => update('ps_holmes_sfr', v)} /></Row>
        <Row label="Holmes MFR"><NumInput value={data.ps_holmes_mfr} onChange={v => update('ps_holmes_mfr', v)} /></Row>
        <Row label="Arive SFR"><NumInput value={data.ps_arive_sfr} onChange={v => update('ps_arive_sfr', v)} /></Row>
        <Row label="Arive MFR"><NumInput value={data.ps_arive_mfr} onChange={v => update('ps_arive_mfr', v)} /></Row>
      </Section>

      {/* NHCF Loan Counts */}
      <Section title="New Originations — Monthly Loan Counts (NHCF)">
        <p className="text-xs text-fg-dim mb-4">
          Enter how many new loans each builder funds per month (months 0–11 = current through 12 months out).
        </p>
        <NhcfEditor
          label="Loan Counts"
          data={data.nhcf_loan_counts}
          onChange={v => update('nhcf_loan_counts', v)}
        />
      </Section>

      <Section title="Payoff Counts (NHCF)">
        <NhcfEditor
          label="Payoff Counts"
          data={data.nhcf_payoff_counts}
          onChange={v => update('nhcf_payoff_counts', v)}
        />
      </Section>

      {/* Loan Programs — drives new vertical-start cohorts */}
      <Section title="Loan Programs (New Vertical Starts)">
        <p className="text-xs text-fg-dim mb-3">
          Draw curve, default rate, and term applied to every new vertical loan cohort.
          When a lot sells, a cohort is originated under the program assigned to that Land
          Bucket project and ramps its balance through this curve.
        </p>
        {programs.length === 0 ? (
          <div className="text-xs text-fg-dim">
            No loan programs found. Run <code>supabase/migrations/002_modular_assumptions.sql</code>.
          </div>
        ) : (
          <div className="space-y-4">
            {programs.map(p => (
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
                  <div className="text-[10px] text-fg-dim mb-1">
                    Draw curve (incremental monthly fractions, comma-separated; sum ≈ 1.0)
                  </div>
                  <input
                    className="form-input text-xs font-mono"
                    value={p.draw_curve.join(', ')}
                    onChange={e => {
                      const parts = e.target.value.split(',').map(s => Number(s.trim()))
                      if (parts.every(n => !isNaN(n))) updateProgram(p.id, { draw_curve: parts })
                    }}
                  />
                  <div className="text-[10px] text-fg-dim mt-1">
                    Months: {p.draw_curve.length} · sum: {p.draw_curve.reduce((a, b) => a + b, 0).toFixed(3)}
                  </div>
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

function NhcfEditor({
  label, data, onChange
}: { label: string; data: Record<string, Record<string, number>>; onChange: (v: Record<string, Record<string, number>>) => void }) {
  const builders = Object.keys(data)
  const months   = Array.from({ length: 12 }, (_, i) => String(i))

  return (
    <div className="overflow-x-auto">
      <table className="data-table text-[10px]">
        <thead>
          <tr>
            <th>Builder</th>
            {months.map(m => <th key={m} className="text-center">M{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {builders.map(builder => (
            <tr key={builder}>
              <td className="text-fg font-medium capitalize">{builder.replace(/_/g, ' ')}</td>
              {months.map(m => (
                <td key={m} className="p-1">
                  <input
                    type="number"
                    className="w-12 bg-bg border border-border-strong rounded text-center text-[10px]
                               text-fg py-1 focus:outline-none focus:border-accent"
                    value={data[builder]?.[m] || 0}
                    min={0}
                    onChange={e => {
                      const next = { ...data, [builder]: { ...data[builder], [m]: parseInt(e.target.value) || 0 } }
                      onChange(next)
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
