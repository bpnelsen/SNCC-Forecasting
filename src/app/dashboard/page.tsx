'use client'

import { useEffect, useMemo, useState } from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { TotalBalanceChart, PortfolioStackedChart, IncomeChart, VarianceChart } from '@/components/charts/PortfolioCharts'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency, formatPct, formatVariance } from '@/lib/utils'
import { RefreshCw, AlertCircle, Filter } from 'lucide-react'

// The set of toggleable product/category buckets shown in the dashboard.
// Land Bucket isn't a "product type" per se but it sits next to the loan
// segments in every chart, so it lives in the same filter strip.
type FilterKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh' | 'land_bucket'

interface FilterChip {
  key: FilterKey
  label: string
  color: string
}

const CHIPS: FilterChip[] = [
  { key: 'sfr',           label: 'SFR',           color: '#58A6FF' },
  { key: 'mfr',           label: 'MFR',           color: '#D4A853' },
  { key: 'and',           label: 'A&D',           color: '#3FB950' },
  { key: 'raw_land',      label: 'Raw Land',      color: '#8B949E' },
  { key: 'finished_lots', label: 'Finished Lots', color: '#A371F7' },
  { key: 'hhh',           label: 'HHH/JV',        color: '#F85149' },
  { key: 'land_bucket',   label: 'Land Bucket',   color: '#79C0FF' },
]

const ALL_KEYS = new Set<FilterKey>(CHIPS.map(c => c.key))

// Zero out segments not in `active`, then recompute total_loans, total_all,
// and variance month-over-month from the filtered values. The calculator's
// other per-month fields (income, yields) are kept as-is — filtering is a
// presentation-layer slice of balances, not a re-run of the engine.
function applyFilter(months: MonthlyBalance[], active: Set<FilterKey>): MonthlyBalance[] {
  let prev = 0
  return months.map((m, i) => {
    const filtered: MonthlyBalance = {
      ...m,
      sfr:           active.has('sfr')           ? m.sfr           : 0,
      mfr:           active.has('mfr')           ? m.mfr           : 0,
      and:           active.has('and')           ? m.and           : 0,
      raw_land:      active.has('raw_land')      ? m.raw_land      : 0,
      finished_lots: active.has('finished_lots') ? m.finished_lots : 0,
      hhh:           active.has('hhh')           ? m.hhh           : 0,
      land_bucket:   active.has('land_bucket')   ? m.land_bucket   : 0,
      // Forecasted (new-origination) portion follows its parent segment's
      // chip so the split Forecasted rows zero out alongside SFR / MFR.
      forecasted_sfr: active.has('sfr') ? m.forecasted_sfr : 0,
      forecasted_mfr: active.has('mfr') ? m.forecasted_mfr : 0,
      total_loans: 0,
      total_all:   0,
      variance:    0,
    }
    filtered.total_loans =
      filtered.sfr + filtered.mfr + filtered.and +
      filtered.raw_land + filtered.finished_lots + filtered.hhh
    filtered.total_all = filtered.total_loans + filtered.land_bucket
    filtered.variance = i === 0 ? 0 : filtered.total_all - prev
    prev = filtered.total_all
    return filtered
  })
}

