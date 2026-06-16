'use client'

import { useEffect, useMemo, useState } from 'react'
import { addMonths, format, parseISO, differenceInCalendarDays } from 'date-fns'
import { CreditCard, AlertCircle, Search, Filter } from 'lucide-react'
import { Loan, LoanType } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

// Calendar months between two month-dates (signed, matches calculator.ts).
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 +
         (to.getMonth() - from.getMonth())
}

// Product-type chips — same look as the dashboard's strip, but scoped to
// this page. Land Bucket is intentionally absent: no loan_type maps to it.
type FilterKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh'

const CHIPS: { key: FilterKey; label: string; color: string; types: LoanType[] }[] = [
  // OTC (One-Time Close) tags ride the SFR chip — its own loan_type so analysts
  // can spot it in the Type column, but rolled into SFR everywhere else.
  { key: 'sfr',           label: 'SFR',           color: '#58A6FF', types: ['SFR', 'OTC'] },
  { key: 'mfr',           label: 'MFR',           color: '#D4A853', types: ['MFR'] },
  { key: 'and',           label: 'A&D',           color: '#3FB950', types: ['A&D'] },
  { key: 'raw_land',      label: 'Raw Land',      color: '#8B949E', types: ['RAW_LAND'] },
  { key: 'finished_lots', label: 'Finished Lots', color: '#A371F7', types: ['FINISHED_LOTS'] },
  // HHH/JV folds in UNKNOWN, same convention as the dashboard / engine.
  { key: 'hhh',           label: 'HHH/JV',        color: '#F85149', types: ['HHH', 'UNKNOWN'] },
]

// Reverse lookup: loan_type → chip key (for filter membership tests).
const LOAN_TYPE_TO_CHIP = new Map<LoanType, FilterKey>()
for (const c of CHIPS) for (const t of c.types) LOAN_TYPE_TO_CHIP.set(t, c.key)

interface LoansResponse {
  loans: Loan[]
  versionLabel: string
  asOfDate: string | null
  startDate: string
  horizonMonths: number
}

// Linear-ramp balance for a single loan in a given month.
//
// today    -> loan_amount_disbursed
// maturity -> projected_balance (treated as the loan's end-state target)
// After the maturity month: 0.
//
// "projected" is max(projected_balance, current_loan_amount, loan_amount_disbursed)
// to guard against bad imports where one of those is zero.
//
// FINISHED_LOTS exception (matches calculator.ts): caps at current_loan_amount
// (never pulled up by projected_balance) and pays down by original_loan_amount
// / release_period_months per month from `today`.
function loanMonthBalance(loan: Loan, monthDate: Date, today: Date): number {
  if (loan.current_loan_due_date) {
    const maturity = parseISO(loan.current_loan_due_date)
    if (monthDate >= maturity) return 0
  }

  if (loan.loan_type === 'FINISHED_LOTS') {
    const startBal = Math.max(loan.current_loan_amount, loan.loan_amount_disbursed, 0)
    const horizon = loan.release_period_months || 0
    if (horizon <= 0) return startBal
    const perMonth = (loan.original_loan_amount || 0) / horizon
    const i = Math.max(0, monthsBetween(today, monthDate))
    return Math.max(0, startBal - i * perMonth)
  }

  const start = loan.loan_amount_disbursed
  const projected = Math.max(
    loan.projected_balance,
    loan.current_loan_amount,
    loan.loan_amount_disbursed,
  )

  // No maturity date — hold projected balance through the horizon.
  if (!loan.current_loan_due_date) return projected

  const maturity = parseISO(loan.current_loan_due_date)
  const totalDays = differenceInCalendarDays(maturity, today)
  if (totalDays <= 0) return 0
  const elapsedDays = differenceInCalendarDays(monthDate, today)
  const fraction = Math.max(0, Math.min(1, elapsedDays / totalDays))

  return start + (projected - start) * fraction
}

