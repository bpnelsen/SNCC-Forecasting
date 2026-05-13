'use client'

import { useEffect, useState } from 'react'
import { LandBucketProject, Builder, LoanProgram } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { X, Save, Trash2, AlertCircle } from 'lucide-react'

const formatNumber = (n: number) => formatCurrency(n, true)

type Mode = { kind: 'create' } | { kind: 'edit'; project: LandBucketProject }

interface Props {
  mode: Mode
  builders: Builder[]
  programs: LoanProgram[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  name: string
  builder_id: string
  total_lots: string
  lot_price: string
  absorption_rate: string
  balance_outstanding: string
  interest_rate: string
  dev_start_date: string
  dev_end_date: string
  lot_sales_start_date: string
  vertical_loan_program_id: string
  vertical_loan_amount: string
  notes: string
}

function initial(mode: Mode): FormState {
  if (mode.kind === 'create') {
    return {
      name: '',
      builder_id: '',
      total_lots: '',
      lot_price: '',
      absorption_rate: '',
      balance_outstanding: '0',
      interest_rate: '5.25',
      dev_start_date: '',
      dev_end_date: '',
      lot_sales_start_date: '',
      vertical_loan_program_id: '',
      vertical_loan_amount: '',
      notes: '',
    }
  }
  const p = mode.project
  return {
    name: p.name,
    builder_id: p.builder_id ?? '',
    total_lots: String(p.total_lots),
    lot_price: String(p.lot_price),
    absorption_rate: p.absorption_rate == null ? '' : String(p.absorption_rate),
    balance_outstanding: String(p.balance_outstanding),
    interest_rate: (p.interest_rate * 100).toFixed(2),
    dev_start_date: p.dev_start_date ?? '',
    dev_end_date: p.dev_end_date ?? '',
    lot_sales_start_date: p.lot_sales_start_date ?? '',
    vertical_loan_program_id: p.vertical_loan_program_id ?? '',
    vertical_loan_amount: p.vertical_loan_amount == null ? '' : String(p.vertical_loan_amount),
    notes: p.notes ?? '',
  }
}

export function ProjectModal({ mode, builders, programs, onClose, onSaved }: Props) {
  const [form, setForm]       = useState<FormState>(() => initial(mode))
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const body = {
        ...form,
        builder_id: form.builder_id || null,
        vertical_loan_program_id: form.vertical_loan_program_id || null,
        vertical_loan_amount: form.vertical_loan_amount === '' ? null : Number(form.vertical_loan_amount),
        interest_rate: form.interest_rate ? Number(form.interest_rate) / 100 : 0.0525,
      }
      const url = mode.kind === 'create'
        ? '/api/land-bucket-projects'
        : `/api/land-bucket-projects/${mode.project.id}`
      const res = await fetch(url, {
        method: mode.kind === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (mode.kind !== 'edit') return
    if (!confirm(`Delete project "${mode.project.name}"? This cannot be undone.`)) return
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/land-bucket-projects/${mode.project.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally { setDeleting(false) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const builderDefault = builders.find(b => b.id === form.builder_id)?.default_absorption_rate
  const verticalFallback = form.lot_price ? Number(form.lot_price) * 3 : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="card-header sticky top-0 bg-[#161B22] z-10">
          <span className="card-title">
            {mode.kind === 'create' ? 'New Land Bucket Project' : `Edit · ${mode.project.name}`}
          </span>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-lg bg-[#DA3633]/10 border border-[#DA3633]/30 text-[#F85149]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <Field label="Project Name" required>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Builder">
              <select className="form-input" value={form.builder_id} onChange={e => set('builder_id', e.target.value)}>
                <option value="">— none —</option>
                {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Vertical Loan Program" hint="Triggers a vertical loan when a lot is sold">
              <select
                className="form-input"
                value={form.vertical_loan_program_id}
                onChange={e => set('vertical_loan_program_id', e.target.value)}
              >
                <option value="">— no auto-origination —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <Field
            label="Vertical Loan Amount ($)"
            hint={
              form.vertical_loan_program_id
                ? `Max balance of each lot-driven vertical loan. Leave blank for default (lot_price × 3${verticalFallback ? ` = ${formatNumber(verticalFallback)}` : ''}).`
                : 'Only used when a Vertical Loan Program is selected above.'
            }
          >
            <input
              type="number" step="1000"
              className="form-input"
              value={form.vertical_loan_amount}
              onChange={e => set('vertical_loan_amount', e.target.value)}
              placeholder={verticalFallback ? formatNumber(verticalFallback) : ''}
              disabled={!form.vertical_loan_program_id}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Total Lots" required>
              <input type="number" className="form-input" value={form.total_lots} onChange={e => set('total_lots', e.target.value)} />
            </Field>
            <Field label="Lot Price ($)" required>
              <input type="number" step="1000" className="form-input" value={form.lot_price} onChange={e => set('lot_price', e.target.value)} />
            </Field>
            <Field
              label="Absorption (lots/mo)"
              hint={builderDefault != null && !form.absorption_rate ? `Builder default: ${builderDefault}` : 'Leave blank for builder default'}
            >
              <input
                type="number" step="0.1"
                className="form-input"
                value={form.absorption_rate}
                onChange={e => set('absorption_rate', e.target.value)}
                placeholder={builderDefault != null ? String(builderDefault) : ''}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Balance Outstanding ($)" required>
              <input type="number" step="1000" className="form-input" value={form.balance_outstanding} onChange={e => set('balance_outstanding', e.target.value)} />
            </Field>
            <Field label="Interest Rate (%)" hint="Fixed rate, paid current — not capitalized" required>
              <input type="number" step="0.01" className="form-input" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Dev Start">
              <input type="date" className="form-input" value={form.dev_start_date} onChange={e => set('dev_start_date', e.target.value)} />
            </Field>
            <Field label="Dev End">
              <input type="date" className="form-input" value={form.dev_end_date} onChange={e => set('dev_end_date', e.target.value)} />
            </Field>
            <Field label="Lot Sales Start" hint="First month lots are sellable">
              <input type="date" className="form-input" value={form.lot_sales_start_date} onChange={e => set('lot_sales_start_date', e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className="form-input h-16 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-[#21262D] flex items-center justify-between">
          {mode.kind === 'edit' ? (
            <button onClick={remove} disabled={deleting || saving} className="btn-danger">
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={saving || deleting} className="btn-primary">
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">
        {label}{required && <span className="text-[#F85149] ml-0.5">*</span>}
      </label>
      {children}
      {hint && <div className="text-[10px] text-[#8B949E] mt-1">{hint}</div>}
    </div>
  )
}
