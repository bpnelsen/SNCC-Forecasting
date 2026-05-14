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
  month: defaultMonth(),
  loan_count: 0,
  avg_loan_amount: 0,
  loan_program_id: null,
  notes: null,
})

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
      const url    = editing.id ? `/api/new-originations/${editing.id}` : '/api/new-originations'
      const method = editing.id ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
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

  if (loading) return <div className="p-6 text-[#8B949E] text-sm">Loading…</div>

  const grouped = groupEntries(entries, builders, projects)
  const grand = sumEntries(entries)

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#D4A853]" />
            New Originations Schedule
          </h1>
          <p className="text-xs text-[#8B949E] mt-0.5">
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
            ? 'bg-[#238636]/10 border-[#238636]/30 text-[#3FB950]'
            : 'bg-[#DA3633]/10 border-[#DA3633]/30 text-[#F85149]'
        }`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Builder</th>
                <th>Development</th>
                <th>Month</th>
                <th className="text-right">Loan Count</th>
                <th className="text-right">Avg Loan ($)</th>
                <th className="text-right">Total ($)</th>
                <th>Loan Program</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-xs text-[#8B949E] py-8">
                  No new-origination entries yet. Click <span className="text-[#D4A853]">New Entry</span> to add one.
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
                <tr className="bg-[#D4A853]/10 text-[#E6EDF3] font-semibold border-t-2 border-[#D4A853]/40">
                  <td colSpan={3} className="uppercase text-[10px] tracking-wide">
                    Grand total · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
                  </td>
                  <td className="num">{grand.count}</td>
                  <td className="num text-[#8B949E]">—</td>
                  <td className="num">{formatCurrency(grand.amount, true)}</td>
                  <td className="text-[#8B949E]">—</td>
                  <td className="text-[#8B949E]">—</td>
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
    const pKey = e.land_bucket_project_id ?? '__none__'
    if (!buckets.has(bKey)) buckets.set(bKey, new Map())
    const inner = buckets.get(bKey)!
    if (!inner.has(pKey)) inner.set(pKey, [])
    inner.get(pKey)!.push(e)
  }

  const out: BuilderBlockGroup[] = []
  for (const [bKey, projMap] of buckets) {
    const builderName = builderById.get(bKey)?.name ?? '(unknown builder)'
    const projGroups = Array.from(projMap.entries()).map(([pKey, ents]) => ({
      key: pKey,
      projectName: pKey === '__none__' ? '(no development)' : projectById.get(pKey)?.name ?? '(deleted project)',
      entries: ents.sort((a, b) => a.month.localeCompare(b.month)),
    }))
    projGroups.sort((a, b) => a.projectName.localeCompare(b.projectName))
    out.push({ key: bKey, builderName, projects: projGroups })
  }
  out.sort((a, b) => a.builderName.localeCompare(b.builderName))
  return out
}

function sumEntries(entries: NewOriginationEntry[]) {
  let count = 0, amount = 0
  for (const e of entries) {
    count += e.loan_count
    amount += e.loan_count * e.avg_loan_amount
  }
  return { count, amount }
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
              return (
                <tr key={e.id}>
                  <td className="text-[#C9D1D9] font-medium">{group.builderName}</td>
                  <td>{proj.key === '__none__'
                    ? <span className="text-[#8B949E]">—</span>
                    : proj.projectName}</td>
                  <td className="font-mono text-[10px]">{e.month}</td>
                  <td className="num">{e.loan_count}</td>
                  <td className="num">{formatCurrency(e.avg_loan_amount, true)}</td>
                  <td className="num">{formatCurrency(e.loan_count * e.avg_loan_amount, true)}</td>
                  <td>{prog?.name ?? <span className="text-[#8B949E]">builder default</span>}</td>
                  <td className="text-[10px] max-w-xs truncate">{e.notes ?? '—'}</td>
                  <td className="flex gap-1">
                    <button onClick={() => onEdit(e)} className="btn-ghost">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => onDelete(e)} disabled={busy}
                            className="btn-ghost text-[#F85149]">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {group.projects.length > 1 && (
              <tr key={proj.key + '-sub'} className="bg-[#161B22] text-[#8B949E] text-[10px]">
                <td />
                <td className="italic uppercase tracking-wide">{proj.projectName} subtotal</td>
                <td />
                <td className="num">{projSubtotal.count}</td>
                <td className="num">—</td>
                <td className="num">{formatCurrency(projSubtotal.amount, true)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </>
        )
      })}
      <tr className="bg-[#21262D]/50 text-[#D4A853] font-medium">
        <td colSpan={3} className="uppercase text-[10px] tracking-wide">
          {group.builderName} subtotal · {builderEntries.length} entr{builderEntries.length === 1 ? 'y' : 'ies'}
        </td>
        <td className="num">{builderSubtotal.count}</td>
        <td className="num text-[#8B949E]">—</td>
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
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[#21262D]">
          <div className="text-sm font-medium text-[#E6EDF3]">
            {form.id ? 'Edit Entry' : 'New Origination Entry'}
          </div>
          <button onClick={onCancel} className="text-[#8B949E] hover:text-[#F85149]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Builder</div>
            <select className="form-input" value={form.builder_id}
                    onChange={e => u({ builder_id: e.target.value })}>
              <option value="">— pick a builder —</option>
              {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Development (optional)</div>
            <select className="form-input" value={form.land_bucket_project_id ?? ''}
                    onChange={e => u({ land_bucket_project_id: e.target.value || null })}>
              <option value="">— none —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Month (YYYY-MM)</div>
            <input type="month" className="form-input" value={form.month}
                   onChange={e => u({ month: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Loan Program (optional)</div>
            <select className="form-input" value={form.loan_program_id ?? ''}
                    onChange={e => u({ loan_program_id: e.target.value || null })}>
              <option value="">— builder default —</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Loan Count</div>
            <input type="number" className="form-input text-right" value={form.loan_count}
                   onChange={e => u({ loan_count: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <div className="text-[10px] text-[#8B949E] mb-1">Avg Loan Amount ($)</div>
            <input type="number" step="1000" className="form-input text-right" value={form.avg_loan_amount}
                   onChange={e => u({ avg_loan_amount: Number(e.target.value) || 0 })} />
          </div>
          <div className="col-span-2 text-[10px] text-[#8B949E]">
            Total: {formatCurrency(form.loan_count * form.avg_loan_amount, false)}
          </div>
          <div className="col-span-2">
            <div className="text-[10px] text-[#8B949E] mb-1">Notes</div>
            <textarea className="form-input h-16 resize-y" value={form.notes ?? ''}
                      onChange={e => u({ notes: e.target.value || null })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[#21262D]">
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
