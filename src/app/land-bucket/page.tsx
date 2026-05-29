'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Landmark, Plus, Save, Trash2, X, AlertCircle, CheckCircle, Pencil, TrendingDown,
} from 'lucide-react'
import { LandBucketProject, Builder, LoanProgram, ForecastResult } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { LandBucketProjectionChart } from '@/components/charts/PortfolioCharts'

// Deterministic palette for the stacked-area projection chart — projects are
// sorted by name before colors are assigned so the mapping is stable.
const PROJECT_PALETTE = [
  '#58A6FF', '#D4A853', '#3FB950', '#A371F7', '#F85149', '#79C0FF',
  '#56D364', '#FF9E45', '#9CA3AF', '#EF6B6B', '#6EE7B7', '#FCD34D',
]

type FormState = Omit<LandBucketProject, 'id'> & { id?: string }

const emptyForm = (): FormState => ({
  name: '',
  builder_id: null,
  total_lots: 0,
  lot_price: 0,
  absorption_rate: null,
  balance_outstanding: 0,
  interest_rate: 0.0525,
  dev_start_date: null,
  dev_end_date: null,
  lot_sales_start_date: null,
  vertical_loan_program_id: null,
  vertical_loan_amount: null,
  lot_release_schedule: {},
  notes: null,
})

