'use client'

import { useEffect, useState } from 'react'
import {
  ClipboardList, Plus, Save, Trash2, X, AlertCircle, CheckCircle, Pencil,
} from 'lucide-react'
import { Builder, LoanProgram, LandBucketProject, NewOriginationEntry } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

type FormState = Omit<NewOriginationEntry, 'id'> & { id?: string }

const emptyForm = (): FormState => ({
  builder_id: '',
  land_bucket_project_id: null,
  development_name: null,
  month: defaultMonth(),
  loan_count: 0,
  avg_loan_amount: 0,
  loan_program_id: null,
  interest_rate: null,
  total_lots: null,
  end_month: null,
  monthly_mode: 'fixed',
  monthly_schedule: {},
  notes: null,
})

// Expand a series into [{ key, count }] respecting cap + end month, so the
// table and editor preview agree with the calculator's expansion logic.
function expandSeries(e: {
  month: string
  loan_count: number
  total_lots: number | null
  end_month: string | null
  monthly_mode: 'fixed' | 'schedule'
  monthly_schedule: Record<string, number>
}, horizon = 36): { key: string; count: number }[] {
  const out: { key: string; count: number }[] = []
  const cap = e.total_lots && e.total_lots > 0 ? e.total_lots : Infinity
  let [y, m] = e.month.split('-').map(Number)
  if (!y || !m) return out
  let cumulative = 0
  for (let i = 0; i < horizon && cumulative < cap; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (e.end_month && key > e.end_month) break
    const monthly = e.monthly_mode === 'schedule'
      ? Math.max(0, Math.floor(Number(e.monthly_schedule?.[key]) || 0))
      : Math.max(0, Math.floor(e.loan_count))
    if (monthly > 0) {
      const take = Math.min(monthly, cap - cumulative)
      if (take <= 0) break
      out.push({ key, count: take })
      cumulative += take
    }
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

// First of next month in YYYY-MM. Most plans are for future starts.
function defaultMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7)
}

