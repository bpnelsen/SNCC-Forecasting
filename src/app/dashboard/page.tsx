'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StatCard } from '@/components/ui/StatCard'
import { TotalBalanceChart, PortfolioStackedChart, IncomeChart, VarianceChart } from '@/components/charts/PortfolioCharts'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency, formatPct, formatVariance } from '@/lib/utils'
import { RefreshCw, AlertCircle, Filter, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { ParentCompanyDropdown } from '@/components/ui/ParentCompanyDropdown'
import { UNASSIGNED_PARENT_KEY } from '@/lib/calculator'
import { HORIZON_OPTIONS, DEFAULT_HORIZON, parseHorizon, type Horizon } from '@/lib/horizon'
import {
  type FilterKey, type FilterChip, CHIPS, ALL_KEYS, applyFilter,
} from '@/lib/dashboard-filter'
import {
  activeOnBooks, forecastedAnd, forecastLayer, totalOutstandingLoans, totalOutstandingAll, monthBridge, portfolioBreakdown,
} from '@/lib/summary'

// Render the active version's as_of_date (YYYY-MM-DD from the engine) as
// "May 14, 2026". Parsed manually so timezone shifts can't bump it by a day.
function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [_, y, mo, d] = m
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const mi = Math.max(0, Math.min(11, Number(mo) - 1))
  return `${months[mi]} ${Number(d)}, ${y}`
}


const HORIZON_STORAGE_KEY = 'sncc.dashboard.horizon'

