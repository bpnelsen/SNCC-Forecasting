'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StatCard } from '@/components/ui/StatCard'
import { TotalBalanceChart, PortfolioStackedChart, IncomeChart, VarianceChart } from '@/components/charts/PortfolioCharts'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency, formatPct, formatVariance } from '@/lib/utils'
import { RefreshCw, AlertCircle, Filter, Building2, Check, ChevronDown } from 'lucide-react'

// Key the engine uses for loans whose borrower doesn't match any parent
// company (no explicit override and no pattern hit). Kept in sync with
// UNASSIGNED_PARENT_KEY in src/lib/calculator.ts.
const UNASSIGNED_PARENT_KEY = '__none__'

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
// the forecasted (builder→parent) portions come from m.by_parent so every
// builder-attributed contribution honors the same selection.
type SegKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh'
function sliceSegment(
  m: MonthlyBalance,
  seg: SegKey,
  selectedParents: Set<string> | null,
): { existing: number; forecasted: number; outstanding: number } {
  if (selectedParents === null) {
    const fcst = m[`forecasted_${seg}` as const]
    return {
      existing:    m[seg] - fcst,
      forecasted:  fcst,
      outstanding: m[`outstanding_${seg}` as const],
    }
  }
  let existing = 0, forecasted = 0, outstanding = 0
  for (const pid of selectedParents) {
    const slot = m.by_parent[pid]
    if (!slot) continue
    existing    += slot[seg]
    forecasted  += slot[`forecasted_${seg}` as const]
    outstanding += slot[`outstanding_${seg}` as const]
  }
  return { existing, forecasted, outstanding }
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
      if (!active.has(chip)) return { combined: 0, fcst: 0, outstanding: 0 }
      const { existing, forecasted, outstanding } = sliceSegment(m, seg, selectedParents)
      return { combined: existing + forecasted, fcst: forecasted, outstanding }
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

  // Outstanding (disbursed) respects both the product-type chips and the
  // parent-company multi-select.
  const SEGMENT_KEYS = ['sfr', 'mfr', 'and', 'raw_land', 'finished_lots', 'hhh'] as const
  const outstanding = SEGMENT_KEYS.reduce((s, k) => {
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
  // Drawn/outstanding total for the loan book (existing disbursed +
  // forecasted cohorts), excluding Land Bucket; "All" adds Land Bucket.
  const outLoans = (m: MonthlyBalance) =>
    m.outstanding_sfr + m.outstanding_mfr + m.outstanding_and +
    m.outstanding_raw_land + m.outstanding_finished_lots + m.outstanding_hhh

  const rows: SummaryRow[] = [
    { label: 'SFR',             values: months.map(m => m.sfr - m.forecasted_sfr), kind: 'currency' },
    { label: 'MFR',             values: months.map(m => m.mfr - m.forecasted_mfr), kind: 'currency' },
    { label: 'A&D',             values: months.map(m => m.and),                    kind: 'currency' },
    { label: 'Raw Land',        values: months.map(m => m.raw_land),               kind: 'currency' },
    { label: 'Fin. Lots',       values: months.map(m => m.finished_lots),          kind: 'currency' },
    { label: 'Forecasted SFR',  values: months.map(m => m.forecasted_sfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Forecasted MFR',  values: months.map(m => m.forecasted_mfr),         kind: 'currency', emphasis: 'forecast' },
    { label: 'Land Bucket',     values: months.map(m => m.land_bucket),            kind: 'currency' },
    { label: 'Total Outstanding (Loans)', values: months.map(outLoans),                       kind: 'currency', emphasis: 'total' },
    { label: 'Total Outstanding (All)',   values: months.map(m => outLoans(m) + m.land_bucket), kind: 'currency', emphasis: 'total' },
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

// ─── Parent Company multi-select dropdown ───────────────────────────────────
// Custom checkbox popover (native multi-select is hard to style and tab-
// navigate). selected === null = "all"; otherwise the Set holds the parent
// company ids that are currently active. UNASSIGNED_PARENT_KEY is a regular
// row so the user can isolate borrowers with no parent if they want.

function ParentCompanyDropdown({
  parents, parentLoanCounts, selected, onChange,
}: {
  parents: { id: string; name: string }[]
  parentLoanCounts: Record<string, number>
  selected: Set<string> | null
  onChange: (s: Set<string> | null) => void
}) {
  const [open, setOpen]       = useState(false)
  // Position is computed from the button's getBoundingClientRect on open
  // (and on scroll/resize while open) and the popover renders via portal
  // into document.body, so it can never be clipped by a parent .card's
  // overflow-hidden or buried under sibling cards' stacking contexts.
  const [pos, setPos]         = useState<{ top: number; right: number } | null>(null)
  const buttonRef             = useRef<HTMLButtonElement>(null)
  const popoverRef            = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      top:   Math.round(rect.bottom + 4),
      right: Math.round(window.innerWidth - rect.right),
    })
  }

  useEffect(() => {
    if (!open) return
    reposition()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc      = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize   = () => reposition()
    const onScroll   = () => reposition()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll',  onScroll, true)  // capture = catch inner scrollers too
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll',  onScroll, true)
    }
  }, [open])

  const rows = useMemo(() => {
    const base = parents.map(p => ({ id: p.id, name: p.name, count: parentLoanCounts[p.id] ?? 0 }))
    base.sort((a, b) => a.name.localeCompare(b.name))
    base.push({
      id: UNASSIGNED_PARENT_KEY,
      name: '(Unassigned)',
      count: parentLoanCounts[UNASSIGNED_PARENT_KEY] ?? 0,
    })
    return base
  }, [parents, parentLoanCounts])

  const label = selected === null
    ? 'Parent: All'
    : selected.size === 0
      ? 'Parent: none'
      : selected.size === 1
        ? `Parent: ${rows.find(r => r.id === Array.from(selected)[0])?.name ?? '—'}`
        : `Parent: ${selected.size} selected`

  const toggle = (id: string) => {
    const next = selected === null ? new Set<string>() : new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(next)
  }
  const selectAll = () => onChange(null)
  const selectNone = () => onChange(new Set())

  const popover = open && pos && mounted ? createPortal(
    <div ref={popoverRef}
         style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}
         className="w-64 bg-surface border border-border-strong rounded-lg shadow-xl max-h-80 overflow-y-auto">
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between text-[10px] text-fg-dim">
        <span>Parent companies</span>
        <div className="flex items-center gap-1">
          <button onClick={selectAll}  className="btn-ghost text-[10px] px-1.5 py-0.5">All</button>
          <button onClick={selectNone} className="btn-ghost text-[10px] px-1.5 py-0.5">None</button>
        </div>
      </div>
      {rows.length === 1 && rows[0].id === UNASSIGNED_PARENT_KEY ? (
        <div className="text-[10px] text-fg-dim italic px-3 py-3 space-y-1.5">
          <div>The forecast engine returned 0 parent companies.</div>
          <div>
            If you already added some on Assumptions, this almost always means
            the deployed <code>/api/calculate</code> hasn&rsquo;t been refreshed.
            Try: <strong>hard-refresh</strong> (⌘⇧R / Ctrl⇧R) or check{' '}
            <a className="underline" href="/api/calculate" target="_blank" rel="noreferrer">
              /api/calculate
            </a>{' '}
            for a <code>parent_companies</code> array.
          </div>
        </div>
      ) : rows.map(r => {
        const on = selected === null ? true : selected.has(r.id)
        return (
          <button key={r.id}
                  onClick={() => toggle(r.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                             hover:bg-border/50 text-left">
            <span className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 inline-flex items-center justify-center rounded border
                                ${on ? 'bg-accent border-accent text-accent-on' : 'border-border-strong'}`}>
                {on && <Check className="w-2.5 h-2.5" />}
              </span>
              <span className={r.id === UNASSIGNED_PARENT_KEY ? 'text-fg-dim italic' : 'text-fg'}>
                {r.name}
              </span>
            </span>
            <span className="text-[10px] text-fg-dim font-mono">{r.count}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button ref={buttonRef} onClick={() => setOpen(o => !o)}
              className="btn-ghost text-[10px] inline-flex items-center gap-1.5">
        <Building2 className="w-3 h-3" />
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {popover}
    </>
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
