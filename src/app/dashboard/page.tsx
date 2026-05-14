'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { TotalBalanceChart, PortfolioStackedChart, IncomeChart, VarianceChart } from '@/components/charts/PortfolioCharts'
import { ForecastResult } from '@/lib/types'
import { formatCurrency, formatPct, formatVariance } from '@/lib/utils'
import { RefreshCw, AlertCircle } from 'lucide-react'

export default function DashboardPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/calculate')
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} onRetry={load} />
  if (!data)   return null

  const current = data.months[0]
  const peak    = data.months.reduce((a, b) => b.total_all > a.total_all ? b : a, data.months[0])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-[#E6EDF3]">Portfolio Dashboard</h1>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {data.version_label} · {data.total_active_loans} active loans · As of {data.as_of_date}
          </p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /><span>Refresh</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up fade-up-2">
        <StatCard label="Total Portfolio (All)" value={formatCurrency(current.total_all, true)}
          delta={`Peak: ${formatCurrency(peak.total_all, true)} (${peak.label})`} accent />
        <StatCard label="Active Loans" value={formatCurrency(current.total_loans, true)}
          subLabel={`${data.total_active_loans} loans`} />
        <StatCard label="Land Bucket" value={formatCurrency(current.land_bucket, true)}
          delta={formatVariance(current.land_bucket - (data.months[1]?.land_bucket || 0))} />
        <StatCard label="Monthly Income" value={formatCurrency(current.total_income, true)}
          delta={formatPct(current.annualized_yield_pct)} subLabel="annualized yield"
          deltaPositive={current.annualized_yield_pct > 0.08} />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 fade-up fade-up-3">
        <div className="card xl:col-span-2">
          <div className="card-header">
            <span className="card-title">Total Portfolio Balance</span>
            <span className="text-[10px] text-[#8B949E] font-mono">
              {data.months[0]?.label} → {data.months[data.months.length - 1]?.label}
            </span>
          </div>
          <div className="p-4"><TotalBalanceChart data={data.months} /></div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Current Breakdown</span></div>
          <div className="p-4 space-y-2">
            {[
              { label: 'SFR',           value: current.sfr,            color: '#58A6FF' },
              { label: 'MFR',           value: current.mfr,            color: '#D4A853' },
              { label: 'A&D',           value: current.and,            color: '#3FB950' },
              { label: 'Raw Land',      value: current.raw_land,       color: '#8B949E' },
              { label: 'Finished Lots', value: current.finished_lots,  color: '#A371F7' },
              { label: 'HHH/JV',        value: current.hhh,            color: '#F85149' },
              { label: 'Land Bucket',   value: current.land_bucket,    color: '#79C0FF' },
              { label: 'Fcst SFR',      value: current.forecasted_sfr, color: '#56D364' },
              { label: 'Fcst MFR',      value: current.forecasted_mfr, color: '#56D364' },
            ].filter(r => r.value > 0).map(row => {
              const pct = current.total_all > 0 ? row.value / current.total_all : 0
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                      <span className="text-[#8B949E]">{row.label}</span>
                    </div>
                    <span className="font-mono text-[#C9D1D9]">{formatCurrency(row.value, true)}</span>
                  </div>
                  <div className="h-1 bg-[#21262D] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${pct * 100}%`, background: row.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stacked + Variance + Income */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 fade-up fade-up-4">
        <div className="card">
          <div className="card-header"><span className="card-title">Portfolio by Type</span></div>
          <div className="p-4"><PortfolioStackedChart data={data.months} /></div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Variance</span></div>
          <div className="p-4"><VarianceChart data={data.months} /></div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Income</span></div>
          <div className="p-4"><IncomeChart data={data.months} /></div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="card fade-up fade-up-5">
        <div className="card-header"><span className="card-title">Monthly Summary Table</span></div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">SFR</th>
                <th className="text-right">MFR</th>
                <th className="text-right">A&D</th>
                <th className="text-right">Raw Land</th>
                <th className="text-right">Fin. Lots</th>
                <th className="text-right">LB</th>
                <th className="text-right">Total ALL</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Income</th>
                <th className="text-right">Yield</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m, i) => (
                <tr key={m.month}>
                  <td className="text-[#C9D1D9] font-medium">{m.label}</td>
                  <td className="num">{formatCurrency(m.sfr, true)}</td>
                  <td className="num">{formatCurrency(m.mfr, true)}</td>
                  <td className="num">{formatCurrency(m.and, true)}</td>
                  <td className="num">{formatCurrency(m.raw_land, true)}</td>
                  <td className="num">{formatCurrency(m.finished_lots, true)}</td>
                  <td className="num">{formatCurrency(m.land_bucket, true)}</td>
                  <td className="num font-medium text-[#E6EDF3]">{formatCurrency(m.total_all, true)}</td>
                  <td className={`num ${m.variance >= 0 ? 'positive' : 'negative'}`}>
                    {i === 0 ? '—' : formatVariance(m.variance)}
                  </td>
                  <td className="num text-[#D4A853]">{formatCurrency(m.total_income, true)}</td>
                  <td className="num">{formatPct(m.annualized_yield_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-6 w-48 bg-[#21262D] rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="card h-24 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="card h-64 xl:col-span-2 animate-pulse" />
        <div className="card h-64 animate-pulse" />
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-6 flex items-start gap-3 text-sm">
      <AlertCircle className="w-4 h-4 text-[#F85149] mt-0.5 shrink-0" />
      <div>
        <div className="text-[#F85149] font-medium">Failed to load dashboard</div>
        <div className="text-[#8B949E] mt-1">{message}</div>
        <button onClick={onRetry} className="btn-secondary mt-3">Retry</button>
      </div>
    </div>
  )
}
