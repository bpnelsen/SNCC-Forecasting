'use client'

import { useEffect, useState } from 'react'
import { LoanProgram, ProductType } from '@/lib/types'
import { X, Save, Trash2, Plus, Minus, AlertCircle } from 'lucide-react'

type Mode = { kind: 'create' } | { kind: 'edit'; program: LoanProgram }

interface Props {
  mode: Mode
  onClose: () => void
  onSaved: () => void
}

const PRODUCT_TYPES: ProductType[] = ['SF', 'MF', 'LOT', 'AD', 'RAW_LAND', 'OTHER']

interface FormState {
  name: string
  product_type: ProductType
  draw_curve: number[]
  default_rate: string
  default_term_months: string
  notes: string
}

function initial(mode: Mode): FormState {
  if (mode.kind === 'create') {
    return {
      name: '',
      product_type: 'SF',
      draw_curve: [0.10, 0.15, 0.20, 0.20, 0.15, 0.10, 0.05, 0.05],
      default_rate: '5.25',
      default_term_months: '12',
      notes: '',
    }
  }
  const p = mode.program
  return {
    name: p.name,
    product_type: p.product_type,
    draw_curve: [...p.draw_curve],
    default_rate: (p.default_rate * 100).toFixed(2),
    default_term_months: String(p.default_term_months),
    notes: p.notes ?? '',
  }
}

export function ProgramModal({ mode, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(mode))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const setCurveCell = (idx: number, pctValue: string) => {
    const v = pctValue === '' ? 0 : Number(pctValue) / 100
    setForm(prev => {
      const next = [...prev.draw_curve]
      next[idx] = isNaN(v) ? 0 : v
      return { ...prev, draw_curve: next }
    })
  }

  const addMonth = () => setForm(prev => ({ ...prev, draw_curve: [...prev.draw_curve, 0] }))
  const removeMonth = () => setForm(prev => ({
    ...prev,
    draw_curve: prev.draw_curve.length > 1 ? prev.draw_curve.slice(0, -1) : prev.draw_curve,
  }))

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const body = {
        name: form.name,
        product_type: form.product_type,
        draw_curve: form.draw_curve,
        default_rate: form.default_rate ? Number(form.default_rate) / 100 : 0.0525,
        default_term_months: Number(form.default_term_months) || 12,
        notes: form.notes,
      }
      const url = mode.kind === 'create'
        ? '/api/loan-programs'
        : `/api/loan-programs/${mode.program.id}`
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
    if (!confirm(`Delete program "${mode.program.name}"? This cannot be undone.`)) return
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/loan-programs/${mode.program.id}`, { method: 'DELETE' })
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

  const curveSum = form.draw_curve.reduce((s, v) => s + v, 0)
  const maxCurve = Math.max(...form.draw_curve, 0.01)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="card-header sticky top-0 bg-[#161B22] z-10">
          <span className="card-title">
            {mode.kind === 'create' ? 'New Loan Program' : `Edit · ${mode.program.name}`}
          </span>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-lg bg-[#DA3633]/10 border border-[#DA3633]/30 text-[#F85149]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Program Name" required>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="Product Type">
              <select
                className="form-input"
                value={form.product_type}
                onChange={e => set('product_type', e.target.value as ProductType)}
              >
                {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Default Rate (%)">
              <input
                type="number" step="0.01"
                className="form-input"
                value={form.default_rate}
                onChange={e => set('default_rate', e.target.value)}
              />
            </Field>
            <Field label="Default Term (months)" hint="Total life: draw period + hold + payoff">
              <input
                type="number" step="1"
                className="form-input"
                value={form.default_term_months}
                onChange={e => set('default_term_months', e.target.value)}
              />
            </Field>
          </div>

          {/* Draw curve editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="form-label mb-0">Draw Curve</label>
                <div className="text-[10px] text-[#8B949E]">
                  Incremental monthly fractions of max balance. Sum should be ≈ 100%.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-xs font-mono ${
                  Math.abs(curveSum - 1) < 0.01 ? 'text-[#3FB950]' : 'text-[#D4A853]'
                }`}>
                  Σ = {(curveSum * 100).toFixed(2)}%
                </div>
                <button onClick={removeMonth} className="btn-ghost" disabled={form.draw_curve.length <= 1} title="Remove last month">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button onClick={addMonth} className="btn-ghost" title="Add a month">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bar preview */}
            <div className="flex items-end gap-1 h-16 mb-2 px-1 bg-[#0D1117] rounded border border-[#21262D]">
              {form.draw_curve.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end" title={`M${i + 1}: ${(v * 100).toFixed(1)}%`}>
                  <div
                    className="bg-[#D4A853]/80 rounded-t"
                    style={{ height: `${(v / maxCurve) * 100}%`, minHeight: '2px' }}
                  />
                </div>
              ))}
            </div>

            {/* Editable cells */}
            <div className="overflow-x-auto">
              <table className="text-[10px] w-full">
                <thead>
                  <tr>
                    {form.draw_curve.map((_, i) => (
                      <th key={i} className="text-center text-[#8B949E] font-medium py-1">M{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {form.draw_curve.map((v, i) => (
                      <td key={i} className="p-1">
                        <input
                          type="number" step="0.01"
                          className="w-full bg-[#0D1117] border border-[#30363D] rounded text-center text-[10px]
                                     text-[#C9D1D9] py-1 focus:outline-none focus:border-[#D4A853] font-mono"
                          value={(v * 100).toFixed(2)}
                          onChange={e => setCurveCell(i, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
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