export default function DashboardPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [active, setActive]   = useState<Set<FilterKey>>(new Set(ALL_KEYS))
  // null = no parent filter (show all); a non-null Set selects specific
  // parent_company ids (plus UNASSIGNED_PARENT_KEY for the catch-all).
  const [selectedParents, setSelectedParents] = useState<Set<string> | null>(null)
  // Current Breakdown $/# toggle. $ = dollar amounts (the default,
  // matches every prior version); # = count of imported loans per
  // segment, respecting the parent + chip filters.
  const [breakdownMode, setBreakdownMode] = useState<'dollar' | 'count'>('dollar')

  // Projection horizon: the forecast is recomputed for exactly this many
  // months (?horizon=), so the Peak, the charts and the Monthly Summary cover
  // only the chosen span. Remembered per browser; storage can be unavailable
  // (private windows), in which case the default simply applies.
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON)
  const [horizonReady, setHorizonReady] = useState(false)
  // Each load gets an id; only the latest may write state, so quick clicks
  // through 6 → 24 can't leave an older, slower response on screen.
  const requestId = useRef(0)

  const load = async (h: Horizon = horizon) => {
    const id = ++requestId.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/calculate?horizon=${h}`, { cache: 'no-store' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const json = await res.json()
      if (id === requestId.current) setData(json)
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  // Read the remembered horizon after mount (the page is prerendered, so
  // reading storage during render would mismatch), then load with it.
  useEffect(() => {
    try {
      const stored = parseHorizon(window.localStorage.getItem(HORIZON_STORAGE_KEY))
      if (stored) setHorizon(stored)
    } catch { /* storage unavailable — keep the default */ }
    setHorizonReady(true)
  }, [])

  useEffect(() => {
    if (horizonReady) load(horizon)
    // load is recreated each render; horizon is what should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonReady, horizon])

  const chooseHorizon = (h: Horizon) => {
    if (h === horizon) return
    setHorizon(h)
    try { window.localStorage.setItem(HORIZON_STORAGE_KEY, String(h)) } catch { /* ignore */ }
  }

  const months = useMemo(
    () => data ? applyFilter(data.months, active, selectedParents) : [],
    [data, active, selectedParents],
  )

  if (loading && !data) return <LoadingState />
  if (error)   return <ErrorState message={error} onRetry={() => load(horizon)} />
  if (!data)   return null

  const current = months[0]
  // The headline tile is Total Outstanding (All), the same figure as that row
  // of the Monthly Summary, so its Peak is taken on the same basis.
  const peak    = months.reduce((a, b) => totalOutstandingAll(b) > totalOutstandingAll(a) ? b : a, months[0])
  const chipsFiltered  = active.size < CHIPS.length
  const parentsFiltered = selectedParents !== null
  const filtered = chipsFiltered || parentsFiltered

  // Active Loan (Outstanding) tile: disbursed balance across actual loans.
  // Land Bucket and HHH/JV aren't loans (LB = inventory, HHH/JV = joint-
  // venture project balances) so they're excluded categorically. Product-
  // type chips DO gate this tile — toggling SFR off drops SFR's disbursed
  // balance — and the parent multi-select still applies on top.
  const LOAN_SEGMENT_KEYS = ['sfr', 'mfr', 'and', 'raw_land', 'finished_lots'] as const
  const outstanding = LOAN_SEGMENT_KEYS.reduce((s, k) => {
    if (!active.has(k)) return s
    if (selectedParents === null) return s + data.active_loans_outstanding[k]
    const monthOne = data.months[0]
    let v = 0
    for (const pid of selectedParents) {
      const slot = monthOne.by_parent[pid]
      if (slot) v += slot[`outstanding_${k}` as const]
    }
    return s + v
  }, 0)

  // Active-loan count likewise reflects the parent filter. The product-type
  // chips don't (chips slice balances, not the loan count) — same as before.
  const totalActiveLoans = selectedParents === null
    ? data.total_active_loans
    : Array.from(selectedParents).reduce((s, pid) => s + (data.parent_loan_counts[pid] ?? 0), 0)

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
            {data.version_label} · {data.total_active_loans} active loans · As of {formatAsOf(data.as_of_date)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1.5" role="group" aria-label="Projection horizon">
            <span className="text-[10px] text-fg-dim">Project out</span>
            <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
              {HORIZON_OPTIONS.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => chooseHorizon(h)}
                  aria-pressed={h === horizon}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border-strong first:border-l-0
                    ${h === horizon ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg hover:bg-border'}`}
                >
                  {h} mo
                </button>
              ))}
            </div>
            {loading && <RefreshCw className="w-3 h-3 text-fg-dim animate-spin" aria-label="Updating" />}
          </div>
          <Link href="/ask" className="btn-ghost flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /><span>Ask</span>
          </Link>
          <button onClick={() => load(horizon)} className="btn-ghost flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /><span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Data-quality banner. Both conditions distort the numbers on this page
          without producing any error, so they are surfaced here rather than
          left to be discovered as an unexplained balance. */}
      {(data.unclassified_loan_count > 0 || data.no_maturity_loan_count > 0) && (
        <div className="card fade-up fade-up-1 p-3 border-danger-strong/40 bg-danger-strong/5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertCircle className="w-3.5 h-3.5" />
            Check this import
          </div>
          {data.unclassified_loan_count > 0 && (
            <div className="text-[11px] text-fg-dim">
              <strong className="text-fg">{data.unclassified_loan_count}</strong> of{' '}
              {data.total_active_loans} loans could not be classified from their Loan
              Program. Imported loans typed UNKNOWN contribute to{' '}
              <strong className="text-fg">no segment</strong>, so their balances are
              missing from the totals below. Set the type on the{' '}
              <Link href="/loans" className="text-accent underline">Loans</Link> tab, or
              update the rules in <code>classifyLoan</code>.
            </div>
          )}
          {data.no_maturity_loan_count > 0 && (
            <div className="text-[11px] text-fg-dim">
              <strong className="text-fg">{data.no_maturity_loan_count}</strong> of{' '}
              {data.total_active_loans} loans have no maturity date. Those balances are
              held flat for the whole horizon instead of paying off, so forecast
              balances trend high.
            </div>
          )}
        </div>
      )}

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
          <ParentCompanyDropdown
            parents={data.parent_companies ?? []}
            parentLoanCounts={data.parent_loan_counts ?? {}}
            selected={selectedParents}
            onChange={setSelectedParents}
          />
          <button onClick={setAll}  className="btn-ghost text-[10px]">All</button>
          <button onClick={setNone} className="btn-ghost text-[10px]">None</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 fade-up fade-up-2">
        <StatCard label={filtered ? 'Total Outstanding (filtered)' : 'Total Outstanding (All)'}
          value={formatCurrency(totalOutstandingAll(current), true)}
          delta={`Peak: ${formatCurrency(totalOutstandingAll(peak), true)} (${peak.label})`} accent />
        <StatCard label="Active Loans" value={formatCurrency(current.total_loans, true)}
          subLabel={`${totalActiveLoans} loans${parentsFiltered ? ' · parent-filtered' : ''}`} />
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
          {/* $125M Y-axis floor on the unfiltered view gives more depth to
              month-over-month movement; any active filter (product chips or
              parent) drops the floor back to 0 so smaller filtered totals
              still fit on the chart. */}
          <div className="p-4">
            <TotalBalanceChart data={months} yAxisFloor={filtered ? 0 : 125_000_000} />
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <span className="card-title">Current Breakdown</span>
            {/* $/# toggle. $ shows dollar balances (default); # shows
                count of imported loans per segment, summed across
                whichever parents are selected. Forecasted / HHH/JV /
                Land Bucket rows hide in # mode — they're not loans. */}
            <div className="inline-flex items-center gap-0.5 border border-border rounded-md p-0.5">
              <button
                onClick={() => setBreakdownMode('dollar')}
                className={`px-2 py-0.5 text-[10px] font-mono rounded
                            ${breakdownMode === 'dollar'
                              ? 'bg-accent text-accent-on'
                              : 'text-fg-dim hover:text-fg'}`}
                title="Dollar balances"
              >$</button>
              <button
                onClick={() => setBreakdownMode('count')}
                className={`px-2 py-0.5 text-[10px] font-mono rounded
                            ${breakdownMode === 'count'
                              ? 'bg-accent text-accent-on'
                              : 'text-fg-dim hover:text-fg'}`}
                title="Loan count"
              >#</button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {(() => {
              // Resolve the per-segment count once. With a parent filter
              // active, sum across the selected parents' slots.
              const segCount = (k: 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots') => {
                if (selectedParents === null) return data.active_loan_counts?.[k] ?? 0
                let sum = 0
                for (const pid of selectedParents) {
                  sum += data.active_loan_counts_by_parent?.[pid]?.[k] ?? 0
                }
                return sum
              }

              const dollarRows = [
                { label: 'SFR',            value: current.active_sfr,           color: '#58A6FF' },
                { label: 'MFR',            value: current.active_mfr,           color: '#D4A853' },
                { label: 'A&D',            value: current.active_and,           color: '#3FB950' },
                { label: 'Raw Land',       value: current.active_raw_land,      color: '#8B949E' },
                { label: 'Finished Lots',  value: current.active_finished_lots, color: '#A371F7' },
                { label: 'HHH/JV',         value: current.hhh,            color: '#F85149' },
                { label: 'Land Bucket',    value: current.land_bucket,    color: '#79C0FF' },
                { label: 'Forecasted SFR', value: current.forecasted_sfr, color: '#8B949E', forecast: true },
                { label: 'Forecasted MFR', value: current.forecasted_mfr, color: '#8B949E', forecast: true },
                { label: 'Forecasted A&D', value: current.forecasted_and + current.a_and_d_planned, color: '#8B949E', forecast: true },
              ]

              const countRows = [
                { label: 'SFR',           value: segCount('sfr'),           color: '#58A6FF' },
                { label: 'MFR',           value: segCount('mfr'),           color: '#D4A853' },
                { label: 'A&D',           value: segCount('and'),           color: '#3FB950' },
                { label: 'Raw Land',      value: segCount('raw_land'),      color: '#8B949E' },
                { label: 'Finished Lots', value: segCount('finished_lots'), color: '#A371F7' },
              ]

              const rows = breakdownMode === 'dollar' ? dollarRows : countRows
              const denom = breakdownMode === 'dollar'
                ? current.total_all
                : rows.reduce((s, r) => s + r.value, 0)

              return rows
                .filter(r => r.value > 0)
                .map(row => {
                  const pct = denom > 0 ? row.value / denom : 0
                  const fcst = 'forecast' in row && row.forecast
                  return (
                    <div key={row.label}
                         className={fcst ? 'bg-fg-dim/10 -mx-2 px-2 py-1.5 rounded-md' : ''}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                          <span className="text-fg-dim">{row.label}</span>
                        </div>
                        <span className="font-mono text-fg">
                          {breakdownMode === 'dollar'
                            ? formatCurrency(row.value, true)
                            : `${row.value}`}
                        </span>
                      </div>
                      <div className="h-1 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                             style={{ width: `${pct * 100}%`, background: row.color }} />
                      </div>
                    </div>
                  )
                })
            })()}
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

      {/* Reconciliation panel — verifies the month-0 column matches the
          dashboard tiles + Current Breakdown and surfaces any expected
          deltas with a one-line explanation. */}
      <ReconciliationPanel
        months={months}
        outstandingTile={outstanding}
        reconciliation={data.reconciliation}
        asOfDate={data.as_of_date}
        parentFiltered={parentsFiltered}
      />
    </div>
  )
}

