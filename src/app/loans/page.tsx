'use client'

import { useEffect, useMemo, useState } from 'react'
import { addMonths, format, parseISO, differenceInCalendarDays } from 'date-fns'
import { CreditCard, AlertCircle, Search } from 'lucide-react'
import { Loan } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

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
function loanMonthBalance(loan: Loan, monthDate: Date, today: Date): number {
  const start = loan.loan_amount_disbursed
  const projected = Math.max(
    loan.projected_balance,
    loan.current_loan_amount,
    loan.loan_amount_disbursed,
  )

  // No maturity date — hold projected balance through the horizon.
  if (!loan.current_loan_due_date) return projected

  const maturity = parseISO(loan.current_loan_due_date)
  if (monthDate >= maturity) return 0

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
    if (!q) return data.loans
    return data.loans.filter(l =>
      l.loan_number.toLowerCase().includes(q) ||
      l.borrower.toLowerCase().includes(q) ||
      (l.loan_program ?? '').toLowerCase().includes(q) ||
      (l.development_name ?? '').toLowerCase().includes(q)
    )
  }, [data, filter])

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
                {months.map(m => (
                  <th key={m.key} className="text-right">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={9 + months.length} className="text-center text-xs text-fg-dim py-8">
                    {filter ? 'No loans match the filter.' : 'No loans imported.'}
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
                  <td colSpan={8} className="text-[10px] text-fg-dim">
                    {filteredLoans.length} loan{filteredLoans.length === 1 ? '' : 's'}
                    {filter && ` (filtered from ${data.loans.length})`}
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

      <div className="text-[10px] text-fg-dim italic px-1">
        First month uses each loan's <code>loan_amount_disbursed</code>; later months interpolate linearly toward
        max(<code>projected_balance</code>, <code>current_loan_amount</code>, <code>loan_amount_disbursed</code>); the maturity month and beyond are zero.
      </div>
    </div>
  )
}
