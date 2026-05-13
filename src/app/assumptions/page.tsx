'use client'

import { useCallback, useEffect, useState } from 'react'
import { Builder, LoanProgram, ForecastSettings, ScheduledOrigination } from '@/lib/types'
import { ProgramModal } from '@/components/assumptions/ProgramModal'
import {
  Settings2, Save, AlertCircle, CheckCircle, Plus, Trash2, Pencil,
} from 'lucide-react'

type ProgramMode = { kind: 'create' } | { kind: 'edit'; program: LoanProgram } | null

export default function AssumptionsPage() {
  const [settings, setSettings] = useState<ForecastSettings | null>(null)
  const [builders, setBuilders] = useState<Builder[]>([])
  const [programs, setPrograms] = useState<LoanProgram[]>([])
  const [scheduled, setScheduled] = useState<ScheduledOrigination[]>([])
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [programModal, setProgramModal] = useState<ProgramMode>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, bRes, pRes, schedRes] = await Promise.all([
        fetch('/api/forecast-settings'),
        fetch('/api/builders'),
        fetch('/api/loan-programs'),
        fetch('/api/scheduled-originations'),
      ])
      if (sRes.ok)     setSettings(await sRes.json())
      if (bRes.ok)     setBuilders(await bRes.json())
      if (pRes.ok)     setPrograms(await pRes.json())
      if (schedRes.ok) setScheduled(await schedRes.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  if (loading) return <div className="p-6 text-[#8B949E] text-sm">Loading assumptions…</div>

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-[#D4A853]" />
          Assumptions
        </h1>
        <p className="text-xs text-[#8B949E] mt-0.5">
          Forecast settings, builders, and loan programs · changes apply on next Dashboard load
        </p>
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

      {/* ─── Forecast Settings ─────────────────────────────────────────── */}
      <SettingsCard
        settings={settings}
        onSaved={(s) => { setSettings(s); flash('ok', 'Forecast settings saved.') }}
        onError={(e) => flash('err', e)}
      />

      {/* ─── Builders ──────────────────────────────────────────────────── */}
      <BuildersCard
        builders={builders}
        programs={programs}
        onChanged={() => load().then(() => flash('ok', 'Builder saved.'))}
        onError={(e) => flash('err', e)}
      />

      {/* ─── Loan Programs ─────────────────────────────────────────────── */}
      <div className="card fade-up fade-up-3">
        <div className="card-header">
          <span className="card-title">Loan Programs · {programs.length}</span>
          <button onClick={() => setProgramModal({ kind: 'create' })} className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> New Program
          </button>
        </div>
        {programs.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#8B949E]">
            No loan programs yet. Click <strong>New Program</strong> to add one.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
            {programs.map(p => (
              <ProgramCard
                key={p.id}
                program={p}
                onEdit={() => setProgramModal({ kind: 'edit', program: p })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Scheduled Originations ────────────────────────────────────── */}
      <ScheduledOriginationsCard
        scheduled={scheduled}
        builders={builders}
        programs={programs}
        onChanged={() => load().then(() => flash('ok', 'Scheduled origination saved.'))}
        onError={(e) => flash('err', e)}
      />

      {programModal && (
        <ProgramModal
          mode={programModal}
          onClose={() => setProgramModal(null)}
          onSaved={() => { setProgramModal(null); load().then(() => flash('ok', 'Program saved.')) }}
        />
      )}
    </div>
  )
}

// ─── Settings card ─────────────────────────────────────────────────────────

function SettingsCard({
  settings, onSaved, onError,
}: {
  settings: ForecastSettings | null
  onSaved: (s: ForecastSettings) => void
  onError: (e: string) => void
}) {
  const [form, setForm] = useState({
    start_date: '',
    horizon_months: '17',
    default_rate_vertical: '5.25',
    default_rate_land: '5.25',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({
        start_date: settings.start_date,
        horizon_months: String(settings.horizon_months),
        default_rate_vertical: (settings.default_rate_vertical * 100).toFixed(2),
        default_rate_land: (settings.default_rate_land * 100).toFixed(2),
      })
    }
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/forecast-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: form.start_date,
          horizon_months: Number(form.horizon_months),
          default_rate_vertical: Number(form.default_rate_vertical) / 100,
          default_rate_land: Number(form.default_rate_land) / 100,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      onSaved(await res.json())
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="card fade-up fade-up-2">
      <div className="card-header">
        <span className="card-title">Forecast Settings</span>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SmallField label="Start Date" hint="First month of the forecast">
          <input
            type="date" className="form-input"
            value={form.start_date}
            onChange={e => setForm(prev => ({ ...prev, start_date: e.target.value }))}
          />
        </SmallField>
        <SmallField label="Horizon (months)">
          <input
            type="number" step="1" className="form-input"
            value={form.horizon_months}
            onChange={e => setForm(prev => ({ ...prev, horizon_months: e.target.value }))}
          />
        </SmallField>
        <SmallField label="Vertical Rate (%)" hint="Fallback if loan has no rate">
          <input
            type="number" step="0.01" className="form-input"
            value={form.default_rate_vertical}
            onChange={e => setForm(prev => ({ ...prev, default_rate_vertical: e.target.value }))}
          />
        </SmallField>
        <SmallField label="Land Rate (%)" hint="Fallback if project has no rate">
          <input
            type="number" step="0.01" className="form-input"
            value={form.default_rate_land}
            onChange={e => setForm(prev => ({ ...prev, default_rate_land: e.target.value }))}
          />
        </SmallField>
      </div>
    </div>
  )
}

// ─── Builders card ─────────────────────────────────────────────────────────

function BuildersCard({
  builders, programs, onChanged, onError,
}: {
  builders: Builder[]
  programs: LoanProgram[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState<{ name: string; default_absorption_rate: string; default_loan_program_id: string; notes: string }>({
    name: '', default_absorption_rate: '2', default_loan_program_id: '', notes: '',
  })

  const startAdd = () => {
    setAdding(true)
    setNewRow({ name: '', default_absorption_rate: '2', default_loan_program_id: '', notes: '' })
  }

  const saveNew = async () => {
    if (!newRow.name.trim()) { onError('Name is required.'); return }
    try {
      const res = await fetch('/api/builders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRow.name.trim(),
          default_absorption_rate: Number(newRow.default_absorption_rate) || 0,
          default_loan_program_id: newRow.default_loan_program_id || null,
          notes: newRow.notes || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed')
      setAdding(false)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  return (
    <div className="card fade-up fade-up-2">
      <div className="card-header">
        <span className="card-title">Builders · {builders.length}</span>
        <button onClick={startAdd} disabled={adding} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> Add Builder
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-right">Default Absorption (lots/mo)</th>
              <th>Default Program</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-[#21262D]/40">
                <td><input className="form-input" autoFocus value={newRow.name} onChange={e => setNewRow(p => ({ ...p, name: e.target.value }))} /></td>
                <td><input type="number" step="0.1" className="form-input text-right" value={newRow.default_absorption_rate} onChange={e => setNewRow(p => ({ ...p, default_absorption_rate: e.target.value }))} /></td>
                <td>
                  <select className="form-input" value={newRow.default_loan_program_id} onChange={e => setNewRow(p => ({ ...p, default_loan_program_id: e.target.value }))}>
                    <option value="">— none —</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td><input className="form-input" value={newRow.notes} onChange={e => setNewRow(p => ({ ...p, notes: e.target.value }))} /></td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => setAdding(false)} className="btn-secondary">Cancel</button>
                    <button onClick={saveNew} className="btn-primary"><Save className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            )}
            {builders.map(b => (
              <BuilderRow key={b.id} builder={b} programs={programs} onChanged={onChanged} onError={onError} />
            ))}
            {!adding && builders.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-xs text-[#8B949E]">No builders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BuilderRow({
  builder, programs, onChanged, onError,
}: {
  builder: Builder
  programs: LoanProgram[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: builder.name,
    default_absorption_rate: String(builder.default_absorption_rate),
    default_loan_program_id: builder.default_loan_program_id ?? '',
    notes: builder.notes ?? '',
  })

  useEffect(() => {
    setDraft({
      name: builder.name,
      default_absorption_rate: String(builder.default_absorption_rate),
      default_loan_program_id: builder.default_loan_program_id ?? '',
      notes: builder.notes ?? '',
    })
  }, [builder])

  const save = async () => {
    if (!draft.name.trim()) { onError('Name is required.'); return }
    try {
      const res = await fetch(`/api/builders/${builder.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          default_absorption_rate: Number(draft.default_absorption_rate) || 0,
          default_loan_program_id: draft.default_loan_program_id || null,
          notes: draft.notes || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setEditing(false)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const remove = async () => {
    if (!confirm(`Delete builder "${builder.name}"?`)) return
    try {
      const res = await fetch(`/api/builders/${builder.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const programName = programs.find(p => p.id === builder.default_loan_program_id)?.name ?? '—'

  if (editing) {
    return (
      <tr className="bg-[#21262D]/40">
        <td><input className="form-input" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} /></td>
        <td><input type="number" step="0.1" className="form-input text-right" value={draft.default_absorption_rate} onChange={e => setDraft(p => ({ ...p, default_absorption_rate: e.target.value }))} /></td>
        <td>
          <select className="form-input" value={draft.default_loan_program_id} onChange={e => setDraft(p => ({ ...p, default_loan_program_id: e.target.value }))}>
            <option value="">— none —</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </td>
        <td><input className="form-input" value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} /></td>
        <td>
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} className="btn-primary"><Save className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="text-[#C9D1D9] font-medium">{builder.name}</td>
      <td className="num">{builder.default_absorption_rate}</td>
      <td>{programName}</td>
      <td className="text-[10px] max-w-xs truncate">{builder.notes || '—'}</td>
      <td>
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil className="w-3 h-3" /></button>
          <button onClick={remove} className="btn-ghost text-[#F85149]"><Trash2 className="w-3 h-3" /></button>
        </div>
      </td>
    </tr>
  )
}

// ─── Scheduled Originations card ───────────────────────────────────────────

interface ScheduledDraft {
  builder_id: string
  loan_program_id: string
  forecast_month: string
  count: string
  max_amount_per_loan: string
  notes: string
}

const EMPTY_SCHEDULED_DRAFT: ScheduledDraft = {
  builder_id: '', loan_program_id: '', forecast_month: '',
  count: '1', max_amount_per_loan: '', notes: '',
}

function ScheduledOriginationsCard({
  scheduled, builders, programs, onChanged, onError,
}: {
  scheduled: ScheduledOrigination[]
  builders: Builder[]
  programs: LoanProgram[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft]   = useState<ScheduledDraft>(EMPTY_SCHEDULED_DRAFT)

  const startAdd = () => {
    setAdding(true)
    setDraft({
      ...EMPTY_SCHEDULED_DRAFT,
      loan_program_id: programs[0]?.id ?? '',
    })
  }

  const saveNew = async () => {
    if (!draft.loan_program_id) { onError('Loan program is required.'); return }
    if (!draft.forecast_month) { onError('Month is required.'); return }
    try {
      const res = await fetch('/api/scheduled-originations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed')
      setAdding(false)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  return (
    <div className="card fade-up fade-up-4">
      <div className="card-header">
        <span className="card-title">
          Scheduled Originations · {scheduled.length}
        </span>
        <button onClick={startAdd} disabled={adding} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> Add Origination
        </button>
      </div>
      <div className="px-4 pt-2 pb-1 text-[10px] text-[#8B949E]">
        Standalone (non-lot-driven) cohorts. Each row originates <code>count</code> loans in the chosen
        month under the chosen program, drawing per that program&apos;s curve and paying off at term.
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Builder</th>
              <th>Program</th>
              <th>Month</th>
              <th className="text-right">Count</th>
              <th className="text-right">$ / loan</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-[#21262D]/40">
                <td>
                  <select className="form-input" value={draft.builder_id} onChange={e => setDraft(p => ({ ...p, builder_id: e.target.value }))}>
                    <option value="">— any —</option>
                    {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="form-input" value={draft.loan_program_id} onChange={e => setDraft(p => ({ ...p, loan_program_id: e.target.value }))}>
                    <option value="">— pick program —</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td>
                  <input type="month" className="form-input" value={draft.forecast_month} onChange={e => setDraft(p => ({ ...p, forecast_month: e.target.value }))} />
                </td>
                <td><input type="number" min="0" step="1" className="form-input text-right" value={draft.count} onChange={e => setDraft(p => ({ ...p, count: e.target.value }))} /></td>
                <td><input type="number" step="1000" className="form-input text-right" value={draft.max_amount_per_loan} onChange={e => setDraft(p => ({ ...p, max_amount_per_loan: e.target.value }))} /></td>
                <td><input className="form-input" value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} /></td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => setAdding(false)} className="btn-secondary">Cancel</button>
                    <button onClick={saveNew} className="btn-primary"><Save className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            )}
            {scheduled.map(s => (
              <ScheduledRow
                key={s.id}
                row={s}
                builders={builders}
                programs={programs}
                onChanged={onChanged}
                onError={onError}
              />
            ))}
            {!adding && scheduled.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-xs text-[#8B949E]">
                No scheduled originations.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScheduledRow({
  row, builders, programs, onChanged, onError,
}: {
  row: ScheduledOrigination
  builders: Builder[]
  programs: LoanProgram[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const monthValue = row.forecast_month ? row.forecast_month.slice(0, 7) : ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ScheduledDraft>(() => ({
    builder_id: row.builder_id ?? '',
    loan_program_id: row.loan_program_id,
    forecast_month: monthValue,
    count: String(row.count),
    max_amount_per_loan: String(row.max_amount_per_loan),
    notes: row.notes ?? '',
  }))

  useEffect(() => {
    setDraft({
      builder_id: row.builder_id ?? '',
      loan_program_id: row.loan_program_id,
      forecast_month: monthValue,
      count: String(row.count),
      max_amount_per_loan: String(row.max_amount_per_loan),
      notes: row.notes ?? '',
    })
  }, [row, monthValue])

  const save = async () => {
    if (!draft.loan_program_id) { onError('Loan program is required.'); return }
    if (!draft.forecast_month) { onError('Month is required.'); return }
    try {
      const res = await fetch(`/api/scheduled-originations/${row.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setEditing(false)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const remove = async () => {
    if (!confirm('Delete this scheduled origination?')) return
    try {
      const res = await fetch(`/api/scheduled-originations/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const builderName = builders.find(b => b.id === row.builder_id)?.name ?? '—'
  const programName = programs.find(p => p.id === row.loan_program_id)?.name ?? '—'
  const monthLabel  = row.forecast_month
    ? new Date(row.forecast_month + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '—'

  if (editing) {
    return (
      <tr className="bg-[#21262D]/40">
        <td>
          <select className="form-input" value={draft.builder_id} onChange={e => setDraft(p => ({ ...p, builder_id: e.target.value }))}>
            <option value="">— any —</option>
            {builders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </td>
        <td>
          <select className="form-input" value={draft.loan_program_id} onChange={e => setDraft(p => ({ ...p, loan_program_id: e.target.value }))}>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </td>
        <td>
          <input type="month" className="form-input" value={draft.forecast_month} onChange={e => setDraft(p => ({ ...p, forecast_month: e.target.value }))} />
        </td>
        <td><input type="number" min="0" step="1" className="form-input text-right" value={draft.count} onChange={e => setDraft(p => ({ ...p, count: e.target.value }))} /></td>
        <td><input type="number" step="1000" className="form-input text-right" value={draft.max_amount_per_loan} onChange={e => setDraft(p => ({ ...p, max_amount_per_loan: e.target.value }))} /></td>
        <td><input className="form-input" value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} /></td>
        <td>
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} className="btn-primary"><Save className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>{builderName}</td>
      <td className="text-[#C9D1D9] font-medium">{programName}</td>
      <td>{monthLabel}</td>
      <td className="num">{row.count}</td>
      <td className="num">${Number(row.max_amount_per_loan).toLocaleString()}</td>
      <td className="text-[10px] max-w-xs truncate">{row.notes || '—'}</td>
      <td>
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil className="w-3 h-3" /></button>
          <button onClick={remove} className="btn-ghost text-[#F85149]"><Trash2 className="w-3 h-3" /></button>
        </div>
      </td>
    </tr>
  )
}

// ─── Program card ──────────────────────────────────────────────────────────

function ProgramCard({ program, onEdit }: { program: LoanProgram; onEdit: () => void }) {
  const curveSum = program.draw_curve.reduce((s, v) => s + v, 0)
  const maxCurve = Math.max(...program.draw_curve, 0.01)

  return (
    <div className="border border-[#21262D] rounded-lg p-3 hover:border-[#D4A853]/40 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-[#E6EDF3]">{program.name}</div>
          <div className="text-[10px] text-[#8B949E] mt-0.5">
            <span className="badge badge-steel mr-1">{program.product_type}</span>
            {program.default_term_months} mo · {(program.default_rate * 100).toFixed(2)}%
          </div>
        </div>
        <button onClick={onEdit} className="btn-ghost"><Pencil className="w-3 h-3" /></button>
      </div>
      <div className="flex items-end gap-0.5 h-10 mb-1 px-1 bg-[#0D1117] rounded">
        {program.draw_curve.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`M${i + 1}: ${(v * 100).toFixed(1)}%`}>
            <div className="bg-[#D4A853]/80 rounded-t" style={{ height: `${(v / maxCurve) * 100}%`, minHeight: '1px' }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#8B949E]">{program.draw_curve.length} months of draws</span>
        <span className={`font-mono ${Math.abs(curveSum - 1) < 0.01 ? 'text-[#3FB950]' : 'text-[#D4A853]'}`}>
          Σ = {(curveSum * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function SmallField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-[#8B949E] mt-1">{hint}</div>}
    </div>
  )
}