interface ReconciliationPanelProps {
  months: MonthlyBalance[]
  outstandingTile: number
  reconciliation: ForecastResult['reconciliation']
  asOfDate: string | null | undefined
  // The month-over-month breakdown has no per-parent data.
  parentFiltered: boolean
}

// Diagnostic surface for "Truth 5" — shows each expected identity between
// the Monthly Summary Table's month-0 column and the tiles / Current
// Breakdown, with the delta and the structural reason when they differ.
const RECONCILIATION_OPEN_KEY = 'sncc.dashboard.reconciliationOpen'

function ReconciliationPanel({ months, outstandingTile, reconciliation, asOfDate, parentFiltered }: ReconciliationPanelProps) {
  // Collapsed by default; the choice is remembered per browser. Read after
  // mount (the page is prerendered) and storage failures keep the default.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (window.localStorage.getItem(RECONCILIATION_OPEN_KEY) === '1') setOpen(true) } catch { /* default */ }
  }, [])
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    try { window.localStorage.setItem(RECONCILIATION_OPEN_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }

  if (months.length === 0) return null
  const m0 = months[0]
  const fcstAnd0 = forecastedAnd(m0)
  const loansSum = totalOutstandingLoans(m0)
  const allSum = totalOutstandingAll(m0)

  // Active Loan (Outstanding) tile vs Σ active_<seg> at month 0. The only
  // residual delta is the FL basis (active uses max(disbursed,
  // current_loan_amount); tile uses disbursed). The forecast layer is in
  // loansSum but not in the tile.
  const activeOnly = activeOnBooks(m0)
  const tileVsActive = outstandingTile - activeOnly
  const expectedDelta = -reconciliation.fl_basis_delta
  const unexplained = tileVsActive - expectedDelta

  type Row = { name: string; ok: boolean; lhs?: number; rhs?: number; note: string }
  const fmt = (n: number) => formatCurrency(n, true)

  const rows: Row[] = [
    {
      // The comparison people actually make: the row in the Monthly Summary
      // against the tile at the top of the page. Their names are nearly
      // identical and the quantities are not, so state the decomposition
      // outright rather than leaving the gap to be puzzled over.
      name: 'Total Outstanding (Loans) − Active Loan (Outstanding) tile',
      ok: Math.abs(unexplained) < 1,
      lhs: loansSum,
      rhs: outstandingTile,
      note:
        `Expected gap ${fmt(loansSum - outstandingTile)} = forecast layer `
        + `${fmt(forecastLayer(m0))} `
        + `(Forecasted SFR ${fmt(m0.forecasted_sfr)} + MFR ${fmt(m0.forecasted_mfr)} + A&D ${fmt(fcstAnd0)})`
        + ` + FL basis Δ ${fmt(reconciliation.fl_basis_delta)}`
        + (Math.abs(unexplained) < 1
          ? '. The tile is imported loans at disbursed only — it carries no forecast.'
          : `. UNEXPLAINED ${fmt(unexplained)} — the gap is not fully accounted for.`),
    },
    {
      name: 'Total Outstanding (Loans) ≡ Σ visible loan rows',
      ok: true,
      lhs: loansSum,
      rhs: loansSum,
      note: 'Active SFR + MFR + A&D + Raw Land + Fin Lots + Forecasted SFR + MFR + A&D',
    },
    {
      name: 'Total Outstanding (All) ≡ Loans + HHH/JV + Land Bucket',
      ok: true,
      lhs: allSum,
      rhs: allSum,
      note: 'HHH/JV equity + Land Bucket inventory layered on top',
    },
    {
      name: 'Active Loan (Outstanding) tile ≡ Σ active_<seg> at month 0',
      ok: Math.abs(unexplained) < 1,
      lhs: outstandingTile,
      rhs: activeOnly,
      note: Math.abs(unexplained) < 1
        ? `Reconciles: tile − active = −FL basis Δ (${fmt(reconciliation.fl_basis_delta)}); matured loans are counted in both`
        : `Unexplained Δ of ${fmt(unexplained)} beyond FL basis (${fmt(reconciliation.fl_basis_delta)})`,
    },
  ]

  const fraction = reconciliation.month_zero_fraction
  const fracPct = (fraction * 100).toFixed(1)
  const anchor = reconciliation.proration_anchor
  // Proration treats everything up to today as funded and on the books. That
  // only holds if the loan report is current; YYYY-MM-DD compares by string.
  const reportLags = !!asOfDate && !!anchor && asOfDate.slice(0, 10) < anchor.slice(0, 10)
  // Everything the panel would flag, so the collapsed header still says
  // whether the numbers tie — a problem must not hide behind a closed panel.
  const issues =
    rows.filter(r => !r.ok).length +
    (reportLags ? 1 : 0) +
    (!parentFiltered && Math.abs(portfolioBreakdown(m0).other) >= 1 ? 1 : 0) +
    (!parentFiltered && months.length > 1 && Math.abs(monthBridge(months[0], months[1]).other) >= 1 ? 1 : 0)

  return (
    <div className="card fade-up fade-up-5">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="w-full card-header flex items-center justify-between hover:bg-border/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-fg-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-fg-dim" />}
          <span className="card-title">Reconciliation · month 0</span>
          {issues === 0
            ? <span className="text-[10px] text-success-bright">✓ all reconcile</span>
            : <span className="text-[10px] text-danger font-medium">✗ {issues} to check</span>}
        </span>
        <span className="text-[10px] text-fg-dim">
          {fracPct}% of {m0.label} still ahead
        </span>
      </button>
      {open && (
      <div className="p-4 space-y-2 text-[11px]">
        {rows.map(r => (
          <div key={r.name} className="grid grid-cols-12 gap-2 items-baseline">
            <div className="col-span-1 text-center">
              {r.ok ? <span className="text-success-bright">✓</span> : <span className="text-danger">✗</span>}
            </div>
            <div className="col-span-5 text-fg">{r.name}</div>
            <div className="col-span-3 text-right font-mono text-fg-dim">
              {r.lhs != null && r.rhs != null
                ? `${fmt(r.lhs)} = ${fmt(r.rhs)}`
                : ''}
            </div>
            <div className="col-span-3 text-[10px] text-fg-dim italic">{r.note}</div>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-border text-[10px] text-fg-dim italic">
          <strong>This month&rsquo;s anticipated originations:</strong> as of {formatAsOf(anchor)}, {fracPct}% of
          {' '}{m0.label} is still ahead, so the forecast carries {fracPct}% of every SFR, MFR and A&amp;D
          cohort and A&amp;D tab loan starting this month — in this month and every month after. The rest has
          funded and is in the loan report, so carrying it again would count it twice. Loans starting before
          this month are carried at 0% for the same reason.
        </div>
        {reportLags && (
          <div className="pt-2 text-[10px] text-danger">
            <strong>The loan report is as of {formatAsOf(asOfDate)}</strong>, earlier than today
            ({formatAsOf(anchor)}). Anything that funded in between counts as received here, but isn&rsquo;t
            in the report yet — so it&rsquo;s in neither the actuals nor the forecast. Import a current report
            to bring it in.
          </div>
        )}
        <PortfolioBreakdown m={m0} parentFiltered={parentFiltered} />
        {months.length > 1 && <MonthBridge prev={months[0]} curr={months[1]} parentFiltered={parentFiltered} />}
      </div>
      )}
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

// What Total Portfolio (All) is made of, against Total Outstanding (All). It
// is no longer a tile, but is still the engine's total_all. It values existing loans at their full loan amount and includes Land
// Bucket lot-sale verticals; Outstanding values them at their drawn balance
// and leaves those out. The parts sum to it exactly.
function PortfolioBreakdown({ m, parentFiltered }: { m: MonthlyBalance; parentFiltered: boolean }) {
  const fmt = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatCurrency(Math.abs(n), true)}`
  if (parentFiltered) {
    return (
      <div className="pt-3 mt-3 border-t border-border text-[10px] text-fg-dim italic">
        The Total Portfolio breakdown covers the whole book only — set Parent to All to see it.
      </div>
    )
  }
  const b = portfolioBreakdown(m)
  const lines: { label: string; value: number; note?: string; base?: boolean }[] = [
    { label: 'Total Outstanding (All)', value: b.outstandingAll, base: true,
      note: 'Drawn balances: loans, forecast, HHH/JV, Land Bucket' },
    { label: 'Undrawn commitment on existing loans', value: b.undrawn,
      note: 'Total Portfolio counts each loan at its full loan amount, not what is drawn' },
    { label: 'Loans past maturity', value: b.pastMaturity,
      note: 'Total Portfolio drops them this month; the Active rows still carry them' },
    { label: 'Land Bucket lot-sale loans', value: b.extraForecast,
      note: 'Vertical loans spawned by lot sales — in Total Portfolio, not in Outstanding' },
  ]
  if (Math.abs(b.other) >= 1) lines.push({ label: 'Other (unexplained)', value: b.other })
  return (
    <div className="pt-3 mt-3 border-t border-border">
      <div className="text-fg font-medium mb-1.5">
        Where Total Portfolio (All) comes from, {m.label}:{' '}
        <span className="font-mono">{formatCurrency(b.total, true)}</span>
      </div>
      <div className="space-y-0.5">
        {lines.map(l => (
          <div key={l.label} className="grid grid-cols-12 gap-2 items-baseline">
            <div className={`col-span-5 ${l.base ? 'text-fg font-medium' : 'text-fg'}`}>{l.label}</div>
            <div className="col-span-2 text-right font-mono text-fg">
              {l.base ? formatCurrency(l.value, true) : Math.abs(l.value) < 1 ? '—' : fmt(l.value)}
            </div>
            <div className="col-span-5 text-[10px] text-fg-dim italic">{l.note ?? ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Why Total Outstanding (Loans) moves from the first forecast month to the
// second, by cause. That step is the one with a structural cliff: loans
// already past maturity stay on the books in month 0 (so the rows tie the
// tile) and all drop out in month 1. The parts sum to the change exactly; any
// remainder is shown as "Other" rather than folded in.
function MonthBridge({ prev, curr, parentFiltered }: {
  prev: MonthlyBalance
  curr: MonthlyBalance
  parentFiltered: boolean
}) {
  // Sign first, as accountants write it: −$25.7M, not $-25.7M.
  const fmt = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatCurrency(Math.abs(n), true)}`
  if (parentFiltered) {
    return (
      <div className="pt-3 mt-3 border-t border-border text-[10px] text-fg-dim italic">
        The {prev.label} → {curr.label} breakdown covers the whole book only — set Parent to All to see it.
      </div>
    )
  }
  const b = monthBridge(prev, curr)
  const lines: { label: string; value: number; note?: string }[] = [
    { label: `Loans already past maturity before ${prev.label}`, value: b.pastMaturity,
      note: `On the books in ${prev.label}, assumed paid off in ${curr.label} — all at once` },
    { label: `Loans maturing in ${prev.label}`, value: b.maturing },
    { label: 'Existing loans drawing up', value: b.draws, note: 'Along each program’s draw curve, toward its maximum' },
    { label: 'Finished Lots paydown', value: b.paydown, note: 'Lot releases on existing finished-lots loans' },
    { label: 'Forecasted SFR', value: b.forecastedSfr, note: 'New cohorts and draws, less cohorts reaching term' },
    { label: 'Forecasted MFR', value: b.forecastedMfr },
    { label: 'Forecasted A&D', value: b.forecastedAnd, note: 'A&D cohorts and A&D tab loans: draws less releases' },
  ]
  if (Math.abs(b.other) >= 1) lines.push({ label: 'Other (unexplained)', value: b.other })

  return (
    <div className="pt-3 mt-3 border-t border-border">
      <div className="text-fg font-medium mb-1.5">
        Why Total Outstanding (Loans) changes {prev.label} → {curr.label}:{' '}
        <span className="font-mono">{fmt(b.total)}</span>
        <span className="text-fg-dim font-normal">
          {' '}({formatCurrency(totalOutstandingLoans(prev), true)} → {formatCurrency(totalOutstandingLoans(curr), true)})
        </span>
      </div>
      <div className="space-y-0.5">
        {lines.map(l => (
          <div key={l.label} className="grid grid-cols-12 gap-2 items-baseline">
            <div className="col-span-5 text-fg">{l.label}</div>
            <div className={`col-span-2 text-right font-mono ${l.value < 0 ? 'text-danger' : l.value > 0 ? 'text-success-bright' : 'text-fg-dim'}`}>
              {Math.abs(l.value) < 1 ? '—' : fmt(l.value)}
            </div>
            <div className="col-span-5 text-[10px] text-fg-dim italic">{l.note ?? ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryTable({ months }: { months: MonthlyBalance[] }) {
  // Per-segment rows: active = imported loan drawn balance only (no cohorts).
  // Forecasted rows: scheduled new-origination cohort drawn balance.
  // Total Outstanding (Loans) = sum of every loan row above (active + the
  // three Forecasted rows). LB-driven verticals and HHH/JV are deliberately
  // excluded — LB is its own row, HHH/JV is sourced from the manual tab.
  // Forecasted A&D = scheduled A&D cohorts + planned A&D loans (/a-and-d tab).
  const rows: SummaryRow[] = [
    { label: 'SFR',             values: months.map(m => m.active_sfr),             kind: 'currency' },
    { label: 'MFR',             values: months.map(m => m.active_mfr),             kind: 'currency' },
    { label: 'A&D',             values: months.map(m => m.active_and),             kind: 'currency' },
    { label: 'Raw Land',        values: months.map(m => m.active_raw_land),        kind: 'currency' },
    { label: 'Fin. Lots',       values: months.map(m => m.active_finished_lots),   kind: 'currency' },
    { label: 'Forecasted SFR',  values: months.map(m => m.forecasted_sfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Forecasted MFR',  values: months.map(m => m.forecasted_mfr),         kind: 'currency', emphasis: 'forecast' },
    // Forecasted A&D = scheduled A&D cohorts (drawn) + planned A&D loans'
    // contribution from /a-and-d this month. Both are prorated by today like
    // SFR and MFR; see lotOriginationBalance in calculator.ts.
    { label: 'Forecasted A&D',  values: months.map(forecastedAnd),                       kind: 'currency', emphasis: 'forecast' },
    // HHH/JV is an equity investment, not a loan. Sourced from the manual
    // /hhh-jv tab. Excluded from Total Outstanding (Loans); included in
    // Total Outstanding (All).
    { label: 'HHH/JV',          values: months.map(m => m.hhh),                    kind: 'currency' },
    { label: 'Land Bucket',     values: months.map(m => m.land_bucket),            kind: 'currency' },
    { label: 'Total Outstanding (Loans)', values: months.map(totalOutstandingLoans),                                        kind: 'currency', emphasis: 'total' },
    { label: 'Total Outstanding (All)',   values: months.map(totalOutstandingAll),        kind: 'currency', emphasis: 'total' },
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