export default function OriginationsPage() {
  const [entries, setEntries]   = useState<NewOriginationEntry[]>([])
  const [builders, setBuilders] = useState<Builder[]>([])
  const [projects, setProjects] = useState<LandBucketProject[]>([])
  const [programs, setPrograms] = useState<LoanProgram[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<FormState | null>(null)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [e, b, p, lp] = await Promise.all([
        fetch('/api/new-originations').then(r => r.json()),
        fetch('/api/builders').then(r => r.json()),
        fetch('/api/land-bucket-projects').then(r => r.json()),
        fetch('/api/loan-programs').then(r => r.json()),
      ])
      setEntries(Array.isArray(e) ? e : [])
      setBuilders(Array.isArray(b) ? b : [])
      setProjects(Array.isArray(p) ? p : [])
      setPrograms(Array.isArray(lp) ? lp : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    if (!editing.builder_id) {
      setMsg({ type: 'err', text: 'Pick a builder before saving.' })
      return
    }
    setBusy(true); setMsg(null)
    try {
      // POST for both create AND update — Vercel rejects PUT with 405 on
      // some setups (same fix as Land Bucket / A&D / etc.). The [id] route
      // now exports a POST handler that performs the update.
      const url = editing.id
        ? `/api/new-originations/${editing.id}`
        : '/api/new-originations'
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const text = await res.text()
      let body: { error?: string } | null = null
      try { body = text ? JSON.parse(text) : null } catch { /* ignore */ }
      if (!res.ok) throw new Error(body?.error || text || `${res.status} ${res.statusText}`)
      setMsg({ type: 'ok', text: editing.id ? 'Entry updated.' : 'Entry added.' })
      setEditing(null)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setBusy(false) }
  }

  const remove = async (entry: NewOriginationEntry) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/new-originations/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed')
      setMsg({ type: 'ok', text: 'Entry deleted.' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>

  const grouped = groupEntries(entries, builders, projects)
  const grand = sumEntries(entries)

  return (
    <div className="p-6 space-y-6 max-w-[1227px]">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-accent" />
            New Originations Schedule
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {entries.length} entry(ies) · planned starts per builder × development × month
          </p>
        </div>
        <button onClick={() => setEditing(emptyForm())} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New Entry
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

      <DrawCurveShortcut programs={programs} onPrograms={setPrograms} onSaved={load} />

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Builder</th>
                <th>Development</th>
                <th>Start</th>
                <th>Stop</th>
                <th className="text-right">Per Month</th>
                <th className="text-right">Total Loans</th>
                <th className="text-right">Avg Loan ($)</th>
                <th className="text-right">Total ($)</th>
                <th>Loan Program</th>
                <th className="text-right">Interest Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-xs text-fg-dim py-8">
                  No new-origination entries yet. Click <span className="text-accent">New Entry</span> to add one.
                </td></tr>
              ) : grouped.map(builderGroup => (
                <BuilderBlock
                  key={builderGroup.key}
                  group={builderGroup}
                  programs={programs}
                  busy={busy}
                  onEdit={e => setEditing(e)}
                  onDelete={remove}
                />
              ))}
              {entries.length > 0 && (
                <tr className="bg-accent/10 text-fg-strong font-semibold border-t-2 border-accent/40">
                  <td colSpan={4} className="uppercase text-[10px] tracking-wide">
                    Grand total · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
                  </td>
                  <td className="num text-fg-dim">—</td>
                  <td className="num">{grand.count}</td>
                  <td className="num text-fg-dim">—</td>
                  <td className="num">{formatCurrency(grand.amount, true)}</td>
                  <td className="text-fg-dim">—</td>
                  <td className="text-fg-dim">—</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EntryEditor
          form={editing}
          builders={builders}
          projects={projects}
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

interface BuilderBlockGroup {
  key: string
  builderName: string
  projects: { key: string; projectName: string; entries: NewOriginationEntry[] }[]
}

// Display label for a single entry's development. Prefers a linked Land Bucket
// project (so renaming the project propagates), then the free-text name on the
// row, then a placeholder.
function entryDevName(e: NewOriginationEntry, projectById: Map<string, LandBucketProject>): string {
  if (e.land_bucket_project_id) {
    return projectById.get(e.land_bucket_project_id)?.name ?? '(deleted project)'
  }
  return e.development_name?.trim() || '(no development)'
}

function groupEntries(
  entries: NewOriginationEntry[],
  builders: Builder[],
  projects: LandBucketProject[],
): BuilderBlockGroup[] {
  const builderById = new Map(builders.map(b => [b.id, b]))
  const projectById = new Map(projects.map(p => [p.id, p]))
  const buckets = new Map<string, Map<string, NewOriginationEntry[]>>()

  for (const e of entries) {
    const bKey = e.builder_id
    // Group key is the display name so free-text developments group together
    // (and group with a linked project of the same name).
    const pKey = entryDevName(e, projectById)
    if (!buckets.has(bKey)) buckets.set(bKey, new Map())
    const inner = buckets.get(bKey)!
    if (!inner.has(pKey)) inner.set(pKey, [])
    inner.get(pKey)!.push(e)
  }

  const out: BuilderBlockGroup[] = []
  for (const [bKey, projMap] of buckets) {
    const builderName = builderById.get(bKey)?.name ?? '(unknown builder)'
    const projGroups = Array.from(projMap.entries()).map(([projectName, ents]) => ({
      key: projectName,
      projectName,
      entries: ents.sort((a, b) => a.month.localeCompare(b.month)),
    }))
    projGroups.sort((a, b) => a.projectName.localeCompare(b.projectName))
    out.push({ key: bKey, builderName, projects: projGroups })
  }
  out.sort((a, b) => a.builderName.localeCompare(b.builderName))
  return out
}

// Total loans / dollars an entry originates over its whole capped series.
function seriesTotals(e: NewOriginationEntry): { count: number; amount: number } {
  const count = expandSeries(e).reduce((s, x) => s + x.count, 0)
  return { count, amount: count * e.avg_loan_amount }
}

function sumEntries(entries: NewOriginationEntry[]) {
  let count = 0, amount = 0
  for (const e of entries) {
    const t = seriesTotals(e)
    count += t.count
    amount += t.amount
  }
  return { count, amount }
}

// Human-readable stop summary for the table.
function stopLabel(e: NewOriginationEntry): string {
  const parts: string[] = []
  if (e.total_lots && e.total_lots > 0) parts.push(`${e.total_lots} cap`)
  if (e.end_month) parts.push(`by ${e.end_month}`)
  return parts.length ? parts.join(' · ') : 'horizon'
}

function BuilderBlock({
  group, programs, busy, onEdit, onDelete,
}: {
  group: BuilderBlockGroup
  programs: LoanProgram[]
  busy: boolean
  onEdit: (e: NewOriginationEntry) => void
  onDelete: (e: NewOriginationEntry) => void
}) {
  const builderEntries = group.projects.flatMap(p => p.entries)
  const builderSubtotal = sumEntries(builderEntries)
  return (
    <>
      {group.projects.map(proj => {
        const projSubtotal = sumEntries(proj.entries)
        return (
          <>
            {proj.entries.map(e => {
              const prog = programs.find(p => p.id === e.loan_program_id)
              const t = seriesTotals(e)
              const perMonth = e.monthly_mode === 'schedule'
                ? 'schedule'
                : `${e.loan_count}/mo`
              return (
                <tr key={e.id}>
                  <td className="text-fg font-medium">{group.builderName}</td>
                  <td>{proj.projectName === '(no development)'
                    ? <span className="text-fg-dim">—</span>
                    : proj.projectName}</td>
                  <td className="font-mono text-[10px]">{e.month}</td>
                  <td className="text-[10px]">{stopLabel(e)}</td>
                  <td className="num text-[10px]">{perMonth}</td>
                  <td className="num">{t.count}</td>
                  <td className="num">{formatCurrency(e.avg_loan_amount, true)}</td>
                  <td className="num">{formatCurrency(t.amount, true)}</td>
                  <td>
                    {prog ? (
                      <>
                        <div>{prog.name}</div>
                        <div className="text-[10px] text-fg-dim">
                          {prog.draw_curve.length} mo · {Math.round(prog.draw_curve.reduce((a, b) => a + b, 0) * 100)}%
                        </div>
                      </>
                    ) : (
                      <span className="text-fg-dim">builder default</span>
                    )}
                  </td>
                  <td className="num">
                    {e.interest_rate != null
                      ? `${(e.interest_rate * 100).toFixed(2)}%`
                      : prog
                        ? <span className="text-fg-dim">{(prog.default_rate * 100).toFixed(2)}%</span>
                        : <span className="text-fg-dim">program</span>}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => onEdit(e)} className="btn-ghost" title="Edit entry">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => onDelete(e)} disabled={busy}
                              className="btn-ghost text-danger" title="Delete entry">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {group.projects.length > 1 && (
              <tr key={proj.key + '-sub'} className="bg-surface text-fg-dim text-[10px]">
                <td />
                <td className="italic uppercase tracking-wide">{proj.projectName} subtotal</td>
                <td colSpan={3} />
                <td className="num">{projSubtotal.count}</td>
                <td className="num">—</td>
                <td className="num">{formatCurrency(projSubtotal.amount, true)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </>
        )
      })}
      <tr className="bg-border/50 text-accent font-medium">
        <td colSpan={4} className="uppercase text-[10px] tracking-wide">
          {group.builderName} subtotal · {builderEntries.length} entr{builderEntries.length === 1 ? 'y' : 'ies'}
        </td>
        <td className="num text-fg-dim">—</td>
        <td className="num">{builderSubtotal.count}</td>
        <td className="num text-fg-dim">—</td>
        <td className="num">{formatCurrency(builderSubtotal.amount, true)}</td>
        <td colSpan={3} />
      </tr>
    </>
  )
}

function EntryEditor({
  form, builders, projects, programs, busy, onChange, onCancel, onSave,
}: {
  form: FormState
  builders: Builder[]
  projects: LandBucketProject[]
  programs: LoanProgram[]
  busy: boolean
  onChange: (f: FormState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const u = (patch: Partial<FormState>) => onChange({ ...form, ...patch })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border-strong rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium text-fg-strong">
            {form.id ? 'Edit Entry' : 'New Origination Entry'}
          </div>
          <button onClick={onCancel} className="text-fg-dim hover:text-danger">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Builder</div>
            <select className="form-input" value={form.builder_id}
                    onChange={e => u({ builder_id: e.target.value })}>
              <option value="">— pick a builder —</option>
              {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Development (optional)</div>
            <input
              className="form-input"
              list="dev-suggestions"
              value={form.development_name
                ?? (form.land_bucket_project_id
                  ? projects.find(p => p.id === form.land_bucket_project_id)?.name ?? ''
                  : '')}
              placeholder="Type or pick a development name"
              onChange={e => {
                const typed = e.target.value
                // If the typed string matches an existing Land Bucket project,
                // link to it; otherwise treat as a free-text name.
                const match = projects.find(p => p.name.toLowerCase() === typed.toLowerCase())
                u({
                  development_name: typed || null,
                  land_bucket_project_id: match?.id ?? null,
                })
              }}
            />
            <datalist id="dev-suggestions">
              {projects.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
            <div className="text-[10px] text-fg-dim mt-0.5 italic">
              {form.land_bucket_project_id
                ? 'Linked to a Land Bucket project.'
                : form.development_name
                  ? 'Free-text development (not linked to Land Bucket).'
                  : 'Leave blank for no development.'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Start Month (YYYY-MM)</div>
            <input type="month" className="form-input" value={form.month}
                   onChange={e => u({ month: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Loan Program (optional)</div>
            <select className="form-input" value={form.loan_program_id ?? ''}
                    onChange={e => u({ loan_program_id: e.target.value || null })}>
              <option value="">— builder default —</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">
              Interest Rate (%) <span className="italic">— blank = program default</span>
            </div>
            <input type="number" step="0.01" min="0"
                   className="form-input text-right"
                   value={form.interest_rate == null ? '' : (form.interest_rate * 100).toFixed(2)}
                   onChange={e => u({
                     interest_rate: e.target.value === '' ? null : Number(e.target.value) / 100,
                   })} />
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <div className="text-[10px] text-fg-dim uppercase tracking-wide mb-2">Monthly starts &amp; stop</div>
            <div className="flex gap-2 mb-3">
              {(['fixed', 'schedule'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => u({ monthly_mode: mode })}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium border transition-all
                    ${form.monthly_mode === mode
                      ? 'border-border-strong text-fg bg-bg'
                      : 'border-border text-fg-dim opacity-60 hover:opacity-100'}`}
                >
                  {mode === 'fixed' ? 'Fixed / month' : 'Specific per month'}
                </button>
              ))}
            </div>
          </div>

          {form.monthly_mode === 'fixed' && (
            <div>
              <div className="text-[10px] text-fg-dim mb-1">Loans per month</div>
              <input type="number" min={0} className="form-input text-right" value={form.loan_count}
                     onChange={e => u({ loan_count: Number(e.target.value) || 0 })} />
            </div>
          )}
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Avg Loan Amount ($)</div>
            <input type="number" step="1000" className="form-input text-right" value={form.avg_loan_amount}
                   onChange={e => u({ avg_loan_amount: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Total Lots Cap (optional)</div>
            <input type="number" min={0} className="form-input text-right"
                   placeholder="no cap"
                   value={form.total_lots ?? ''}
                   onChange={e => u({ total_lots: e.target.value === '' ? null : Number(e.target.value) })} />
            <div className="text-[10px] text-fg-dim mt-0.5 italic">Stops once this many loans started.</div>
          </div>
          <div>
            <div className="text-[10px] text-fg-dim mb-1">End Month (optional)</div>
            <input type="month" className="form-input"
                   value={form.end_month ?? ''}
                   onChange={e => u({ end_month: e.target.value || null })} />
            <div className="text-[10px] text-fg-dim mt-0.5 italic">Inclusive calendar stop.</div>
          </div>

          {form.monthly_mode === 'schedule' && (
            <div className="col-span-2">
              <ScheduleGrid
                startMonth={form.month}
                endMonth={form.end_month}
                value={form.monthly_schedule ?? {}}
                onChange={v => u({ monthly_schedule: v })}
              />
            </div>
          )}

          <div className="col-span-2 text-[10px] rounded border border-border-strong p-2 bg-bg">
            {(() => {
              const series = expandSeries(form)
              const totalLoans = series.reduce((s, x) => s + x.count, 0)
              if (totalLoans === 0) {
                return <span className="text-fg-dim">No loans scheduled — set per-month counts, a cap, or a start month inside the horizon.</span>
              }
              const first = series[0].key
              const last = series[series.length - 1].key
              return (
                <span className="text-fg">
                  Originates <strong>{totalLoans}</strong> loans over <strong>{series.length}</strong> month
                  {series.length === 1 ? '' : 's'} ({first} → {last}) ·
                  total {formatCurrency(totalLoans * form.avg_loan_amount, false)}
                </span>
              )
            })()}
          </div>
          <div className="col-span-2">
            <div className="text-[10px] text-fg-dim mb-1">Notes</div>
            <textarea className="form-input h-16 resize-y" value={form.notes ?? ''}
                      onChange={e => u({ notes: e.target.value || null })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onSave} disabled={busy || !form.builder_id} className="btn-primary">
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Per-month count grid for 'schedule' mode. Renders months from startMonth
// through endMonth (or 24 months if no end month set).
function ScheduleGrid({
  startMonth, endMonth, value, onChange,
}: {
  startMonth: string
  endMonth: string | null
  value: Record<string, number>
  onChange: (v: Record<string, number>) => void
}) {
  if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) {
    return (
      <div className="text-[10px] text-fg-dim italic">
        Set a valid Start Month to populate the per-month schedule.
      </div>
    )
  }
  let [y, m] = startMonth.split('-').map(Number)
  const keys: string[] = []
  for (let i = 0; i < 36; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    keys.push(key)
    if (endMonth && key >= endMonth) break
    if (!endMonth && i >= 23) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  const total = keys.reduce((s, k) => s + (Number(value[k]) || 0), 0)
  const set = (k: string, n: number) => {
    const next = { ...value }
    if (n > 0) next[k] = n
    else delete next[k]
    onChange(next)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-fg-dim">Per-month loan counts</div>
        <div className="text-[10px] text-fg-dim">
          Sum: <span className="text-fg font-mono">{total}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3 rounded border border-border-strong max-h-48 overflow-y-auto">
        {keys.map(k => (
          <label key={k} className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-fg-dim w-14 shrink-0">{k}</span>
            <input
              type="number"
              min={0}
              className="form-input text-right text-xs py-1 px-2"
              value={value[k] ?? 0}
              onChange={e => set(k, Math.max(0, parseInt(e.target.value) || 0))}
            />
          </label>
        ))}
      </div>
      <div className="text-[10px] text-fg-dim mt-1 italic">
        A Total Lots Cap still applies on top of this schedule (whichever stops first).
      </div>
    </div>
  )
}

// ─── Draw Curve shortcut ────────────────────────────────────────────────────
// Inline editor for the two construction loan programs the New Originations
// flow most often uses. Same data as Assumptions → Loan Programs; edits here
// hit the same /api/loan-programs POST endpoint, so the next forecast load
// picks up the new curve everywhere.

function DrawCurveShortcut({
  programs, onPrograms, onSaved,
}: {
  programs: LoanProgram[]
  onPrograms: (next: LoanProgram[]) => void
  onSaved: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const targets = programs.filter(p => p.name === 'SFR Construction' || p.name === 'MFR Construction')

  const patch = (id: string, draw_curve: number[]) => {
    onPrograms(programs.map(p => p.id === id ? { ...p, draw_curve } : p))
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/loan-programs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(programs),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let body: { error?: unknown } | null = null
        try { body = text ? JSON.parse(text) : null } catch { /* keep raw */ }
        const err = body?.error
        const m = typeof err === 'string' ? err
                : err ? JSON.stringify(err)
                : (text || `${res.status} ${res.statusText}`)
        throw new Error(m)
      }
      setMsg({ type: 'ok', text: 'Draw curves saved.' })
      await onSaved()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setBusy(false) }
  }

  if (targets.length === 0) {
    return (
      <div className="card fade-up fade-up-1.5 p-4">
        <div className="text-sm font-medium text-fg-strong mb-1">SFR / MFR Construction Draw Curves</div>
        <div className="text-xs text-fg-dim italic">
          No SFR Construction or MFR Construction programs found in loan_programs.
          Run <code>supabase/migrations/002_modular_assumptions.sql</code>.
        </div>
      </div>
    )
  }

  return (
    <div className="card fade-up fade-up-1.5">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">SFR / MFR Construction Draw Curves</span>
        <button onClick={save} disabled={busy} className="btn-primary text-[10px]">
          <Save className="w-3 h-3" /> {busy ? 'Saving…' : 'Save Curves'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-[10px] text-fg-dim">
          Shortcut to the same loan-program rows you'd edit on Assumptions. Changes
          apply to every New Originations entry assigned to that program.
        </p>

        {msg && (
          <div className={`flex items-center gap-2 text-xs p-2 rounded border ${
            msg.type === 'ok'
              ? 'bg-success/10 border-success/30 text-success-light'
              : 'bg-danger-strong/10 border-danger-strong/30 text-danger'
          }`}>
            {msg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {msg.text}
          </div>
        )}

        {targets.map(p => (
          <DrawCurveGrid key={p.id} program={p} onChange={curve => patch(p.id, curve)} />
        ))}
      </div>
    </div>
  )
}

function DrawCurveGrid({
  program, onChange,
}: {
  program: LoanProgram
  onChange: (curve: number[]) => void
}) {
  const count = Math.max(24, program.draw_curve.length)
  const sumPct = program.draw_curve.reduce((a, b) => a + b, 0) * 100
  return (
    <div className="border border-border-strong rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-fg">{program.name}</div>
          <div className="text-[10px] text-fg-dim">
            Product type: {program.product_type} · default rate {(program.default_rate * 100).toFixed(2)}%
            · term {program.default_term_months} mo
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost text-[10px] px-1.5 py-0.5"
            onClick={() => onChange(Array.from({ length: count + 1 }, (_, j) => program.draw_curve[j] ?? 0))}
          >+ Month</button>
          <button
            type="button"
            className="btn-ghost text-[10px] px-1.5 py-0.5 disabled:opacity-40"
            disabled={count <= 24}
            onClick={() => {
              if (count <= 24) return
              onChange(program.draw_curve.slice(0, count - 1))
            }}
          >− Month</button>
        </div>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <div className="text-[10px] text-fg-dim mb-0.5 text-center">M{i + 1}</div>
            <input
              type="number" step="1" min="0"
              className="form-input text-right text-xs"
              value={Math.round((program.draw_curve[i] ?? 0) * 100)}
              onChange={e => {
                const pct = Math.round(Number(e.target.value))
                const next = Array.from({ length: count }, (_, j) => program.draw_curve[j] ?? 0)
                next[i] = !isFinite(pct) || pct < 0 ? 0 : pct / 100
                onChange(next)
              }}
            />
          </div>
        ))}
      </div>
      <div className="text-[10px] text-fg-dim">
        Months: {count} · sum: {Math.round(sumPct)}%
      </div>
    </div>
  )
}
