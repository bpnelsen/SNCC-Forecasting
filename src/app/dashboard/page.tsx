'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StatCard } from '@/components/ui/StatCard'
import { TotalBalanceChart, PortfolioStackedChart, IncomeChart, VarianceChart } from '@/components/charts/PortfolioCharts'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency, formatPct, formatVariance } from '@/lib/utils'
import { RefreshCw, AlertCircle, Filter, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { ParentCompanyDropdown } from '@/components/ui/ParentCompanyDropdown'
import { UNASSIGNED_PARENT_KEY } from '@/lib/calculator'

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

// Slice a single segment by the active chip + selected parents. When the
// parent filter is on, both the existing (imported by borrower→parent) and
// the builder-attributed (forecasted cohorts + HHH/JV + A&D planned)
// portions come from m.by_parent so every contribution honors the same
// selection. The non-filtered branch reads m.<seg> / m.outstanding_<seg>
// directly — those already fold in HHH/JV and A&D planned at the engine
// level, so leaving them as-is keeps unfiltered numbers identical.
type SegKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh'
function sliceSegment(
  m: MonthlyBalance,
  seg: SegKey,
  selectedParents: Set<string> | null,
): { existing: number; forecasted: number; outstanding: number; active: number; a_and_d_planned: number } {
  // hhh has no engine-exposed active_<seg> (no imported HHH loans post
  // migration 017); active stays 0 for the hhh slot.
  // a_and_d_planned is only meaningful on seg === 'and' — 0 elsewhere.
  if (selectedParents === null) {
    const fcst = m[`forecasted_${seg}` as const]
    const active = seg === 'hhh' ? 0 : m[`active_${seg}` as const]
    return {
      existing:    m[seg] - fcst,
      forecasted:  fcst,
      outstanding: m[`outstanding_${seg}` as const],
      active,
      a_and_d_planned: seg === 'and' ? m.a_and_d_planned : 0,
    }
  }
  let existing = 0, forecasted = 0, outstanding = 0, active = 0, a_and_d_planned = 0
  for (const pid of selectedParents) {
    const slot = m.by_parent[pid]
    if (!slot) continue
    existing    += slot[seg]
    forecasted  += slot[`forecasted_${seg}` as const]
    outstanding += slot[`outstanding_${seg}` as const]
    if (seg !== 'hhh') active += slot[`active_${seg}` as const]
    // hhh segment also carries HHH/JV project balances; the engine adds these
    // into m.<seg> and m.outstanding_<seg> globally — the per-parent slice
    // has to do the same so totals are consistent across filter states.
    if (seg === 'hhh') forecasted += slot.hhh_jv_balance
    // a_and_d_planned is returned as its own slot now (no longer folded into
    // `forecasted`) so the Monthly Summary's Forecasted A&D row can show
    // (scheduled A&D cohorts) + (planned A&D) cleanly without double-count.
    if (seg === 'and') a_and_d_planned += slot.a_and_d_planned
  }
  return { existing, forecasted, outstanding, active, a_and_d_planned }
}

// Land Bucket honors the same parent selection now that builders carry a
// parent_company_id (migration 013).
function sliceLandBucket(m: MonthlyBalance, selectedParents: Set<string> | null): number {
  if (selectedParents === null) return m.land_bucket
  let total = 0
  for (const pid of selectedParents) total += m.by_parent[pid]?.land_bucket ?? 0
  return total
}

// Zero out segments not in `active`, then recompute total_loans, total_all,
// and variance month-over-month. When `selectedParents` is non-null both
// existing AND builder-attributed portions of each segment come from the
// per-parent aggregates so Land Bucket + forecasted + HHH/JV + A&D planned
// all honor the parent filter.
function applyFilter(
  months: MonthlyBalance[],
  active: Set<FilterKey>,
  selectedParents: Set<string> | null,
): MonthlyBalance[] {
  let prev = 0
  return months.map((m, i) => {
    const slice = (seg: SegKey, chip: FilterKey) => {
      if (!active.has(chip)) return { combined: 0, fcst: 0, outstanding: 0, active: 0, a_and_d_planned: 0 }
      const { existing, forecasted, outstanding, active: act, a_and_d_planned } = sliceSegment(m, seg, selectedParents)
      // combined still includes planned A&D so the segment total stays
      // consistent with the engine's m.and (which folds in aAndDPlanned).
      // forecasted_and stays scheduled-only — Forecasted A&D row on the
      // Monthly Summary adds the two cleanly.
      return { combined: existing + forecasted + a_and_d_planned, fcst: forecasted, outstanding, active: act, a_and_d_planned }
    }

    const sSfr = slice('sfr',           'sfr')
    const sMfr = slice('mfr',           'mfr')
    const sAnd = slice('and',           'and')
    const sRaw = slice('raw_land',      'raw_land')
    const sFin = slice('finished_lots', 'finished_lots')
    const sHhh = slice('hhh',           'hhh')
    const lb   = active.has('land_bucket') ? sliceLandBucket(m, selectedParents) : 0

    const filtered: MonthlyBalance = {
      ...m,
      sfr:           sSfr.combined,
      mfr:           sMfr.combined,
      and:           sAnd.combined,
      raw_land:      sRaw.combined,
      finished_lots: sFin.combined,
      hhh:           sHhh.combined,
      land_bucket:   lb,
      forecasted_sfr: sSfr.fcst,
      forecasted_mfr: sMfr.fcst,
      outstanding_sfr:           sSfr.outstanding,
      outstanding_mfr:           sMfr.outstanding,
      outstanding_and:           sAnd.outstanding,
      outstanding_raw_land:      sRaw.outstanding,
      outstanding_finished_lots: sFin.outstanding,
      outstanding_hhh:           sHhh.outstanding,
      active_sfr:           sSfr.active,
      active_mfr:           sMfr.active,
      active_and:           sAnd.active,
      active_raw_land:      sRaw.active,
      active_finished_lots: sFin.active,
      // Propagate the per-parent planned A&D contribution onto the filtered
      // MonthlyBalance so the Forecasted A&D row reads it directly.
      a_and_d_planned:      sAnd.a_and_d_planned,
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
  // null = no parent filter (show all); a non-null Set selects specific
  // parent_company ids (plus UNASSIGNED_PARENT_KEY for the catch-all).
  const [selectedParents, setSelectedParents] = useState<Set<string> | null>(null)
  // Current Breakdown $/# toggle. $ = dollar amounts (the default,
  // matches every prior version); # = count of imported loans per
  // segment, respecting the parent + chip filters.
  const [breakdownMode, setBreakdownMode] = useState<'dollar' | 'count'>('dollar')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/calculate', { cache: 'no-store' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const months = useMemo(
    () => data ? applyFilter(data.months, active, selectedParents) : [],
    [data, active, selectedParents],
  )

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} onRetry={load} />
  if (!data)   return null

  const current = months[0]
  const peak    = months.reduce((a, b) => b.total_all > a.total_all ? b : a, months[0])
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
        <div className="flex items-center gap-2">
          <Link href="/ask" className="btn-ghost flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /><span>Ask</span>
          </Link>
          <button onClick={load} className="btn-ghost flex items-center gap-1.5">
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
        <StatCard label={filtered ? 'Total Portfolio (filtered)' : 'Total Portfolio (All)'}
          value={formatCurrency(current.total_all, true)}
          delta={`Peak: ${formatCurrency(peak.total_all, true)} (${peak.label})`} accent />
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
      />
    </div>
  )
}

interface ReconciliationPanelProps {
  months: MonthlyBalance[]
  outstandingTile: number
  reconciliation: ForecastResult['reconciliation']
}

// Diagnostic surface for "Truth 5" — shows each expected identity between
// the Monthly Summary Table's month-0 column and the tiles / Current
// Breakdown, with the delta and the structural reason when they differ.
function ReconciliationPanel({ months, outstandingTile, reconciliation }: ReconciliationPanelProps) {
  if (months.length === 0) return null
  const m0 = months[0]
  const fcstAnd0 = m0.forecasted_and + m0.a_and_d_planned
  const loansSum =
    m0.active_sfr + m0.active_mfr + m0.active_and +
    m0.active_raw_land + m0.active_finished_lots +
    m0.forecasted_sfr + m0.forecasted_mfr + fcstAnd0
  const allSum = loansSum + m0.hhh + m0.land_bucket

  // Active Loan (Outstanding) tile vs Σ active_<seg> at month 0. After the
  // "matured loans stay on the books" change, the only residual delta is
  // the FL basis (active uses max(disbursed, current_loan_amount); tile
  // uses disbursed). The forecasted SFR/MFR/A&D cohort balance is in
  // loansSum but not in the tile, hence the subtractions below.
  const activeOnly = loansSum - m0.forecasted_sfr - m0.forecasted_mfr - fcstAnd0
  const tileVsActive = outstandingTile - activeOnly
  const expectedDelta = -reconciliation.fl_basis_delta
  const unexplained = tileVsActive - expectedDelta

  type Row = { name: string; ok: boolean; lhs?: number; rhs?: number; note: string }
  const fmt = (n: number) => formatCurrency(n, true)

  const rows: Row[] = [
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

  return (
    <div className="card fade-up fade-up-5">
      <div className="card-header">
        <span className="card-title">Reconciliation · month 0</span>
        <span className="text-[10px] text-fg-dim">
          import covers {fracPct}% of {m0.label} ahead
        </span>
      </div>
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
          <strong>Forecasted SFR / MFR proration:</strong> {fracPct}% of the current month is ahead of the import date,
          so month-0 SF/MF scheduled cohorts contribute (1st-month draw × {fracPct}%) instead of the full first-month draw.
          Subsequent months use the full draw curve. (Truth 4)
        </div>
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
  // Per-segment rows: active = imported loan drawn balance only (no cohorts).
  // Forecasted rows: scheduled new-origination cohort drawn balance.
  // Total Outstanding (Loans) = sum of every loan row above (active + the
  // three Forecasted rows). LB-driven verticals and HHH/JV are deliberately
  // excluded — LB is its own row, HHH/JV is sourced from the manual tab.
  // Forecasted A&D = scheduled A&D cohorts + planned A&D loans (/a-and-d tab).
  const fcstAnd = (m: MonthlyBalance) => m.forecasted_and + m.a_and_d_planned
  const outLoans = (m: MonthlyBalance) =>
    m.active_sfr + m.active_mfr + m.active_and +
    m.active_raw_land + m.active_finished_lots +
    m.forecasted_sfr + m.forecasted_mfr + fcstAnd(m)

  const rows: SummaryRow[] = [
    { label: 'SFR',             values: months.map(m => m.active_sfr),             kind: 'currency' },
    { label: 'MFR',             values: months.map(m => m.active_mfr),             kind: 'currency' },
    { label: 'A&D',             values: months.map(m => m.active_and),             kind: 'currency' },
    { label: 'Raw Land',        values: months.map(m => m.active_raw_land),        kind: 'currency' },
    { label: 'Fin. Lots',       values: months.map(m => m.active_finished_lots),   kind: 'currency' },
    { label: 'Forecasted SFR',  values: months.map(m => m.forecasted_sfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Forecasted MFR',  values: months.map(m => m.forecasted_mfr),         kind: 'currency', emphasis: 'forecast' },
    // Forecasted A&D = scheduled A&D cohorts (drawn) + planned A&D loans'
    // contribution from /a-and-d this month. No Truth-4 month-0 proration
    // (that rule is SFR/MFR only).
    { label: 'Forecasted A&D',  values: months.map(fcstAnd),                       kind: 'currency', emphasis: 'forecast' },
    // HHH/JV is an equity investment, not a loan. Sourced from the manual
    // /hhh-jv tab. Excluded from Total Outstanding (Loans); included in
    // Total Outstanding (All) and Total (All).
    { label: 'HHH/JV',          values: months.map(m => m.hhh),                    kind: 'currency' },
    { label: 'Land Bucket',     values: months.map(m => m.land_bucket),            kind: 'currency' },
    { label: 'Total Outstanding (Loans)', values: months.map(outLoans),                                        kind: 'currency', emphasis: 'total' },
    { label: 'Total Outstanding (All)',   values: months.map(m => outLoans(m) + m.hhh + m.land_bucket),        kind: 'currency', emphasis: 'total' },
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
