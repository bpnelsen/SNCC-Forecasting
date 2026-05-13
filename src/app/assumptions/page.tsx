'use client'

import { useEffect, useState } from 'react'
import { Assumptions } from '@/lib/types'
import { Settings2, Save, AlertCircle, CheckCircle } from 'lucide-react'

export default function AssumptionsPage() {
  const [data, setData]       = useState<Assumptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/assumptions')
      .then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!data) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/assumptions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setMsg({ type: 'ok', text: 'Assumptions saved successfully.' })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  const update = (field: keyof Assumptions, value: unknown) =>
    setData(prev => prev ? { ...prev, [field]: value } : prev)

  if (loading) return <div className="p-6 text-[#8B949E] text-sm">Loading…</div>
  if (!data)   return null

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-[#D4A853]" />
            Assumptions
          </h1>
          <p className="text-xs text-[#8B949E] mt-0.5">Edit forecast variables · changes apply on next Dashboard load</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${
          msg.type === 'ok'
            ? 'bg-[#238636]/10 border-[#238636]/30 text-[#3FB950]'
            : 'bg-[#DA3633]/10 border-[#DA3633]/30 text-[#F85149]'
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
        <p className="text-xs text-[#8B949E] mb-4">
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

      {/* Land Bucket */}
      <Section title="Land Bucket Developments">
        <p className="text-xs text-[#8B949E] mb-3">
          {data.land_bucket.length} development(s) configured. Edit the JSON below to add/remove.
        </p>
        <textarea
          className="form-input h-48 text-xs resize-y"
          value={JSON.stringify(data.land_bucket, null, 2)}
          onChange={e => {
            try { update('land_bucket', JSON.parse(e.target.value)) } catch {}
          }}
        />
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
        <div className="text-xs font-medium text-[#C9D1D9]">{label}</div>
        {hint && <div className="text-[10px] text-[#8B949E]">{hint}</div>}
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
              <td className="text-[#C9D1D9] font-medium capitalize">{builder.replace(/_/g, ' ')}</td>
              {months.map(m => (
                <td key={m} className="p-1">
                  <input
                    type="number"
                    className="w-12 bg-[#0D1117] border border-[#30363D] rounded text-center text-[10px]
                               text-[#C9D1D9] py-1 focus:outline-none focus:border-[#D4A853]"
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
