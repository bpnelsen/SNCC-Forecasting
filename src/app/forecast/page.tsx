'use client'

import { useEffect, useState } from 'react'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency, formatPct } from '@/lib/utils'
import { TrendingUp, AlertCircle, Filter } from 'lucide-react'

// Product-type chips — same set as the dashboard so the two pages filter
// consistently. Land Bucket only affects Grand Total (no forecasted-origination
// concept for raw land bucket inventory).
type FilterKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh' | 'land_bucket'

const CHIPS: { key: FilterKey; label: string; color: string }[] = [
  { key: 'sfr',           label: 'SFR',           color: '#58A6FF' },
  { key: 'mfr',           label: 'MFR',           color: '#D4A853' },
  { key: 'and',           label: 'A&D',           color: '#3FB950' },
  { key: 'raw_land',      label: 'Raw Land',      color: '#8B949E' },
  { key: 'finished_lots', label: 'Finished Lots', color: '#A371F7' },
  { key: 'hhh',           label: 'HHH/JV',        color: '#F85149' },
  { key: 'land_bucket',   label: 'Land Bucket',   color: '#79C0FF' },
]

const PRODUCT_KEYS = ['sfr', 'mfr', 'and', 'raw_land', 'finished_lots', 'hhh'] as const

// Per-row sliced figures driven by the active chips. Land Bucket only feeds
// the Grand Total; everything else flows from the six product-type chips.
function sliceMonth(m: MonthlyBalance, active: Set<FilterKey>) {
  let newOrigCount = 0
  let newOrigAmount = 0
  let forecastedTotal = 0
  let activePortfolio = 0
  // Drawn/outstanding loan balance and per-segment payoffs both follow the
  // chip filter so the new columns line up with the rest of the row.
  let currentLoanBalance = 0
  let payoffsAmount = 0
  for (const k of PRODUCT_KEYS) {
    if (!active.has(k)) continue
    newOrigCount     += m.new_origs_by_segment[k].count
    newOrigAmount    += m.new_origs_by_segment[k].amount
    forecastedTotal  += k === 'sfr'           ? m.forecasted_sfr
                      : k === 'mfr'           ? m.forecasted_mfr
                      : k === 'and'           ? m.forecasted_and
                      : k === 'raw_land'      ? m.forecasted_raw_land
                      : k === 'finished_lots' ? m.forecasted_finished_lots
                      :                          m.forecasted_hhh
    activePortfolio  += k === 'sfr'           ? m.sfr
                      : k === 'mfr'           ? m.mfr
                      : k === 'and'           ? m.and
                      : k === 'raw_land'      ? m.raw_land
                      : k === 'finished_lots' ? m.finished_lots
                      :                          m.hhh
    currentLoanBalance += k === 'sfr'           ? m.outstanding_sfr
                       :  k === 'mfr'           ? m.outstanding_mfr
                       :  k === 'and'           ? m.outstanding_and
                       :  k === 'raw_land'      ? m.outstanding_raw_land
                       :  k === 'finished_lots' ? m.outstanding_finished_lots
                       :                           m.outstanding_hhh
    payoffsAmount    += m.payoffs_by_segment?.[k] ?? 0
  }
  const grandTotal = activePortfolio + (active.has('land_bucket') ? m.land_bucket : 0)
  return {
    newOrigCount,
    newOrigAmount,
    payoffsAmount,
    fcstSfr:        active.has('sfr') ? m.forecasted_sfr : 0,
    fcstMfr:        active.has('mfr') ? m.forecasted_mfr : 0,
    forecastedTotal,
    activePortfolio,
    currentLoanBalance,
    grandTotal,
  }
}

export default function ForecastPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [active, setActive]   = useState<Set<FilterKey>>(new Set(CHIPS.map(c => c.key)))

  useEffect(() => {
    fetch('/api/calculate')
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-fg-dim text-sm">Loading forecast…</div>
  if (error)   return (
    <div className="p-6 flex gap-2 text-sm text-danger">
      <AlertCircle className="w-4 h-4 mt-0.5" />{error}
    </div>
  )
  if (!data) return null

  const toggle = (key: FilterKey) => {
    const next = new Set(active)
    if (next.has(key)) next.delete(key); else next.add(key)
    setActive(next)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          New Originations Forecast
        </h1>
        <p className="text-xs text-fg-dim mt-0.5">
          17-month forward projection · {data.version_label}
        </p>
      </div>

      {/* Product-type filter chips (mirrors the dashboard). */}
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

      {/* NHCF Table */}
      <div className="card fade-up fade-up-2">
        <div className="card-header">
          <span className="card-title">Forecasted Originations by Month</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">New Orig (#)</th>
                <th className="text-right">New Orig $</th>
                <th className="text-right">Payoffs</th>
                <th className="text-right">Fcst SFR</th>
                <th className="text-right">Fcst MFR</th>
                <th className="text-right">Total Fcst</th>
                <th className="text-right">Active Portfolio</th>
                <th className="text-right">Current Loan Balance</th>
                <th className="text-right">Grand Total</th>
                <th className="text-right">Monthly Income</th>
                <th className="text-right">Ann. Yield</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map(m => {
                const s = sliceMonth(m, active)
                return (
                  <tr key={m.month}>
                    <td className="text-fg font-medium">{m.label}</td>
                    <td className="num">{s.newOrigCount || '—'}</td>
                    <td className="num">{s.newOrigAmount ? formatCurrency(s.newOrigAmount, true) : '—'}</td>
                    <td className="num text-danger">
                      {s.payoffsAmount ? `−${formatCurrency(s.payoffsAmount, true)}` : '—'}
                    </td>
                    <td className="num text-success-bright">{formatCurrency(s.fcstSfr, true)}</td>
                    <td className="num text-success-bright">{formatCurrency(s.fcstMfr, true)}</td>
                    <td className="num font-medium">{formatCurrency(s.forecastedTotal, true)}</td>
                    <td className="num">{formatCurrency(s.activePortfolio, true)}</td>
                    <td className="num">{formatCurrency(s.currentLoanBalance, true)}</td>
                    <td className="num font-medium text-accent">{formatCurrency(s.grandTotal, true)}</td>
                    <td className="num text-accent">{formatCurrency(m.total_income, true)}</td>
                    <td className="num">{formatPct(m.annualized_yield_pct)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Income Detail Table */}
      <div className="card fade-up fade-up-3">
        <div className="card-header">
          <span className="card-title">Income Breakdown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Active Yield</th>
                <th className="text-right">Proj. Yield</th>
                <th className="text-right">LB Yield</th>
                <th className="text-right">HHH/JV Yield</th>
                <th className="text-right">A&amp;D Planned Yield</th>
                <th className="text-right">Profit Sharing</th>
                <th className="text-right">Total Income</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map(m => (
                <tr key={m.month}>
                  <td className="text-fg font-medium">{m.label}</td>
                  <td className="num">{formatCurrency(m.yield_active, true)}</td>
                  <td className="num">{formatCurrency(m.yield_projected, true)}</td>
                  <td className="num">{formatCurrency(m.yield_land_bucket, true)}</td>
                  <td className="num">{formatCurrency(m.yield_hhh_jv ?? 0, true)}</td>
                  <td className="num">{formatCurrency(m.yield_a_and_d_planned ?? 0, true)}</td>
                  <td className="num text-success-light">{formatCurrency(m.profit_sharing, true)}</td>
                  <td className="num font-medium text-accent">{formatCurrency(m.total_income, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
