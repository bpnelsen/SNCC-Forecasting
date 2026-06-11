'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import {
  ClipboardCheck, Plus, Trash2, AlertCircle, CheckCircle, Filter,
} from 'lucide-react'
import { ApprovedLoan, ApprovedLoanStatus, ApprovedLoanType } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const LOAN_TYPES: ApprovedLoanType[] = ['Vertical', 'A&D', 'Finished Lots', 'Land', 'Other']

const STATUSES: { key: ApprovedLoanStatus; label: string; color: string }[] = [
  { key: 'Open',   label: 'Open',   color: '#58A6FF' },
  { key: 'Closed', label: 'Closed', color: '#3FB950' },
]

// Editable cell — autosaves on blur if the value changed. Uncontrolled so
// typing doesn't re-render the whole row on each keystroke.
function CellInput(props: {
  defaultValue: string
  onCommit: (value: string) => void
  disabled?: boolean
  type?: 'text' | 'date' | 'number'
  className?: string
  placeholder?: string
}) {
  return (
    <input
      type={props.type ?? 'text'}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onBlur={e => {
        if (e.target.value !== props.defaultValue) props.onCommit(e.target.value)
      }}
      className={`form-input text-[10px] py-1 px-1.5 w-full bg-transparent ${props.className ?? ''}`}
    />
  )
}

function daysLeft(expiration: string | null): number | null {
  if (!expiration) return null
  return differenceInCalendarDays(parseISO(expiration), new Date())
}

function daysLeftClass(d: number | null): string {
  if (d == null) return 'text-fg-dim'
  if (d < 0)     return 'text-danger font-medium'
  if (d <= 14)   return 'text-warning font-medium'
  return 'text-fg'
}

