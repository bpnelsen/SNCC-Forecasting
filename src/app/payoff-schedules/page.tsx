'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Save, AlertCircle, CheckCircle, Upload } from 'lucide-react'
import type { LoanProgram, ParentCompany, PayoffLoanType, PayoffMode, PayoffSchedule } from '@/lib/types'
import { drawProgramForLoanType, prorateDrawCurve } from '@/lib/calculator'
import type { PayoffImportResult } from '@/lib/payoff-import'

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

// One grid cell: the text in the input ('' = use the Default row / maturity),
// and whether it holds a loan-report import (with its loan count) or a value
// someone typed. Editing an imported cell makes it manual.
interface Cell { value: string; source: 'import' | 'manual'; count: number | null }
type Grid = Record<string, Partial<Record<PayoffLoanType, Cell>>>

const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.type, t.label])) as Record<PayoffLoanType, string>

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
  const [importing, setImporting] = useState(false)
  const [imported, setImported]   = useState<PayoffImportResult['summary'] | null>(null)
  const [dirty, setDirty]         = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const toGrid = (rows: PayoffSchedule[]): Grid => {
    const g: Grid = {}
    for (const r of rows) {
      const key = r.parent_company_id ?? DEFAULT_ROW
      g[key] = {
        ...(g[key] ?? {}),
        [r.loan_type]: {
          value: String(Number(r.payoff_months)),
          source: r.source === 'import' ? 'import' : 'manual',
          count: r.loan_count ?? null,
        },
      }
    }
    return g
  }
  const cellValue = (rowKey: string, type: PayoffLoanType) => grid[rowKey]?.[type]?.value ?? ''

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

  const setCell = (rowKey: string, type: PayoffLoanType, value: string) => {
    setGrid(prev => ({
      ...prev,
      [rowKey]: { ...(prev[rowKey] ?? {}), [type]: { value, source: 'manual', count: null } },
    }))
    setDirty(true)
  }

  // Loan report → averaged payoff months, filled into the grid unsaved so
  // they can be reviewed and edited before Save Changes.
  const importReport = async (file: File) => {
    const hasValues = Object.values(grid).some(r => Object.values(r ?? {}).some(c => c?.value.trim()))
    if (hasValues && !window.confirm(
      'Replace every value in the grid with averages from this report? Nothing is saved until you click Save Changes.',
    )) return
    setImporting(true); setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payoff-schedules/import', { method: 'POST', body: fd })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      const result = body as PayoffImportResult
      setGrid(toGrid(result.rows))
      setImported(result.summary)
      setDirty(true)
      setMsg({
        type: 'ok',
        text: `Filled ${result.summary.cells_filled} cells from ${result.summary.used} payoffs. Review or edit them, then click Save Changes.`,
      })
    } catch (e) {
      setMsg({ type: 'err', text: `Import failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const rows = useMemo(() => [
    { key: DEFAULT_ROW, name: 'Default (all other parents)', parentId: null as string | null },
    ...[...parents].sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ key: p.id, name: p.name, parentId: p.id as string | null })),
  ], [parents])

  // Cells that aren't 0.1–600 months (blank is fine). Tenths are kept.
  const invalid = useMemo(() => {
    const bad = new Set<string>()
    for (const r of rows) for (const t of TYPES) {
      const v = (grid[r.key]?.[t.type]?.value ?? '').trim()
      const n = Number(v)
      if (v && !(Number.isFinite(n) && n >= 0.1 && n <= 600)) bad.add(`${r.key}|${t.type}`)
    }
    return bad
  }, [grid, rows])

  const save = async () => {
    if (invalid.size > 0) {
      setMsg({ type: 'err', text: 'Payoff months must be from 0.1 to 600 — fix the highlighted cells.' })
      return
    }
    setSaving(true); setMsg(null)
    try {
      const body: PayoffSchedule[] = []
      for (const r of rows) for (const t of TYPES) {
        const cell = grid[r.key]?.[t.type]
        const v = (cell?.value ?? '').trim()
        if (v) body.push({
          parent_company_id: r.parentId, loan_type: t.type, payoff_months: Number(v),
          loan_count: cell?.source === 'import' ? cell.count : null,
          source: cell?.source ?? 'manual',
        })
      }
      const res = await fetch('/api/payoff-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const saved = await res.json().catch(() => null)
      if (!res.ok) throw new Error(saved?.error || `${res.status} ${res.statusText}`)
      setGrid(toGrid(saved as PayoffSchedule[]))
      setDirty(false)
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
  const defaultMonths = cellValue(DEFAULT_ROW, previewType)
  const months = Number(previewMonths || defaultMonths)
  const preview = useMemo(() => {
    if (!previewProgram || !(Number.isFinite(months) && months > 0)) return null
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
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[10px] text-accent">Unsaved changes</span>}
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importReport(f) }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing || saving}
            className="btn-secondary"
            title="Average the funded → completed months of the report’s Completed loans (last 2 years, 5+ payoffs per cell)"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'Importing…' : 'Import from loan report'}
          </button>
          <button onClick={save} disabled={saving || importing} className="btn-primary">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
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

      {imported && (
        <div className="card fade-up fade-up-1">
          <div className="card-header">
            <span className="card-title">Imported from loan report</span>
            <span className="text-[10px] text-fg-dim">
              Completed {imported.window_start} – {imported.window_end} · average of funded → completed months · {imported.used} payoffs used
            </span>
          </div>
          <div className="px-4 py-3 text-xs text-fg-dim space-y-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {TYPES.map(t => {
                const b = imported.by_type[t.type]
                return (
                  <span key={t.type}>
                    <span className="text-fg">{t.label}</span>{' '}
                    {b && b.loans > 0 ? `${b.average} mo · ${b.loans} loans` : 'no payoffs'}
                  </span>
                )
              })}
            </div>
            <div>
              {imported.loans_in_report} loans in the report · {imported.completed} completed · {imported.completed_in_window} in the window
              {imported.missing_dates > 0 && ` · ${imported.missing_dates} skipped for missing dates`}
              {imported.unclassified > 0 && ` · ${imported.unclassified} with no payoff loan type`}
              {imported.cells_below_min > 0 && ` · ${imported.cells_below_min} parent/type combinations had under 5 payoffs and were left blank (they use the Default row)`}
            </div>
            {imported.unassigned_loans > 0 && (
              <div className="text-accent">
                {imported.unassigned_loans} payoffs from {imported.unassigned_borrowers.length} borrowers didn’t match a parent company, so they count only toward the Default row
                {': '}{imported.unassigned_borrowers.slice(0, 8).map(b => `${b.borrower} (${b.loans})`).join(', ')}
                {imported.unassigned_borrowers.length > 8 && ` and ${imported.unassigned_borrowers.length - 8} more`}.
                {' '}Map them under Assumptions → Parent Companies and import again to give them their own rows.
              </div>
            )}
          </div>
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
                    const cell = grid[r.key]?.[t.type]
                    const fallback = r.parentId ? cellValue(DEFAULT_ROW, t.type) : ''
                    const isImport = cell?.source === 'import' && !!cell.value
                    const title = isImport
                      ? `Average of ${cell?.count ?? '?'} payoffs from the loan report — edit to override`
                      : cell?.value
                        ? 'Entered manually'
                        : fallback ? `Blank uses the Default row (${fallback} mo)` : 'Blank pays off at maturity'
                    return (
                      <td key={t.type} className="num">
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          inputMode="decimal"
                          value={cell?.value ?? ''}
                          placeholder={fallback || '—'}
                          title={title}
                          aria-label={`${r.name} ${TYPE_LABEL[t.type]} payoff months`}
                          onChange={e => setCell(r.key, t.type, e.target.value)}
                          className={`form-input w-20 text-right text-xs py-1 placeholder:italic placeholder:text-fg-dim/50
                                      ${isImport ? 'bg-accent/5 border-accent/30' : ''} ${bad ? 'border-danger' : ''}`}
                        />
                        <div className="text-[9px] text-fg-dim/80 h-3 leading-3 mt-0.5">
                          {isImport ? `avg · ${cell?.count} loans` : cell?.value ? 'manual' : ''}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-[10px] text-fg-dim border-t border-border space-y-1">
          <div>A parent’s own value wins; a blank cell falls back to the Default row, then to the loan’s maturity date. Tenths are kept (6.5 = 6 months and ~15 days).</div>
          <div><span className="text-accent">Shaded</span> cells hold an average imported from a loan report; editing one makes it a manual value.</div>
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
              type="number" min={0.1} step={0.1}
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