export default function DashboardPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [active, setActive]   = useState<Set<FilterKey>>(new Set(ALL_KEYS))

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

  const months = useMemo(
    () => data ? applyFilter(data.months, active) : [],
    [data, active],
  )

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} onRetry={load} />
  if (!data)   return null

  const current = months[0]
  const peak    = months.reduce((a, b) => b.total_all > a.total_all ? b : a, months[0])
  const filtered = active.size < CHIPS.length

  // Outstanding (disbursed) respects the product-type chips. Land Bucket
  // isn't a loan type so it never contributes here.
  const outstanding = (['sfr', 'mfr', 'and', 'raw_land', 'finished_lots', 'hhh'] as const)
    .reduce((s, k) => active.has(k) ? s + data.active_loans_outstanding[k] : s, 0)

  const toggle = (key: FilterKey) => {
    const next = new Set(active)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setActive(next)
  }
  const setAll  = () => setActive(new Set(ALL_KEYS))
  const setNone = () => setActive(new Set())

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-fg-strong">Portfolio Dashboard</h1>
          <p className="text-xs text-fg-dim mt-0.5">
            {data.version_label} · {data.total_active_loans} active loans · As of {data.as_of_date}
          </p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /><span>Refresh</span>
        </button>
      </div>

      {/* Filter strip */}
      <div className="card fade-up fade-up-1 p-3 flex items-center gap-2 flex-wrap">
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
          <button onClick={setAll}  className="btn-ghost text-[10px]">All</button>
          <button onClick={setNone} className="btn-ghost text-[10px]">None</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 fade-up fade-up-2">
        <StatCard label={filtered ? 'Total Portfolio (filtered)' : 'Total Portfolio (All)'}
          value={formatCurrency(current.total_all, true)}
          delta={`Peak: ${formatCurrency(peak.total_all, true)} (${peak.label})`} accent />
        <StatCard label="Active Loans" value={formatCurrency(current.total_loans, true)}
          subLabel={`${data.total_active_loans} loans`} />
        <StatCard label="Active Loan (Outstanding)"
          value={formatCurrency(outstanding, true)}
          subLabel={filtered ? 'disbursed · filtered' : 'disbursed to date'} />
        <StatCard label="Land Bucket" value={formatCurrency(current.land_bucket, true)}
          delta={formatVariance(current.land_bucket - (months[1]?.land_bucket || 0))} />
        <StatCard label="Monthly Income" value={formatCurrency(current.total_income, true)}
          delta={formatPct(current.annualized_yield_pct)} subLabel="annualized yield"
          deltaPositive={current.annualized_yield_pct > 0.08} />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 fade-up fade-up-3">
        <div className="card xl:col-span-2">
          <div className="card-header">
            <span className="card-title">Total Portfolio Balance</span>
            <span className="text-[10px] text-fg-dim font-mono">
              {months[0]?.label} → {months[months.length - 1]?.label}
            </span>
          </div>
          <div className="p-4"><TotalBalanceChart data={months} /></div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Current Breakdown</span></div>
          <div className="p-4 space-y-2">
            {[
              // Base SFR / MFR are existing loans only; the forecasted
              // portion is broken out into its own banded rows below so the
              // slices don't overlap (Total still includes both).
              { label: 'SFR',            value: current.sfr - current.forecasted_sfr, color: '#58A6FF' },
              { label: 'MFR',            value: current.mfr - current.forecasted_mfr, color: '#D4A853' },
              { label: 'A&D',            value: current.and,            color: '#3FB950' },
              { label: 'Raw Land',       value: current.raw_land,       color: '#8B949E' },
              { label: 'Finished Lots',  value: current.finished_lots,  color: '#A371F7' },
              { label: 'HHH/JV',         value: current.hhh,            color: '#F85149' },
              { label: 'Land Bucket',    value: current.land_bucket,    color: '#79C0FF' },
              { label: 'Forecasted SFR', value: current.forecasted_sfr, color: '#8B949E', forecast: true },
              { label: 'Forecasted MFR', value: current.forecasted_mfr, color: '#8B949E', forecast: true },
            ].filter(r => r.value > 0).map(row => {
              const pct = current.total_all > 0 ? row.value / current.total_all : 0
              return (
                <div key={row.label}
                     className={row.forecast ? 'bg-fg-dim/10 -mx-2 px-2 py-1.5 rounded-md' : ''}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                      <span className="text-fg-dim">{row.label}</span>
                    </div>
                    <span className="font-mono text-fg">{formatCurrency(row.value, true)}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
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
          <div className="p-4"><PortfolioStackedChart data={months} /></div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Variance</span></div>
          <div className="p-4"><VarianceChart data={months} /></div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Income</span></div>
          <div className="p-4"><IncomeChart data={months} /></div>
        </div>
      </div>

      {/* Summary Table — months across, product types / metrics down */}
      <div className="card fade-up fade-up-5">
        <div className="card-header"><span className="card-title">Monthly Summary Table</span></div>
        <SummaryTable months={months} />
      </div>
    </div>
  )
}

interface SummaryRow {
  label: string
  values: number[]
  // 'currency' = $ formatted; 'pct' = percentage; 'variance' = signed $, blank in column 0
  kind: 'currency' | 'pct' | 'variance'
  // total = bold/strong fg; accent = accent color; forecast = neutral band
  emphasis?: 'total' | 'accent' | 'forecast'
}

function SummaryTable({ months }: { months: MonthlyBalance[] }) {
  const rows: SummaryRow[] = [
    { label: 'SFR',             values: months.map(m => m.sfr - m.forecasted_sfr), kind: 'currency' },
    { label: 'MFR',             values: months.map(m => m.mfr - m.forecasted_mfr), kind: 'currency' },
    { label: 'A&D',             values: months.map(m => m.and),                    kind: 'currency' },
    { label: 'Raw Land',        values: months.map(m => m.raw_land),               kind: 'currency' },
    { label: 'Fin. Lots',       values: months.map(m => m.finished_lots),          kind: 'currency' },
    { label: 'Forecasted SFR',  values: months.map(m => m.forecasted_sfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Forecasted MFR',  values: months.map(m => m.forecasted_mfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Land Bucket',     values: months.map(m => m.land_bucket),            kind: 'currency' },
    { label: 'Total (All)',     values: months.map(m => m.total_all),              kind: 'currency', emphasis: 'total' },
    { label: 'Variance',      values: months.map(m => m.variance),                kind: 'variance' },
    { label: 'Income',        values: months.map(m => m.total_income),            kind: 'currency', emphasis: 'accent' },
    { label: 'Ann. Yield',    values: months.map(m => m.annualized_yield_pct),    kind: 'pct' },
  ]

  const renderCell = (row: SummaryRow, v: number, monthIdx: number) => {
    if (row.kind === 'variance') {
      if (monthIdx === 0) return <span className="text-fg-dim">—</span>
      const cls = v >= 0 ? 'text-success-light' : 'text-danger'
      return <span className={cls}>{formatVariance(v)}</span>
    }
    if (row.kind === 'pct') return formatPct(v)
    return formatCurrency(v, true)
  }

  const rowEmphasis = (row: SummaryRow) => {
    if (row.emphasis === 'total')    return 'font-medium text-fg-strong bg-border/30'
    if (row.emphasis === 'accent')   return 'text-accent'
    if (row.emphasis === 'forecast') return 'bg-fg-dim/10 text-fg'
    return ''
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface">Type / Metric</th>
            {months.map(m => (
              <th key={m.month} className="text-right">{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className={rowEmphasis(row)}>
              <td className={`sticky left-0 z-10 bg-surface font-medium text-fg ${rowEmphasis(row)}`}>
                {row.label}
              </td>
              {row.values.map((v, i) => (
                <td key={i} className="num">{renderCell(row, v, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-6 w-48 bg-border rounded animate-pulse" />
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
      <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
      <div>
        <div className="text-danger font-medium">Failed to load dashboard</div>
        <div className="text-fg-dim mt-1">{message}</div>
        <button onClick={onRetry} className="btn-secondary mt-3">Retry</button>
      </div>
    </div>
  )
}
