'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HardHat, Plus, Save, Trash2, X, AlertCircle, CheckCircle, Pencil, TrendingDown,
} from 'lucide-react'
import { AAndDLoan, Builder, ForecastResult } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { LandBucketProjectionChart } from '@/components/charts/PortfolioCharts'

// Reuses the per-project color palette from /land-bucket so the two projection
// charts feel consistent. Loans are sorted by name before colors are assigned
// so the mapping stays stable across reloads.
const PROJECT_PALETTE = [
  '#58A6FF', '#D4A853', '#3FB950', '#A371F7', '#F85149', '#79C0FF',
  '#56D364', '#FF9E45', '#9CA3AF', '#EF6B6B', '#6EE7B7', '#FCD34D',
]

type FormState = Omit<AAndDLoan, 'id'> & { id?: string }

const emptyForm = (): FormState => ({
  name: '',
  builder_id: null,
  initial_balance: 0,
  total_loan_amount: 0,
  total_lots: 0,
  lot_release_premium_pct: 110,
  interest_rate: 0.0525,
  origination_date: null,
  draw_period_months: 12,
  release_start_date: null,
  release_period_months: 12,
  draw_schedule: {},
  release_schedule: {},
  notes: null,
})

export default function AAndDPage() {
  const [loans, setLoans]       = useState<AAndDLoan[]>([])
  const [builders, setBuilders] = useState<Builder[]>([])
  const [forecast, setForecast] = useState<ForecastResult | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<FormState | null>(null)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      // cache:'no-store' so the browser HTTP cache can't serve a pre-save
      // snapshot after the user edits and we re-fetch — without it, Save can
      // succeed in the DB yet the page still renders the original values.
      const [l, b, fc] = await Promise.all([
        fetch('/api/a-and-d-loans', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/builders', { cache: 'no-store' }).then(r => r.json()),
        // Forecast is best-effort — a missing version shouldn't block edits.
        fetch('/api/calculate', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setLoans(Array.isArray(l) ? l : [])
      setBuilders(Array.isArray(b) ? b : [])
      setForecast(fc && !fc.error ? fc : null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Always stringify API errors safely so we never render "[object Object]"
  // if the API returns a non-string error payload.
  async function readError(r: Response, fallback: string): Promise<string> {
    const text = await r.text().catch(() => '')
    let parsed: unknown = null
    try { parsed = text ? JSON.parse(text) : null } catch { /* keep raw */ }
    const err = (parsed && typeof parsed === 'object' && 'error' in parsed)
      ? (parsed as { error: unknown }).error : null
    if (typeof err === 'string' && err.trim()) return err
    if (err && typeof err === 'object') return JSON.stringify(err)
    if (text) return `${r.status} ${r.statusText || fallback}: ${text.slice(0, 300)}`
    return `${r.status} ${r.statusText || fallback}`
  }

  const save = async () => {
    if (!editing) return
    setBusy(true); setMsg(null)
    try {
      const url = editing.id
        ? `/api/a-and-d-loans/${editing.id}`
        : '/api/a-and-d-loans'
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) throw new Error(await readError(res, 'Save failed'))
      setMsg({ type: 'ok', text: editing.id ? 'Loan updated.' : 'Loan created.' })
      setEditing(null)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setBusy(false) }
  }

  const remove = async (loan: AAndDLoan) => {
    if (!confirm(`Delete "${loan.name}"? This cannot be undone.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/a-and-d-loans/${loan.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Delete failed'))
      setMsg({ type: 'ok', text: `"${loan.name}" deleted.` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>

  return (
    <div className="p-6 space-y-6 max-w-[1227px]">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <HardHat className="w-5 h-5 text-accent" />
            A&amp;D Loans
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {loans.length} loan(s) · forward-planned Acquisition &amp; Development facilities
            (initial principal → 90% draw → lot-release pay-down)
          </p>
        </div>
        <button onClick={() => setEditing(emptyForm())} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New A&amp;D Loan
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

      <ProjectionCard forecast={forecast} loanCount={loans.length} />

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Loan</th>
                <th>Builder</th>
                <th className="text-right">Initial $</th>
                <th className="text-right">Total $</th>
                <th className="text-right">Lots</th>
                <th className="text-right">Premium</th>
                <th className="text-right">Rate</th>
                <th>Orig. → Release</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-xs text-fg-dim py-8">
                  No A&amp;D loans yet. Click <span className="text-accent">New A&amp;D Loan</span> to add one.
                </td></tr>
              ) : groupByBuilder(loans, builders).map(group => (
                <BuilderGroup
                  key={group.key}
                  group={group}
                  busy={busy}
                  onEdit={l => setEditing({ ...l })}
                  onDelete={remove}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ImportedAAndDCard forecast={forecast} />

      {editing && (
        <LoanEditor
          form={editing}
          builders={builders}
          busy={busy}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

// ─── Editor modal ───────────────────────────────────────────────────────────

function LoanEditor({
  form, builders, busy, onChange, onCancel, onSave,
}: {
  form: FormState
  builders: Builder[]
  busy: boolean
  onChange: (f: FormState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const u = (patch: Partial<FormState>) => onChange({ ...form, ...patch })

  // Computed previews so the user can sanity-check inputs at a glance.
  const peak = form.total_loan_amount * 0.9
  const releasePrice = form.total_lots > 0
    ? (form.total_loan_amount / form.total_lots) * (form.lot_release_premium_pct / 100)
    : 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border-strong rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium text-fg-strong">
            {form.id ? 'Edit A&D Loan' : 'New A&D Loan'}
          </div>
          <button onClick={onCancel} className="text-fg-dim hover:text-danger">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className="form-input" value={form.name}
                   onChange={e => u({ name: e.target.value })} />
          </Field>
          <Field label="Builder">
            <select className="form-input" value={form.builder_id ?? ''}
                    onChange={e => u({ builder_id: e.target.value || null })}>
              <option value="">— none —</option>
              {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>

          <Field label="Initial Balance ($)" hint="Land + closing costs at origination">
            <input type="number" step="10000" className="form-input text-right" value={form.initial_balance}
                   onChange={e => u({ initial_balance: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Total Loan Amount ($)" hint={`Ramps toward 90% peak ≈ ${formatCurrency(peak, true)}`}>
            <input type="number" step="10000" className="form-input text-right" value={form.total_loan_amount}
                   onChange={e => u({ total_loan_amount: Number(e.target.value) || 0 })} />
          </Field>

          <Field label="Total Lots">
            <input type="number" className="form-input text-right" value={form.total_lots}
                   onChange={e => u({ total_lots: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Lot Release Premium (%)" hint={`Release $/lot ≈ ${formatCurrency(releasePrice, true)}`}>
            <input type="number" step="0.1" className="form-input text-right" value={form.lot_release_premium_pct}
                   onChange={e => u({ lot_release_premium_pct: Number(e.target.value) || 0 })} />
          </Field>

          <Field label="Interest Rate (%)">
            <input type="number" step="0.01" className="form-input text-right"
                   value={(form.interest_rate * 100).toFixed(2)}
                   onChange={e => u({ interest_rate: Number(e.target.value) / 100 })} />
          </Field>
          <Field label="Origination Date">
            <input type="date" className="form-input" value={form.origination_date ?? ''}
                   onChange={e => u({ origination_date: e.target.value || null })} />
          </Field>

          <Field label="Draw Period (months)" hint="Linear ramp unless overridden below">
            <input type="number" className="form-input text-right" value={form.draw_period_months}
                   onChange={e => u({ draw_period_months: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Release Start Date">
            <input type="date" className="form-input" value={form.release_start_date ?? ''}
                   onChange={e => u({ release_start_date: e.target.value || null })} />
          </Field>

          <Field label="Release Period (months)" hint="Even release unless overridden below">
            <input type="number" className="form-input text-right" value={form.release_period_months}
                   onChange={e => u({ release_period_months: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <div />

          <div className="col-span-2">
            <MonthlyGrid
              label="Monthly Draw Override ($)"
              hint="Optional — when non-zero, overrides the linear ramp for that month."
              startDate={form.origination_date}
              numMonths={form.draw_period_months}
              value={form.draw_schedule}
              step={10000}
              onChange={v => u({ draw_schedule: v })}
            />
          </div>

          <div className="col-span-2">
            <MonthlyGrid
              label="Monthly Release Override (lots)"
              hint="Optional — when non-zero, overrides the even release for that month."
              startDate={form.release_start_date}
              numMonths={form.release_period_months}
              value={form.release_schedule}
              step={1}
              onChange={v => u({ release_schedule: v })}
            />
          </div>

          <div className="col-span-2">
            <Field label="Notes">
              <textarea className="form-input h-16 resize-y" value={form.notes ?? ''}
                        onChange={e => u({ notes: e.target.value || null })} />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onSave} disabled={busy || !form.name.trim()} className="btn-primary">
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Create Loan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-fg-dim mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-fg-dim mt-0.5 italic">{hint}</div>}
    </div>
  )
}

// ─── Per-month override grid ────────────────────────────────────────────────
// Re-used for both draw_schedule and release_schedule. Starts at the given
// startDate and runs for numMonths. Any stored entries outside the window are
// preserved + shown separately so a date change doesn't silently drop data.

function MonthlyGrid({
  label, hint, startDate, numMonths, value, step, onChange,
}: {
  label: string
  hint: string
  startDate: string | null
  numMonths: number
  value: Record<string, number>
  step: number
  onChange: (v: Record<string, number>) => void
}) {
  const monthKeys = startDate && numMonths > 0
    ? generateMonthKeys(startDate, numMonths)
    : []
  const inWindow = new Set(monthKeys)
  const orphanKeys = Object.keys(value).filter(k => !inWindow.has(k)).sort()
  const total = Object.values(value).reduce((s, n) => s + (Number(n) || 0), 0)

  const set = (k: string, v: number) => {
    const next = { ...value }
    if (v > 0) next[k] = v
    else delete next[k]
    onChange(next)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-fg-dim">{label}</div>
        <div className="flex items-center gap-2 text-[10px] text-fg-dim">
          <span>Total entered: <span className="text-fg font-mono">{total.toLocaleString()}</span></span>
          {Object.keys(value).length > 0 && (
            <button type="button" onClick={() => onChange({})} className="btn-ghost text-[10px] py-0.5 px-1.5">Clear</button>
          )}
        </div>
      </div>
      {monthKeys.length === 0 ? (
        <div className="text-[10px] text-fg-dim italic">
          Set the start date and period above to populate the per-month grid.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 p-3 rounded border border-border-strong">
          {monthKeys.map(k => (
            <label key={k} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-fg-dim w-14 shrink-0">{k}</span>
              <input type="number" min={0} step={step}
                     className="form-input text-right text-xs py-1 px-2"
                     value={value[k] ?? 0}
                     onChange={e => set(k, Math.max(0, Number(e.target.value) || 0))} />
            </label>
          ))}
        </div>
      )}
      {orphanKeys.length > 0 && (
        <div className="mt-2 p-2 rounded border border-danger/40 bg-danger/5">
          <div className="text-[10px] text-danger mb-1">
            {orphanKeys.length} entr{orphanKeys.length === 1 ? 'y' : 'ies'} outside the current window:
          </div>
          <div className="grid grid-cols-4 gap-2">
            {orphanKeys.map(k => (
              <label key={k} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-fg-dim w-14 shrink-0">{k}</span>
                <input type="number" min={0} step={step}
                       className="form-input text-right text-xs py-1 px-2"
                       value={value[k] ?? 0}
                       onChange={e => set(k, Math.max(0, Number(e.target.value) || 0))} />
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="text-[10px] text-fg-dim mt-1 italic">{hint}</div>
    </div>
  )
}

function generateMonthKeys(startDate: string, count: number): string[] {
  const [y, m] = startDate.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const yi = y + Math.floor(((m - 1) + i) / 12)
    const mi = (((m - 1) + i) % 12 + 12) % 12
    return `${yi}-${String(mi + 1).padStart(2, '0')}`
  })
}

// ─── Builder grouping + table rows ──────────────────────────────────────────

interface LoanGroup {
  key: string
  builderName: string
  loans: AAndDLoan[]
}

function groupByBuilder(loans: AAndDLoan[], builders: Builder[]): LoanGroup[] {
  const buildersById = new Map(builders.map(b => [b.id, b]))
  const groups = new Map<string, LoanGroup>()
  for (const l of loans) {
    const key = l.builder_id ?? '__none__'
    const builderName = l.builder_id
      ? buildersById.get(l.builder_id)?.name ?? '(unknown builder)'
      : '(no builder)'
    if (!groups.has(key)) groups.set(key, { key, builderName, loans: [] })
    groups.get(key)!.loans.push(l)
  }
  const arr = Array.from(groups.values())
  for (const g of arr) g.loans.sort((a, b) => a.name.localeCompare(b.name))
  arr.sort((a, b) => {
    if (a.key === '__none__') return 1
    if (b.key === '__none__') return -1
    return a.builderName.localeCompare(b.builderName)
  })
  return arr
}

function BuilderGroup({
  group, busy, onEdit, onDelete,
}: {
  group: LoanGroup
  busy: boolean
  onEdit: (l: AAndDLoan) => void
  onDelete: (l: AAndDLoan) => void
}) {
  return (
    <>
      {group.loans.map(l => (
        <tr key={l.id}>
          <td className="text-fg font-medium">{l.name}</td>
          <td>{group.key === '__none__' ? <span className="text-fg-dim">—</span> : group.builderName}</td>
          <td className="num">{formatCurrency(l.initial_balance, true)}</td>
          <td className="num">{formatCurrency(l.total_loan_amount, true)}</td>
          <td className="num">{l.total_lots}</td>
          <td className="num">{Number(l.lot_release_premium_pct).toFixed(1)}%</td>
          <td className="num">{(l.interest_rate * 100).toFixed(2)}%</td>
          <td className="text-[10px] font-mono">
            {(l.origination_date ?? '—')} → {(l.release_start_date ?? '—')}
          </td>
          <td>
            <div className="flex gap-1 justify-end">
              <button onClick={() => onEdit(l)} className="btn-ghost" title="Edit"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => onDelete(l)} disabled={busy}
                      className="btn-ghost text-danger" title="Delete"><Trash2 className="w-3 h-3" /></button>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

// ─── Projection card ────────────────────────────────────────────────────────

function ProjectionCard({
  forecast, loanCount,
}: {
  forecast: ForecastResult | null
  loanCount: number
}) {
  // One series per planned loan + a single aggregated 'Imported A&D' series
  // so the chart stays readable even when there are many imported loans.
  const loanSeries = useMemo(() => {
    if (!forecast) return [] as { name: string; color: string }[]
    const names = [...forecast.a_and_d_schedules]
      .map(s => s.loan_name)
      .sort((a, b) => a.localeCompare(b))
    const series = names.map((name, i) => ({
      name, color: PROJECT_PALETTE[i % PROJECT_PALETTE.length],
    }))
    if (forecast.imported_a_and_d_schedules.length > 0) {
      series.push({ name: 'Imported A&D', color: '#8B949E' })
    }
    return series
  }, [forecast])

  const chartData = useMemo(() => {
    if (!forecast) return []
    return forecast.months.map((m, i) => {
      const row: Record<string, number | string> = { label: m.label, month: m.month }
      for (const sch of forecast.a_and_d_schedules) {
        row[sch.loan_name] = sch.months[i]?.starting_balance ?? 0
      }
      if (forecast.imported_a_and_d_schedules.length > 0) {
        let importedTotal = 0
        for (const sch of forecast.imported_a_and_d_schedules) {
          importedTotal += sch.months[i]?.starting_balance ?? 0
        }
        row['Imported A&D'] = importedTotal
      }
      return row
    })
  }, [forecast])

  const aggregate = useMemo(() => {
    if (!forecast) {
      return [] as { month: string; label: string; balance: number; draws: number;
                     lotsReleased: number; lotsReleasedCum: number; proceeds: number }[]
    }
    return forecast.months.map((_, i) => {
      let balance = 0, draws = 0, lots = 0, lotsCum = 0, proceeds = 0
      for (const sch of forecast.a_and_d_schedules) {
        const row = sch.months[i]
        if (!row) continue
        balance         += row.starting_balance
        draws           += row.draw_this_month
        lots            += row.lots_released
        lotsCum         += row.lots_released_cum
        proceeds        += row.release_proceeds
      }
      // Imported A&D loans contribute to the balance row only (no draws,
      // releases, or lot accounting — they're treated flat until maturity).
      for (const sch of forecast.imported_a_and_d_schedules) {
        balance += sch.months[i]?.starting_balance ?? 0
      }
      return {
        month: forecast.months[i].month,
        label: forecast.months[i].label,
        balance, draws, lotsReleased: lots, lotsReleasedCum: lotsCum, proceeds,
      }
    })
  }, [forecast])

  const hasAnyData = forecast &&
    (forecast.a_and_d_schedules.length > 0 || forecast.imported_a_and_d_schedules.length > 0)
  if (!hasAnyData) {
    return (
      <div className="card fade-up fade-up-1.5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-fg-strong">A&amp;D Projection</span>
        </div>
        <p className="text-xs text-fg-dim">
          {loanCount === 0
            ? 'Add an A&D loan below to see the projection.'
            : 'No forecast data yet. Once a Current Report is imported and the engine runs, the projection will appear here.'}
        </p>
      </div>
    )
  }

  const lastBalance = aggregate[aggregate.length - 1]?.balance ?? 0
  const firstBalance = aggregate[0]?.balance ?? 0
  const totalDraws = aggregate.reduce((s, r) => s + r.draws, 0)
  const totalProceeds = aggregate.reduce((s, r) => s + r.proceeds, 0)

  return (
    <div className="card fade-up fade-up-1.5">
      <div className="card-header flex items-center justify-between">
        <span className="card-title flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-accent" />
          A&amp;D Projection
        </span>
        <span className="text-[10px] text-fg-dim font-mono">
          {aggregate[0]?.label} → {aggregate[aggregate.length - 1]?.label}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border">
        <Kpi label="Starting balance"    value={formatCurrency(firstBalance, true)} />
        <Kpi label={`End balance · ${aggregate[aggregate.length - 1]?.label ?? '—'}`}
             value={formatCurrency(lastBalance, true)} />
        <Kpi label="Total draws"         value={formatCurrency(totalDraws, true)} />
        <Kpi label="Total release proceeds" value={formatCurrency(totalProceeds, true)} />
      </div>

      <div className="p-4">
        <LandBucketProjectionChart data={chartData} projects={loanSeries} />
        <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-fg-dim">
          {loanSeries.map(p => (
            <span key={p.name} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface">Metric</th>
              {aggregate.map(r => <th key={r.month} className="text-right">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-border/30 font-medium text-fg-strong">
              <td className="sticky left-0 z-10 bg-border/30 text-fg-strong">Balance</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{formatCurrency(r.balance, true)}</td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Draws</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">
                  {r.draws ? formatCurrency(r.draws, true) : <span className="text-fg-dim">—</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Lots released</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{r.lotsReleased || <span className="text-fg-dim">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Lots released (cum.)</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{r.lotsReleasedCum || <span className="text-fg-dim">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Release proceeds</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">
                  {r.proceeds ? formatCurrency(r.proceeds, true) : <span className="text-fg-dim">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-fg-dim mb-0.5">{label}</div>
      <div className="text-sm font-medium text-fg-strong font-mono">{value}</div>
    </div>
  )
}

// ─── Imported A&D loans (read-only) ─────────────────────────────────────────
// Loans whose loan_type is 'A&D' on the active Current Report. The engine
// continues to project them flat-until-maturity; this card just surfaces
// them on the A&D tab for visibility next to the forward-planned loans.

function ImportedAAndDCard({ forecast }: { forecast: ForecastResult | null }) {
  if (!forecast || forecast.imported_a_and_d_schedules.length === 0) return null

  const rows = [...forecast.imported_a_and_d_schedules]
    .sort((a, b) => a.loan_name.localeCompare(b.loan_name))

  return (
    <div className="card fade-up fade-up-2">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">Imported A&amp;D Loans · read-only</span>
        <span className="text-[10px] text-fg-dim">
          {rows.length} loan{rows.length === 1 ? '' : 's'} · loan_type = &lsquo;A&amp;D&rsquo; from the active Current Report
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Loan #</th>
              <th>Name</th>
              <th>Maturity</th>
              <th className="text-right">Commitment</th>
              <th className="text-right">Current Loan Amount</th>
              <th className="text-right">Current Balance</th>
              <th className="text-right">End of Horizon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const first = s.months[0]?.starting_balance ?? 0
              const last  = s.months[s.months.length - 1]?.starting_balance ?? 0
              return (
                <tr key={s.loan_id}>
                  <td className="text-fg font-mono text-[10px]">{s.loan_name}</td>
                  <td className="text-fg">{s.imported_borrower || <span className="text-fg-dim">—</span>}</td>
                  <td className="text-[10px] font-mono">{s.imported_maturity_date ?? '—'}</td>
                  <td className="num">{formatCurrency(s.total_loan_amount, true)}</td>
                  <td className="num">{formatCurrency(s.imported_current_loan_amount ?? 0, true)}</td>
                  <td className="num">{formatCurrency(first, true)}</td>
                  <td className="num">{formatCurrency(last, true)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
