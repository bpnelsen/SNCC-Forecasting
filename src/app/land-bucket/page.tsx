'use client'

import { useEffect, useState } from 'react'
import {
  Landmark, Plus, Save, Trash2, X, AlertCircle, CheckCircle, Pencil,
} from 'lucide-react'
import { LandBucketProject, Builder, LoanProgram } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

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
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<FormState | null>(null)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [p, b, lp] = await Promise.all([
        fetch('/api/land-bucket-projects').then(r => r.json()),
        fetch('/api/builders').then(r => r.json()),
        fetch('/api/loan-programs').then(r => r.json()),
      ])
      setProjects(Array.isArray(p) ? p : [])
      setBuilders(Array.isArray(b) ? b : [])
      setPrograms(Array.isArray(lp) ? lp : [])
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

      <div className="card fade-up fade-up-1.5 p-3 mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-fg-dim mr-2">Builders:</span>
        {builders.length === 0
          ? <span className="text-[10px] text-danger">No builders found — add one →</span>
          : builders.map(b => (
              <span key={b.id} className="text-[10px] px-2 py-0.5 rounded bg-border text-fg">
                {b.name}
              </span>
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
            <Field label="Manual Lot Release Schedule"
                   hint='Optional. When non-empty overrides absorption. Format: {"2025-07": 3, "2025-08": 4}'>
              <textarea className="form-input h-24 text-xs font-mono resize-y"
                        value={JSON.stringify(form.lot_release_schedule ?? {}, null, 2)}
                        onChange={e => {
                          try { u({ lot_release_schedule: JSON.parse(e.target.value) }) } catch {}
                        }} />
            </Field>
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