export default function LandBucketPage() {
  const [projects, setProjects] = useState<LandBucketProject[]>([])
  const [builders, setBuilders] = useState<Builder[]>([])
  const [programs, setPrograms] = useState<LoanProgram[]>([])
  const [forecast, setForecast] = useState<ForecastResult | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<FormState | null>(null)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [p, b, lp, fc] = await Promise.all([
        fetch('/api/land-bucket-projects').then(r => r.json()),
        fetch('/api/builders').then(r => r.json()),
        fetch('/api/loan-programs').then(r => r.json()),
        // Forecast is best-effort — a bad import or missing config shouldn't
        // block the project editor. Empty schedule just hides the projection.
        fetch('/api/calculate').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setProjects(Array.isArray(p) ? p : [])
      setBuilders(Array.isArray(b) ? b : [])
      setPrograms(Array.isArray(lp) ? lp : [])
      setForecast(fc && !fc.error ? fc : null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    setBusy(true); setMsg(null)
    try {
      const url    = editing.id ? `/api/land-bucket-projects/${editing.id}` : '/api/land-bucket-projects'
      const method = editing.id ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setMsg({ type: 'ok', text: editing.id ? 'Project updated.' : 'Project created.' })
      setEditing(null)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setBusy(false) }
  }

  const remove = async (p: LandBucketProject) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/land-bucket-projects/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      setMsg({ type: 'ok', text: `"${p.name}" deleted.` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { setBusy(false) }
  }

  // Updates builders.parent_company_id (migration 013) inline from the
  // builder chip strip. Refreshes so the forecast picks up the new mapping.
  const setBuilderParent = async (builderId: string, parentId: string | null) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/builders/${builderId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_company_id: parentId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed')
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Update failed' })
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <Landmark className="w-5 h-5 text-accent" />
            Land Bucket Projects
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {projects.length} project(s) · edit per-project assumptions or add a new development
          </p>
        </div>
        <button onClick={() => setEditing(emptyForm())} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New Project
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

      <ProjectionCard forecast={forecast} projects={projects} />

      <div className="card fade-up fade-up-1.5 p-3 mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-fg-dim mr-2">Builders:</span>
        {builders.length === 0
          ? <span className="text-[10px] text-danger">No builders found — add one →</span>
          : builders.map(b => (
              <BuilderParentChip
                key={b.id}
                builder={b}
                parents={forecast?.parent_companies ?? []}
                onChange={parentId => setBuilderParent(b.id, parentId)}
              />
            ))}
        <BuilderAdder onAdded={load} />
      </div>

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Builder</th>
                <th className="text-right">Lots</th>
                <th className="text-right">Lot Price</th>
                <th className="text-right">Absorption</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Land Rate</th>
                <th className="text-right">Vert. $/Loan</th>
                <th>Vertical Program</th>
                <th>Sales Start</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-xs text-fg-dim py-8">
                  No land bucket projects yet. Click <span className="text-accent">New Project</span> to add one.
                </td></tr>
              ) : groupByBuilder(projects, builders).map(group => (
                <BuilderGroup
                  key={group.key}
                  group={group}
                  programs={programs}
                  busy={busy}
                  onEdit={p => setEditing({ ...p, lot_release_schedule: p.lot_release_schedule ?? {} })}
                  onDelete={remove}
                />
              ))}
              {projects.length > 0 && <GrandTotalRow projects={projects} />}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ProjectEditor
          form={editing}
          builders={builders}
          programs={programs}
          busy={busy}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function ProjectEditor({
  form, builders, programs, busy, onChange, onCancel, onSave,
}: {
  form: FormState
  builders: Builder[]
  programs: LoanProgram[]
  busy: boolean
  onChange: (f: FormState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const u = (patch: Partial<FormState>) => onChange({ ...form, ...patch })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border-strong rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium text-fg-strong">
            {form.id ? 'Edit Project' : 'New Project'}
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
          <Field label="Total Lots">
            <input type="number" className="form-input text-right" value={form.total_lots}
                   onChange={e => u({ total_lots: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Lot Price ($)">
            <input type="number" step="1000" className="form-input text-right" value={form.lot_price}
                   onChange={e => u({ lot_price: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Absorption (lots/mo)" hint="Blank = use builder default">
            <input type="number" step="0.1" className="form-input text-right"
                   value={form.absorption_rate ?? ''}
                   onChange={e => u({ absorption_rate: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Balance Outstanding ($)">
            <input type="number" step="10000" className="form-input text-right" value={form.balance_outstanding}
                   onChange={e => u({ balance_outstanding: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Land Interest Rate (%)">
            <input type="number" step="0.01" className="form-input text-right"
                   value={(form.interest_rate * 100).toFixed(2)}
                   onChange={e => u({ interest_rate: Number(e.target.value) / 100 })} />
          </Field>
          <Field label="Vertical Loan Amount ($)" hint="Blank = lot_price × 3 default">
            <input type="number" step="1000" className="form-input text-right"
                   value={form.vertical_loan_amount ?? ''}
                   onChange={e => u({ vertical_loan_amount: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Vertical Loan Program">
            <select className="form-input" value={form.vertical_loan_program_id ?? ''}
                    onChange={e => u({ vertical_loan_program_id: e.target.value || null })}>
              <option value="">— none —</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Dev Start">
            <input type="date" className="form-input" value={form.dev_start_date ?? ''}
                   onChange={e => u({ dev_start_date: e.target.value || null })} />
          </Field>
          <Field label="Dev End">
            <input type="date" className="form-input" value={form.dev_end_date ?? ''}
                   onChange={e => u({ dev_end_date: e.target.value || null })} />
          </Field>
          <Field label="Lot Sales Start">
            <input type="date" className="form-input" value={form.lot_sales_start_date ?? ''}
                   onChange={e => u({ lot_sales_start_date: e.target.value || null })} />
          </Field>

          <div className="col-span-2">
            <LotReleaseScheduleEditor
              startDate={form.lot_sales_start_date}
              totalLots={form.total_lots}
              value={form.lot_release_schedule ?? {}}
              onChange={v => u({ lot_release_schedule: v })}
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
            {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Create Project'}
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

// Per-month grid replacing the old JSON textarea. The grid starts at the
// project's Lot Sales Start month and runs forward for HORIZON_MONTHS. Any
// existing entries outside that window (e.g. the user changed the start date
// after entering values) are still preserved on the row and listed below the
// grid so they don't silently disappear.
const HORIZON_MONTHS = 24

function nextMonthKey(year: number, monthIdx0: number): string {
  // monthIdx0 is 0-based (Jan = 0). Returns 'YYYY-MM'.
  const y = year + Math.floor(monthIdx0 / 12)
  const m = ((monthIdx0 % 12) + 12) % 12
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

function generateMonthList(startDate: string, count: number): string[] {
  // startDate is 'YYYY-MM-DD'. Returns N consecutive month keys 'YYYY-MM'.
  const [y, m] = startDate.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => nextMonthKey(y, (m - 1) + i))
}

function LotReleaseScheduleEditor({
  startDate, totalLots, value, onChange,
}: {
  startDate: string | null
  totalLots: number
  value: Record<string, number>
  onChange: (v: Record<string, number>) => void
}) {
  const months = startDate ? generateMonthList(startDate, HORIZON_MONTHS) : []
  const monthsSet = new Set(months)
  // Any stored entries that fall outside the generated window — usually because
  // the user moved Lot Sales Start later — kept visible so nothing is lost.
  const orphanKeys = Object.keys(value).filter(k => !monthsSet.has(k)).sort()

  const total = Object.values(value).reduce((s, n) => s + (Number(n) || 0), 0)

  const set = (monthKey: string, lots: number) => {
    const next = { ...value }
    if (lots > 0) next[monthKey] = lots
    else delete next[monthKey]
    onChange(next)
  }
  const clearAll = () => onChange({})

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-fg-dim">Manual Lot Release Schedule</div>
        <div className="flex items-center gap-2 text-[10px] text-fg-dim">
          <span>
            Scheduled: <span className="text-fg font-mono">{total}</span>
            {totalLots > 0 && <> / <span className="font-mono">{totalLots}</span></>}
          </span>
          {Object.keys(value).length > 0 && (
            <button type="button" onClick={clearAll} className="btn-ghost text-[10px] py-0.5 px-1.5">
              Clear
            </button>
          )}
        </div>
      </div>

      {!startDate ? (
        <div className="text-[10px] text-fg-dim italic">
          Set <strong>Lot Sales Start</strong> above to populate the per-month schedule.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 p-3 rounded border border-border-strong">
          {months.map(monthKey => (
            <label key={monthKey} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-fg-dim w-14 shrink-0">{monthKey}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="form-input text-right text-xs py-1 px-2"
                value={value[monthKey] ?? 0}
                onChange={e => set(monthKey, Math.max(0, parseInt(e.target.value) || 0))}
              />
            </label>
          ))}
        </div>
      )}

      {orphanKeys.length > 0 && (
        <div className="mt-2 p-2 rounded border border-danger/40 bg-danger/5">
          <div className="text-[10px] text-danger mb-1">
            {orphanKeys.length} entr{orphanKeys.length === 1 ? 'y' : 'ies'} outside the current Lot Sales Start window:
          </div>
          <div className="grid grid-cols-4 gap-2">
            {orphanKeys.map(k => (
              <label key={k} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-fg-dim w-14 shrink-0">{k}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="form-input text-right text-xs py-1 px-2"
                  value={value[k] ?? 0}
                  onChange={e => set(k, Math.max(0, parseInt(e.target.value) || 0))}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-fg-dim mt-1 italic">
        Optional. When any value is non-zero, this schedule overrides the absorption rate.
        Set every month to 0 (or click Clear) to fall back to absorption.
      </div>
    </div>
  )
}

// One chip per builder. Shows the builder's name and (if assigned) its parent
// company; clicking opens an inline parent picker. Available parents come
// from forecast.parent_companies so the strip can attach to any parent the
// user has set up on Assumptions.
function BuilderParentChip({
  builder, parents, onChange,
}: {
  builder: Builder
  parents: { id: string; name: string }[]
  onChange: (parentId: string | null) => void
}) {
  const parentName = builder.parent_company_id
    ? parents.find(p => p.id === builder.parent_company_id)?.name ?? '(unknown)'
    : null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-border/40 text-[10px]">
      <span className="text-fg">{builder.name}</span>
      <span className="text-fg-dim">·</span>
      <select
        value={builder.parent_company_id ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="bg-transparent text-[10px] outline-none text-fg-dim hover:text-fg focus:text-fg cursor-pointer"
        title={parentName ? `Parent: ${parentName}` : 'Set parent company'}
      >
        <option value="">— no parent —</option>
        {parents.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </span>
  )
}

// Inline "+ Add builder" control on the Land Bucket page. Lets the user add a
// builder without an SQL migration, then refreshes the page state so the new
// builder appears in the Project Editor dropdown.
function BuilderAdder({ onAdded }: { onAdded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/builders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const text = await res.text()
      let body: { error?: string } | null = null
      try { body = text ? JSON.parse(text) : null } catch { /* ignore */ }
      if (!res.ok) {
        throw new Error(body?.error || text || `${res.status} ${res.statusText}`)
      }
      setName('')
      setOpen(false)
      await onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Add failed')
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost text-[10px]">
        <Plus className="w-3 h-3" /> Add builder
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
        placeholder="Builder name"
        className="form-input text-[10px] py-0.5 px-2 w-32"
      />
      <button onClick={submit} disabled={busy || !name.trim()} className="btn-primary text-[10px] py-0.5 px-2">
        {busy ? '…' : 'Save'}
      </button>
      <button onClick={() => { setOpen(false); setName(''); setErr(null) }}
              className="btn-ghost text-[10px] py-0.5 px-2">Cancel</button>
      {err && <span className="text-[10px] text-danger ml-1">{err}</span>}
    </span>
  )
}

interface ProjectGroup {
  key: string                // builder id, or '__none__' for projects without a builder
  builderName: string        // display name, '(no builder)' for the unassigned bucket
  projects: LandBucketProject[]
}

// Group projects by builder, sort groups alphabetically (unassigned last), sort
// projects within each group by name.
function groupByBuilder(projects: LandBucketProject[], builders: Builder[]): ProjectGroup[] {
  const buildersById = new Map(builders.map(b => [b.id, b]))
  const groups = new Map<string, ProjectGroup>()

  for (const p of projects) {
    const key = p.builder_id ?? '__none__'
    const builderName = p.builder_id
      ? buildersById.get(p.builder_id)?.name ?? '(unknown builder)'
      : '(no builder)'
    if (!groups.has(key)) groups.set(key, { key, builderName, projects: [] })
    groups.get(key)!.projects.push(p)
  }

  const arr = Array.from(groups.values())
  for (const g of arr) g.projects.sort((a, b) => a.name.localeCompare(b.name))
  arr.sort((a, b) => {
    if (a.key === '__none__') return 1
    if (b.key === '__none__') return -1
    return a.builderName.localeCompare(b.builderName)
  })
  return arr
}

function BuilderGroup({
  group, programs, busy, onEdit, onDelete,
}: {
  group: ProjectGroup
  programs: LoanProgram[]
  busy: boolean
  onEdit: (p: LandBucketProject) => void
  onDelete: (p: LandBucketProject) => void
}) {
  const subtotal = sumProjects(group.projects)
  return (
    <>
      {group.projects.map(p => {
        const lp = programs.find(x => x.id === p.vertical_loan_program_id)
        return (
          <tr key={p.id}>
            <td className="text-fg font-medium">{p.name}</td>
            <td>{group.key === '__none__'
              ? <span className="text-fg-dim">—</span>
              : group.builderName}</td>
            <td className="num">{p.total_lots}</td>
            <td className="num">{formatCurrency(p.lot_price, true)}</td>
            <td className="num">{p.absorption_rate ?? <span className="text-fg-dim">builder</span>}</td>
            <td className="num">{formatCurrency(p.balance_outstanding, true)}</td>
            <td className="num">{(p.interest_rate * 100).toFixed(2)}%</td>
            <td className="num">
              {p.vertical_loan_amount != null
                ? formatCurrency(p.vertical_loan_amount, true)
                : <span className="text-fg-dim">3× lot</span>}
            </td>
            <td>{lp?.name ?? <span className="text-fg-dim">—</span>}</td>
            <td className="text-[10px] font-mono">{p.lot_sales_start_date ?? '—'}</td>
            <td className="flex gap-1">
              <button onClick={() => onEdit(p)} className="btn-ghost"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => onDelete(p)} disabled={busy}
                      className="btn-ghost text-danger"><Trash2 className="w-3 h-3" /></button>
            </td>
          </tr>
        )
      })}
      <tr className="bg-border/50 text-accent font-medium">
        <td colSpan={2} className="uppercase text-[10px] tracking-wide">
          {group.builderName} subtotal · {group.projects.length} project{group.projects.length === 1 ? '' : 's'}
        </td>
        <td className="num">{subtotal.lots}</td>
        <td className="num text-fg-dim">—</td>
        <td className="num">{subtotal.absorption == null ? '—' : subtotal.absorption.toFixed(1)}</td>
        <td className="num">{formatCurrency(subtotal.balance, true)}</td>
        <td className="num text-fg-dim">—</td>
        <td className="num text-fg-dim">—</td>
        <td className="text-fg-dim">—</td>
        <td className="text-fg-dim">—</td>
        <td />
      </tr>
    </>
  )
}

function GrandTotalRow({ projects }: { projects: LandBucketProject[] }) {
  const total = sumProjects(projects)
  return (
    <tr className="bg-accent/10 text-fg-strong font-semibold border-t-2 border-accent/40">
      <td colSpan={2} className="uppercase text-[10px] tracking-wide">
        Grand total · {projects.length} project{projects.length === 1 ? '' : 's'}
      </td>
      <td className="num">{total.lots}</td>
      <td className="num text-fg-dim">—</td>
      <td className="num">{total.absorption == null ? '—' : total.absorption.toFixed(1)}</td>
      <td className="num">{formatCurrency(total.balance, true)}</td>
      <td className="num text-fg-dim">—</td>
      <td className="num text-fg-dim">—</td>
      <td className="text-fg-dim">—</td>
      <td className="text-fg-dim">—</td>
      <td />
    </tr>
  )
}

// Aggregate the sum-able fields. absorption is null when no project in the
// group has an explicit absorption rate set, so the table displays "—" rather
// than a misleading 0.
function sumProjects(projects: LandBucketProject[]): {
  lots: number
  balance: number
  absorption: number | null
} {
  let lots = 0
  let balance = 0
  let absorption: number | null = null
  for (const p of projects) {
    lots += p.total_lots
    balance += p.balance_outstanding
    if (p.absorption_rate != null) absorption = (absorption ?? 0) + p.absorption_rate
  }
  return { lots, balance, absorption }
}

// ─── Projection card ─────────────────────────────────────────────────────────
// Stacked-area chart of each project's balance over the forecast horizon plus
// an aggregate table of balance / lot sales / lots remaining. Pulls the
// per-project schedules out of /api/calculate's ForecastResult, so the figures
// agree with the dashboard's Land Bucket tile (month 0 = Grand total).

function ProjectionCard({
  forecast, projects,
}: {
  forecast: ForecastResult | null
  projects: LandBucketProject[]
}) {
  // Resolve per-project color from the deterministic palette (sort by name
  // first so the order is stable across reloads).
  const projectSeries = useMemo(() => {
    if (!forecast) return [] as { name: string; color: string }[]
    const names = [...forecast.land_bucket_schedules]
      .map(s => s.project_name)
      .sort((a, b) => a.localeCompare(b))
    return names.map((name, i) => ({ name, color: PROJECT_PALETTE[i % PROJECT_PALETTE.length] }))
  }, [forecast])

  // One chart row per forecast month, plus a key per project whose value is
  // that project's starting_balance for the month (matches Land Bucket tab
  // Grand total at month 0).
  const chartData = useMemo(() => {
    if (!forecast) return []
    return forecast.months.map((m, i) => {
      const row: Record<string, number | string> = { label: m.label, month: m.month }
      for (const sch of forecast.land_bucket_schedules) {
        row[sch.project_name] = sch.months[i]?.starting_balance ?? 0
      }
      return row
    })
  }, [forecast])

  // Aggregate metrics, summed across projects each month.
  const aggregate = useMemo(() => {
    if (!forecast) {
      return [] as { month: string; label: string; balance: number; lotsSold: number;
                     lotsCum: number; lotsRemaining: number; proceeds: number }[]
    }
    return forecast.months.map((m, i) => {
      let lotsCum = 0
      let lotsRemaining = 0
      for (const sch of forecast.land_bucket_schedules) {
        const row = sch.months[i]
        if (!row) continue
        lotsCum       += row.lots_sold_cumulative
        lotsRemaining += row.lots_remaining
      }
      return {
        month: m.month,
        label: m.label,
        balance: m.land_bucket,
        lotsSold: m.lots_sold,
        proceeds: m.lot_sale_proceeds,
        lotsCum,
        lotsRemaining,
      }
    })
  }, [forecast])

  if (!forecast || forecast.land_bucket_schedules.length === 0) {
    return (
      <div className="card fade-up fade-up-1.5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-fg-strong">Land Bucket Projection</span>
        </div>
        <p className="text-xs text-fg-dim">
          {projects.length === 0
            ? 'Add a project below to see the projection.'
            : 'No forecast data yet. Once a Current Report is imported and the engine runs, the projection will appear here.'}
        </p>
      </div>
    )
  }

  const lastBalance = aggregate[aggregate.length - 1]?.balance ?? 0
  const firstBalance = aggregate[0]?.balance ?? 0
  const totalProceeds = aggregate.reduce((s, r) => s + r.proceeds, 0)
  const totalLotsSold = aggregate.reduce((s, r) => s + r.lotsSold, 0)

  return (
    <div className="card fade-up fade-up-1.5">
      <div className="card-header flex items-center justify-between">
        <span className="card-title flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-accent" />
          Land Bucket Projection
        </span>
        <span className="text-[10px] text-fg-dim font-mono">
          {aggregate[0]?.label} → {aggregate[aggregate.length - 1]?.label}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border">
        <Kpi label="Starting balance"   value={formatCurrency(firstBalance, true)} />
        <Kpi label={`End balance · ${aggregate[aggregate.length - 1]?.label ?? '—'}`}
             value={formatCurrency(lastBalance, true)} />
        <Kpi label="Total lots sold"    value={String(totalLotsSold)} />
        <Kpi label="Total sale proceeds" value={formatCurrency(totalProceeds, true)} />
      </div>

      {/* Stacked area chart, one series per project */}
      <div className="p-4">
        <LandBucketProjectionChart data={chartData} projects={projectSeries} />
        <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-fg-dim">
          {projectSeries.map(p => (
            <span key={p.name} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      {/* Aggregate table, months across, metrics down */}
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
              <td className="sticky left-0 z-10 bg-surface text-fg">Lots sold</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{r.lotsSold || <span className="text-fg-dim">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Sale proceeds</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">
                  {r.proceeds ? formatCurrency(r.proceeds, true) : <span className="text-fg-dim">—</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Lots sold (cum.)</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{r.lotsCum || <span className="text-fg-dim">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-fg">Lots remaining</td>
              {aggregate.map(r => (
                <td key={r.month} className="num">{r.lotsRemaining}</td>
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
