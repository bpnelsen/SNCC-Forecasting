'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import {
  Plus, Trash2, AlertCircle, CheckCircle, Filter, ArrowRight,
} from 'lucide-react'
import { ApprovedLoan, ApprovedLoanStatus, ApprovedLoanType } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const LOAN_TYPES: ApprovedLoanType[] = ['Vertical', 'A&D', 'Finished Lots', 'Land', 'Other']

const STATUS_META: Record<ApprovedLoanStatus, { label: string; color: string }> = {
  Open:      { label: 'Open',      color: '#58A6FF' },
  Closed:    { label: 'Closed',    color: '#3FB950' },
  Expired:   { label: 'Expired',   color: '#F85149' },
  Cancelled: { label: 'Cancelled', color: '#8B949E' },
}

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
  if (d == null)  return 'text-fg-dim'
  if (d < 0)      return 'text-danger font-medium'
  if (d <= 14)    return 'text-warning font-medium'
  return 'text-fg'
}

// Counterpart page name for the toast when a row routes out of the current
// scope ("moved to Closed Loans" / "moved to Approved Loans"). Driven by the
// page scope rather than the destination status so the wording stays right
// even if the destination is, say, Cancelled or Expired.
function counterpartLabel(scope: ApprovedLoanStatus[]): string {
  return scope.includes('Open') ? 'Closed Loans' : 'Approved Loans'
}

export interface ApprovedLoansTableProps {
  // Status values this page is scoped to. Rows with any other status are
  // filtered out at load and disappear immediately when a row's status
  // is edited to a value outside this list.
  scope: ApprovedLoanStatus[]
  // Status assigned to a new row when "Add row" is clicked. Must be in scope.
  defaultStatus: ApprovedLoanStatus
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
}

export function ApprovedLoansTable({
  scope, defaultStatus, title, subtitle, icon: Icon,
}: ApprovedLoansTableProps) {
  // Source of truth = the full rowset returned by the API. We filter to
  // `scope` at render time so status edits that move a row out of scope
  // make it disappear without a refetch.
  const [allRows, setAllRows] = useState<ApprovedLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<Set<string>>(new Set())
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [activeStatus, setActiveStatus] = useState<Set<ApprovedLoanStatus>>(new Set(scope))

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/approved-loans', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      setAllRows(Array.isArray(body) ? body : [])
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

  // Single-field update. When `field === 'status'` and the new status is
  // outside `scope`, flash a "moved to <counterpart>" toast so the user
  // doesn't think the row got deleted.
  const patch = async (id: string, field: keyof ApprovedLoan, value: unknown) => {
    setAllRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as ApprovedLoan : r))
    markBusy(id, true)
    try {
      const res = await fetch(`/api/approved-loans/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `${res.status} ${res.statusText}`)
      }
      if (field === 'status' && !scope.includes(value as ApprovedLoanStatus)) {
        setMsg({ type: 'ok', text: `Row moved to ${counterpartLabel(scope)}.` })
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
        body: JSON.stringify({ loan_type: 'Vertical', status: defaultStatus }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Add failed')
      setAllRows(prev => [...prev, body as ApprovedLoan])
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
      setAllRows(prev => prev.filter(r => r.id !== row.id))
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

  // Only rows in scope appear on this page, then the chip strip further
  // narrows within scope.
  const inScope = useMemo(
    () => allRows.filter(r => scope.includes(r.status)),
    [allRows, scope],
  )
  const filtered = useMemo(
    () => inScope.filter(r => activeStatus.has(r.status)),
    [inScope, activeStatus],
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
            <Icon className="w-5 h-5 text-accent" />
            {title}
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {subtitle} · {filtered.length} of {inScope.length} shown
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
        {scope.map(s => {
          const meta = STATUS_META[s]
          const on = activeStatus.has(s)
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium
                          border transition-all
                          ${on
                            ? 'border-border-strong text-fg bg-surface'
                            : 'border-border text-fg-dim opacity-60 hover:opacity-100'}`}
              title={on ? `Hide ${meta.label}` : `Show ${meta.label}`}
            >
              <span className="w-2 h-2 rounded-full"
                    style={{ background: on ? meta.color : 'transparent', border: `1px solid ${meta.color}` }} />
              {meta.label}
            </button>
          )
        })}
        <div className="flex items-center gap-1 ml-auto text-[10px] text-fg-dim">
          <ArrowRight className="w-3 h-3" />
          Change a row's Status to route it to <strong className="text-fg">{counterpartLabel(scope)}</strong>.
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
                    {inScope.length === 0
                      ? 'Nothing here yet — click "Add row" to start.'
                      : 'No rows match the current status filter.'}
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
                        defaultValue={row.status}
                        disabled={isBusy}
                        onChange={e => patch(row.id, 'status', e.target.value)}
                        className="form-input text-[10px] py-1 px-1.5 w-full bg-transparent"
                        style={{ color: STATUS_META[row.status]?.color ?? undefined }}
                      >
                        {(Object.keys(STATUS_META) as ApprovedLoanStatus[]).map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <CellInput
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

      <div className="text-[10px] text-fg-dim italic px-1">
        Days left = LC approval expiration date − today ({format(new Date(), 'd-MMM yyyy')}).
        Negative values mean the approval has already expired. Edit any cell — saves on blur.
      </div>
    </div>
  )
}