export default function ApprovedLoansPage() {
  const [rows, setRows]       = useState<ApprovedLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<Set<string>>(new Set())
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [activeStatus, setActiveStatus] = useState<Set<ApprovedLoanStatus>>(
    new Set(STATUSES.map(s => s.key)),
  )

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/approved-loans', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      setRows(Array.isArray(body) ? body : [])
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Failed to load' })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const markBusy = (id: string, on: boolean) => {
    setBusy(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  // Partial PATCH. When `status` flips to Closed and date_completed is blank,
  // we also stamp today's date in the same request so the Date Completed
  // column auto-fills.
  const patch = async (id: string, field: keyof ApprovedLoan, value: unknown) => {
    const extras: Partial<ApprovedLoan> = {}
    if (field === 'status' && value === 'Closed') {
      const current = rows.find(r => r.id === id)
      if (current && !current.date_completed) {
        extras.date_completed = format(new Date(), 'yyyy-MM-dd')
      }
    }

    setRows(prev => prev.map(r => r.id === id
      ? { ...r, [field]: value, ...extras } as ApprovedLoan
      : r))
    markBusy(id, true)
    try {
      const res = await fetch(`/api/approved-loans/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, ...extras }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `${res.status} ${res.statusText}`)
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' })
      await load()
    } finally { markBusy(id, false) }
  }

  const addRow = async () => {
    setMsg(null)
    try {
      const res = await fetch('/api/approved-loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loan_type: 'Vertical', status: 'Open' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Add failed')
      setRows(prev => [...prev, body as ApprovedLoan])
      setMsg({ type: 'ok', text: 'Row added.' })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Add failed' })
    }
  }

  const remove = async (row: ApprovedLoan) => {
    if (!confirm(`Delete "${row.borrower_project_name || 'this row'}"?`)) return
    markBusy(row.id, true)
    try {
      const res = await fetch(`/api/approved-loans/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Delete failed')
      }
      setRows(prev => prev.filter(r => r.id !== row.id))
      setMsg({ type: 'ok', text: 'Row deleted.' })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { markBusy(row.id, false) }
  }

  const toggleStatus = (key: ApprovedLoanStatus) => {
    setActiveStatus(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const filtered = useMemo(
    () => rows.filter(r => activeStatus.has(r.status)),
    [rows, activeStatus],
  )

  const totalLoanAmount = useMemo(
    () => filtered.reduce((s, r) => s + (r.loan_amount || 0), 0),
    [filtered],
  )

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-accent" />
            Approved Loans
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            Committee-approved loans · {filtered.length} of {rows.length} shown
          </p>
        </div>
        <button onClick={addRow} className="btn-primary inline-flex items-center gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Add row
        </button>
      </div>

      {msg && (
        <div className={`card p-2 text-xs flex items-start gap-2 ${
          msg.type === 'ok' ? 'text-success-bright' : 'text-danger'
        }`}>
          {msg.type === 'ok'
            ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <div className="flex-1">{msg.text}</div>
          <button onClick={() => setMsg(null)} className="text-fg-dim hover:text-fg">×</button>
        </div>
      )}

      <div className="card fade-up fade-up-1.5 p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-fg-dim mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Status:</span>
        </div>
        {STATUSES.map(s => {
          const on = activeStatus.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggleStatus(s.key)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium
                          border transition-all
                          ${on
                            ? 'border-border-strong text-fg bg-surface'
                            : 'border-border text-fg-dim opacity-60 hover:opacity-100'}`}
              title={on ? `Hide ${s.label}` : `Show ${s.label}`}
            >
              <span className="w-2 h-2 rounded-full"
                    style={{ background: on ? s.color : 'transparent', border: `1px solid ${s.color}` }} />
              {s.label}
            </button>
          )
        })}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setActiveStatus(new Set(STATUSES.map(s => s.key)))} className="btn-ghost text-[10px]">All</button>
          <button onClick={() => setActiveStatus(new Set())} className="btn-ghost text-[10px]">None</button>
        </div>
      </div>

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Loan Type</th>
                <th>Date Approved</th>
                <th className="min-w-[280px]">Borrower / Project Name</th>
                <th className="text-right">Days left</th>
                <th>LC Approval Expiration</th>
                <th>Status</th>
                <th>Date Completed</th>
                <th className="min-w-[200px]">Disposition Notes</th>
                <th className="min-w-[200px]">Next Steps / Notes</th>
                <th className="text-right">Loan Amount</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-xs text-fg-dim py-8">
                    {rows.length === 0 ? 'No approved loans yet — click "Add row" to start.' : 'No rows match the current status filter.'}
                  </td>
                </tr>
              ) : filtered.map(row => {
                const d = daysLeft(row.lc_approval_expiration)
                const isBusy = busy.has(row.id)
                return (
                  <tr key={row.id} className={isBusy ? 'opacity-60' : ''}>
                    <td>
                      <select
                        defaultValue={row.loan_type}
                        disabled={isBusy}
                        onChange={e => patch(row.id, 'loan_type', e.target.value)}
                        className="form-input text-[10px] py-1 px-1.5 w-full bg-transparent"
                      >
                        {LOAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <CellInput
                        type="date"
                        defaultValue={row.date_approved ?? ''}
                        onCommit={v => patch(row.id, 'date_approved', v || null)}
                        disabled={isBusy}
                        className="font-mono"
                      />
                    </td>
                    <td>
                      <CellInput
                        defaultValue={row.borrower_project_name}
                        onCommit={v => patch(row.id, 'borrower_project_name', v)}
                        disabled={isBusy}
                        placeholder="Borrower / project"
                      />
                    </td>
                    <td className={`num ${daysLeftClass(d)}`}>
                      {d == null ? '—' : d}
                    </td>
                    <td>
                      <CellInput
                        type="date"
                        defaultValue={row.lc_approval_expiration ?? ''}
                        onCommit={v => patch(row.id, 'lc_approval_expiration', v || null)}
                        disabled={isBusy}
                        className="font-mono"
                      />
                    </td>
                    <td>
                      <select
                        value={row.status}
                        disabled={isBusy}
                        onChange={e => patch(row.id, 'status', e.target.value)}
                        className="form-input text-[10px] py-1 px-1.5 w-full bg-transparent"
                        style={{
                          color: STATUSES.find(s => s.key === row.status)?.color ?? undefined,
                        }}
                      >
                        {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td>
                      {/* key includes the row's date_completed so the input remounts
                          when the auto-fill (status → Closed) writes a date here. */}
                      <CellInput
                        key={`completed-${row.id}-${row.date_completed ?? ''}`}
                        type="date"
                        defaultValue={row.date_completed ?? ''}
                        onCommit={v => patch(row.id, 'date_completed', v || null)}
                        disabled={isBusy}
                        className="font-mono"
                      />
                    </td>
                    <td>
                      <CellInput
                        defaultValue={row.disposition_notes ?? ''}
                        onCommit={v => patch(row.id, 'disposition_notes', v || null)}
                        disabled={isBusy}
                      />
                    </td>
                    <td>
                      <CellInput
                        defaultValue={row.next_steps_notes ?? ''}
                        onCommit={v => patch(row.id, 'next_steps_notes', v || null)}
                        disabled={isBusy}
                      />
                    </td>
                    <td className="num">
                      <CellInput
                        type="number"
                        defaultValue={row.loan_amount ? String(row.loan_amount) : ''}
                        onCommit={v => patch(row.id, 'loan_amount', Number(v) || 0)}
                        disabled={isBusy}
                        className="text-right"
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => remove(row)}
                        disabled={isBusy}
                        title="Delete row"
                        className="text-fg-dim hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length > 0 && (
                <tr className="bg-accent/10 text-fg-strong font-semibold border-t-2 border-accent/40">
                  <td colSpan={9} className="text-[10px] text-fg-dim uppercase tracking-wide">
                    Grand total · {filtered.length} loan{filtered.length === 1 ? '' : 's'}
                  </td>
                  <td className="num">{formatCurrency(totalLoanAmount, true)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-fg-dim italic px-1 space-y-0.5">
        <div>
          Days left = LC approval expiration date − today ({format(new Date(), 'd-MMM yyyy')}).
          Negative values mean the approval has already expired.
        </div>
        <div>
          Setting Status to <strong>Closed</strong> auto-fills Date Completed with today's date if it's blank.
          Edit any cell — saves on blur.
        </div>
      </div>
    </div>
  )
}
