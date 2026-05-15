'use client'

import { useEffect, useState } from 'react'
import { ForecastResult } from '@/lib/types'
import { formatCurrency, formatPct } from '@/lib/utils'
import { TrendingUp, AlertCircle } from 'lucide-react'

export default function ForecastPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

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
                <th className="text-right">Fcst SFR</th>
                <th className="text-right">Fcst MFR</th>
                <th className="text-right">Total Fcst</th>
                <th className="text-right">Active Portfolio</th>
                <th className="text-right">Grand Total</th>
                <th className="text-right">Monthly Income</th>
                <th className="text-right">Ann. Yield</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map(m => (
                <tr key={m.month}>
                  <td className="text-fg font-medium">{m.label}</td>
                  <td className="num">{m.new_originations_count || '—'}</td>
                  <td className="num">{m.new_originations_amount ? formatCurrency(m.new_originations_amount, true) : '—'}</td>
                  <td className="num text-success-bright">{formatCurrency(m.forecasted_sfr, true)}</td>
                  <td className="num text-success-bright">{formatCurrency(m.forecasted_mfr, true)}</td>
                  <td className="num font-medium">{formatCurrency(m.forecasted_total, true)}</td>
                  <td className="num">{formatCurrency(m.total_loans, true)}</td>
                  <td className="num font-medium text-accent">{formatCurrency(m.total_all, true)}</td>
                  <td className="num text-accent">{formatCurrency(m.total_income, true)}</td>
                  <td className="num">{formatPct(m.annualized_yield_pct)}</td>
                </tr>
              ))}
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
