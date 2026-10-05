'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Save, AlertCircle, CheckCircle } from 'lucide-react'
import type { LoanProgram, ParentCompany, PayoffLoanType, PayoffMode, PayoffSchedule } from '@/lib/types'
import { drawProgramForLoanType, prorateDrawCurve } from '@/lib/calculator'

// Columns of the grid. OTC follows the SFR program's draw curve but can have
// its own payoff months.
const TYPES: { type: PayoffLoanType; label: string }[] = [
  { type: 'SFR',           label: 'SFR' },
  { type: 'OTC',           label: 'OTC' },
  { type: 'MFR',           label: 'MFR' },
  { type: 'A&D',           label: 'A&D' },
  { type: 'RAW_LAND',      label: 'Raw Land' },
  { type: 'FINISHED_LOTS', label: 'Finished Lots' },
]

// Row key for the default row (parent_company_id null).
const DEFAULT_ROW = '__default__'

// Grid state: rowKey → loan type → text in the cell ('' = use maturity).
type Grid = Record<string, Partial<Record<PayoffLoanType, string>>>

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export default function PayoffSchedulesPage() {
  const [parents, setParents]   = useState<ParentCompany[]>([])
  const [programs, setPrograms] = useState<LoanProgram[]>([])
  const [grid, setGrid]         = useState<Grid>({})
  const [mode, setMode]         = useState<PayoffMode>('maturity')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [previewType, setPreviewType] = useState<PayoffLoanType>('SFR')
  const [previewMonths, setPreviewMonths] = useState('')

  const toGrid = (rows: PayoffSchedule[]): Grid => {
    const g: Grid = {}
    for (const r of rows) {
      const key = r.parent_company_id ?? DEFAULT_ROW
      g[key] = { ...(g[key] ?? {}), [r.loan_type]: String(r.payoff_months) }
    }
    return g
  }

  useEffect(() => {
    (async () => {
      try {
        const [pcRes, lpRes, psRes, pmRes] = await Promise.all([
          fetch('/api/parent-companies', { cache: 'no-store' }),
          fetch('/api/loan-programs', { cache: 'no-store' }),
          fetch('/api/payoff-schedules', { cache: 'no-store' }),
          fetch('/api/payoff-mode', { cache: 'no-store' }),
        ])
        const [pc, lp, ps, pm] = await Promise.all([pcRes, lpRes, psRes, pmRes].map(r => r.json().catch(() => null)))
        setParents(Array.isArray(pc) ? pc : [])
        setPrograms(Array.isArray(lp) ? lp : [])
        if (Array.isArray(ps)) setGrid(toGrid(ps))
        else setMsg({ type: 'err', text: `Failed to load payoff schedules: ${ps?.error ?? psRes.statusText}` })
        if (pm?.mode) setMode(pm.mode)
      } finally { setLoading(false) }
    })()
  }, [])

  const setCell = (rowKey: string, type: PayoffLoanType, value: string) =>
    setGrid(prev => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? {}), [type]: value } }))

  const rows = useMemo(() => [
    { key: DEFAULT_ROW, name: 'Default (all other parents)', parentId: null as string | null },
    ...[...parents].sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ key: p.id, name: p.name, parentId: p.id as string | null })),
  ], [parents])

  // Cells that aren't a whole number of months ≥ 1 (blank is fine).
  const invalid = useMemo(() => {
    const bad = new Set<string>()
    for (const r of rows) for (const t of TYPES) {
      const v = (grid[r.key]?.[t.type] ?? '').trim()
      if (v && !(Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 600)) bad.add(`${r.key}|${t.type}`)
    }
    return bad
  }, [grid, rows])

  const save = async () => {
    if (invalid.size > 0) {
      setMsg({ type: 'err', text: 'Payoff months must be whole numbers from 1 to 600 — fix the highlighted cells.' })
      return
    }
    setSaving(true); setMsg(null)
    try {
      const body: PayoffSchedule[] = []
      for (const r of rows) for (const t of TYPES) {
        const v = (grid[r.key]?.[t.type] ?? '').trim()
        if (v) body.push({ parent_company_id: r.parentId, loan_type: t.type, payoff_months: Number(v) })
      }
      const res = await fetch('/api/payoff-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const saved = await res.json().catch(() => null)
      if (!res.ok) throw new Error(saved?.error || `${res.status} ${res.statusText}`)
      setGrid(toGrid(saved as PayoffSchedule[]))
      setMsg({
        type: 'ok',
        text: mode === 'historical'
          ? 'Payoff schedules saved — the forecast now uses them.'
          : 'Payoff schedules saved. They apply when the sidebar switch is set to Historical.',
      })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  // Draw-curve preview: the program curve for the chosen type, against the
  // same curve prorated to the chosen payoff months.
  const previewProgram = drawProgramForLoanType(previewType, programs)
  const defaultMonths = grid[DEFAULT_ROW]?.[previewType] ?? ''
  const months = Number(previewMonths || defaultMonths)
  const preview = useMemo(() => {
    if (!previewProgram || !(Number.isInteger(months) && months >= 1)) return null
    const original = previewProgram.draw_curve.map(v => Number(v) || 0)
    const prorated = prorateDrawCurve(original, previewProgram.default_term_months, months)
    const cum = (c: number[]) => c.reduce<number[]>((acc, v) => [...acc, Math.min(1, (acc.at(-1) ?? 0) + v)], [])
    return { original: cum(original), prorated: cum(prorated), length: Math.max(original.length, prorated.length) }
  }, [previewProgram, months])

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-accent" />
            Payoff Schedules
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            Assumed months from funding to payoff, by parent company and loan type · used when the sidebar switch is on <span className="text-fg">Historical</span>
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className={`text-xs p-3 rounded-lg border ${mode === 'historical'
        ? 'bg-accent/10 border-accent/30 text-fg'
        : 'bg-surface border-border text-fg-dim'}`}>
        The forecast is currently using <span className="font-medium text-fg">{mode === 'historical' ? 'Historical' : 'Maturity'}</span> payoffs.
        {mode === 'historical'
          ? ' Loans with a value below pay off at funded date + those months; their draw curve is prorated to fit.'
          : ' Switch to Historical at the top left to forecast with these schedules.'}
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

      <div className="card fade-up fade-up-2">
        <div className="card-header">
          <span className="card-title">Assumed payoff (months after funding)</span>
          <span className="text-[10px] text-fg-dim">Blank = pays off at maturity</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent company</th>
                {TYPES.map(t => {
                  const prog = drawProgramForLoanType(t.type, programs)
                  return (
                    <th key={t.type} className="text-right">
                      <div>{t.label}</div>
                      <div className="normal-case tracking-normal font-normal text-fg-dim/80">
                        {prog ? `maturity term ${prog.default_term_months} mo` : 'no draw curve'}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td className={r.parentId ? 'text-fg' : 'text-fg font-medium'}>{r.name}</td>
                  {TYPES.map(t => {
                    const bad = invalid.has(`${r.key}|${t.type}`)
                    const fallback = r.parentId ? grid[DEFAULT_ROW]?.[t.type] : undefined
                    return (
                      <td key={t.type} className="num">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={grid[r.key]?.[t.type] ?? ''}
                          placeholder={fallback ? `${fallback}` : '—'}
                          title={fallback ? `Blank uses the default row (${fallback} mo)` : 'Blank pays off at maturity'}
                          onChange={e => setCell(r.key, t.type, e.target.value)}
                          className={`form-input w-20 text-right text-xs py-1 placeholder:italic placeholder:text-fg-dim/50 ${bad ? 'border-danger' : ''}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-[10px] text-fg-dim border-t border-border space-y-1">
          <div>A parent’s own value wins; a blank cell falls back to the Default row, then to the loan’s maturity date.</div>
          <div>Loans whose funded date + assumed months is already in the past keep their maturity payoff. Forecast originations use the parent of their builder.</div>
        </div>
      </div>

      <div className="card fade-up fade-up-3">
        <div className="card-header">
          <span className="card-title">Draw curve preview</span>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={previewType}
              onChange={e => setPreviewType(e.target.value as PayoffLoanType)}
              className="form-input text-xs py-1"
            >
              {TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input
              type="number" min={1} step={1}
              value={previewMonths}
              placeholder={defaultMonths || 'months'}
              onChange={e => setPreviewMonths(e.target.value)}
              className="form-input w-20 text-right text-xs py-1"
            />
            <span className="text-fg-dim">mo</span>
          </div>
        </div>
        {!previewProgram ? (
          <div className="px-4 py-3 text-xs text-fg-dim">No loan program draw curve for this type — its balance doesn’t draw, it only pays off at the assumed date.</div>
        ) : !preview ? (
          <div className="px-4 py-3 text-xs text-fg-dim">Enter payoff months to compare {previewProgram.name}’s curve ({previewProgram.default_term_months}-month maturity term) with its prorated version.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cumulative draw</th>
                  {Array.from({ length: preview.length }, (_, k) => <th key={k} className="text-right">M{k + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Maturity ({previewProgram.default_term_months} mo)</td>
                  {Array.from({ length: preview.length }, (_, k) => (
                    <td key={k} className="num">{k < preview.original.length ? pct(preview.original[k]) : ''}</td>
                  ))}
                </tr>
                <tr>
                  <td className="text-accent">Historical ({months} mo)</td>
                  {Array.from({ length: preview.length }, (_, k) => (
                    <td key={k} className="num text-accent">{k < preview.prorated.length ? pct(preview.prorated[k]) : ''}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