export default function LoansPage() {
  const [data, setData]       = useState<LoansResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState('')
  const [active, setActive]   = useState<Set<FilterKey>>(new Set(CHIPS.map(c => c.key)))
  const [saving, setSaving]   = useState<Set<string>>(new Set())

  // PATCH a single FL release field (number_of_lots | release_period_months)
  // on blur. Optimistically updates the local cache so the projection columns
  // recompute immediately; on failure we re-load to drop the bad value.
  const patchLoan = async (
    id: string,
    field: 'number_of_lots' | 'release_period_months',
    value: number,
  ) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        loans: prev.loans.map(l => l.id === id ? { ...l, [field]: value } : l),
      }
    })
    setSaving(s => { const n = new Set(s); n.add(id); return n })
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `${res.status} ${res.statusText}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      await load()
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/loans')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const months = useMemo(() => {
    if (!data) return []
    const start = parseISO(data.startDate)
    return Array.from({ length: data.horizonMonths }, (_, i) => {
      const d = addMonths(start, i)
      return { date: d, label: format(d, 'MMM yy'), key: format(d, 'yyyy-MM') }
    })
  }, [data])

  const filteredLoans = useMemo(() => {
    if (!data) return []
    const q = filter.trim().toLowerCase()
    return data.loans.filter(l => {
      // Product-type chip gate. UNKNOWN loans ride the HHH chip; any loan whose
      // type isn't in CHIPS (shouldn't happen given the LoanType union) drops
      // out when not all chips are active.
      const chip = LOAN_TYPE_TO_CHIP.get(l.loan_type)
      if (!chip || !active.has(chip)) return false
      if (!q) return true
      return (
        l.loan_number.toLowerCase().includes(q) ||
        l.borrower.toLowerCase().includes(q) ||
        (l.loan_program ?? '').toLowerCase().includes(q) ||
        (l.development_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [data, filter, active])

  // Per-month grand total across the filtered set.
  const monthTotals = useMemo(() => {
    if (!data || months.length === 0) return []
    const today = parseISO(data.startDate)
    return months.map(m => filteredLoans.reduce(
      (s, l) => s + loanMonthBalance(l, m.date, today), 0,
    ))
  }, [filteredLoans, months, data])

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading…</div>
  if (error) return (
    <div className="p-6 flex items-start gap-3 text-sm">
      <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
      <div>
        <div className="text-danger font-medium">Failed to load loans</div>
        <div className="text-fg-dim mt-1">{error}</div>
        <button onClick={load} className="btn-secondary mt-3">Retry</button>
      </div>
    </div>
  )
  if (!data) return null

  const today = parseISO(data.startDate)

  const toggle = (key: FilterKey) => {
    const next = new Set(active)
    if (next.has(key)) next.delete(key); else next.add(key)
    setActive(next)
  }
  const chipsFiltered = active.size < CHIPS.length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-accent" />
            Loans
          </h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {data.versionLabel} · {data.loans.length} loans · projected balances ramp linearly from disbursed to projected, zero at maturity
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-fg-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by loan #, borrower, program, development"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="form-input text-xs pl-7 pr-3 py-1.5 w-80"
          />
        </div>
      </div>

      {/* Product-type chip filter — scoped to this page only. */}
      <div className="card fade-up fade-up-1.5 p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-fg-dim mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Product types:</span>
        </div>
        {CHIPS.map(chip => {
          const on = active.has(chip.key)
          return (
            <button
              key={chip.key}
              onClick={() => toggle(chip.key)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium
                          border transition-all
                          ${on
                            ? 'border-border-strong text-fg bg-surface'
                            : 'border-border text-fg-dim opacity-60 hover:opacity-100'}`}
              title={on ? `Hide ${chip.label}` : `Show ${chip.label}`}
            >
              <span className="w-2 h-2 rounded-full"
                    style={{ background: on ? chip.color : 'transparent', border: `1px solid ${chip.color}` }} />
              {chip.label}
            </button>
          )
        })}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setActive(new Set(CHIPS.map(c => c.key)))} className="btn-ghost text-[10px]">All</button>
          <button onClick={() => setActive(new Set())} className="btn-ghost text-[10px]">None</button>
        </div>
      </div>

      <div className="card fade-up fade-up-2">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-surface">Loan #</th>
                <th>Borrower</th>
                <th>Program</th>
                <th>Type</th>
                <th className="text-right">Original</th>
                <th className="text-right">Current</th>
                <th className="text-right">Remaining</th>
                <th>Funded</th>
                <th>Maturity</th>
                <th className="text-right" title="Finished Lots only — number of lots collateralizing the loan">
                  # Lots
                </th>
                <th className="text-right" title="Finished Lots only — months to release all lots (linear paydown)">
                  Release (mo)
                </th>
                {months.map(m => (
                  <th key={m.key} className="text-right">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={11 + months.length} className="text-center text-xs text-fg-dim py-8">
                    {filter || chipsFiltered ? 'No loans match the current filter.' : 'No loans imported.'}
                  </td>
                </tr>
              ) : filteredLoans.map(loan => (
                <tr key={loan.id ?? loan.loan_number}>
                  <td className="sticky left-0 z-10 bg-surface text-fg-strong font-mono text-[10px]">
                    {loan.loan_number}
                  </td>
                  <td className="text-fg">{loan.borrower}</td>
                  <td className="text-[10px]">{loan.loan_program || '—'}</td>
                  <td className="text-[10px]">{loan.loan_type}</td>
                  <td className="num">{formatCurrency(loan.original_loan_amount, true)}</td>
                  <td className="num">{formatCurrency(loan.current_loan_amount, true)}</td>
                  <td className="num">{formatCurrency(loan.loan_amount_remaining, true)}</td>
                  <td className="text-[10px] font-mono">{loan.loan_funded_date ?? '—'}</td>
                  <td className="text-[10px] font-mono">{loan.current_loan_due_date ?? '—'}</td>
                  {loan.loan_type === 'FINISHED_LOTS' && loan.id ? (
                    <>
                      <td className="num">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={loan.number_of_lots}
                          disabled={saving.has(loan.id)}
                          onBlur={e => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 1))
                            if (n !== loan.number_of_lots) patchLoan(loan.id!, 'number_of_lots', n)
                          }}
                          className="form-input text-[10px] w-16 py-0.5 px-1 text-right"
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={loan.release_period_months}
                          disabled={saving.has(loan.id)}
                          onBlur={e => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
                            if (n !== loan.release_period_months) patchLoan(loan.id!, 'release_period_months', n)
                          }}
                          className="form-input text-[10px] w-16 py-0.5 px-1 text-right"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="num text-fg-dim">—</td>
                      <td className="num text-fg-dim">—</td>
                    </>
                  )}
                  {months.map(m => {
                    const bal = loanMonthBalance(loan, m.date, today)
                    const isPostMaturity = !!loan.current_loan_due_date && m.date >= parseISO(loan.current_loan_due_date)
                    return (
                      <td key={m.key} className={`num ${isPostMaturity ? 'text-fg-dim' : ''}`}>
                        {isPostMaturity && bal === 0 ? '—' : formatCurrency(bal, true)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filteredLoans.length > 0 && (
                <tr className="bg-accent/10 text-fg-strong font-semibold border-t-2 border-accent/40">
                  <td className="sticky left-0 z-10 bg-accent/10 uppercase text-[10px] tracking-wide">
                    Grand total
                  </td>
                  <td colSpan={10} className="text-[10px] text-fg-dim">
                    {filteredLoans.length} loan{filteredLoans.length === 1 ? '' : 's'}
                    {(filter || chipsFiltered) && ` (filtered from ${data.loans.length})`}
                  </td>
                  {monthTotals.map((t, i) => (
                    <td key={i} className="num">{formatCurrency(t, true)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-fg-dim italic px-1 space-y-0.5">
        <div>
          First month uses each loan's <code>loan_amount_disbursed</code>; later months interpolate linearly toward
          max(<code>projected_balance</code>, <code>current_loan_amount</code>, <code>loan_amount_disbursed</code>); the maturity month and beyond are zero.
        </div>
        <div>
          <strong>Finished Lots / Multi-Lot Lot Loan:</strong> capped at <code>current_loan_amount</code> (never increases) and pays down by
          <code> original_loan_amount ÷ Release (mo)</code> each month. Set Release to 0 to hold flat until maturity.
        </div>
      </div>
    </div>
  )
}
