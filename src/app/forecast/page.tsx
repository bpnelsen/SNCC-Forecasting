'use client'

import { useEffect, useState } from 'react'
import { ForecastResult, MonthlyBalance, OriginationProjectDetail } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, AlertCircle, Filter } from 'lucide-react'
import { type FilterKey, CHIPS, ALL_KEYS, applyFilter } from '@/lib/dashboard-filter'
import {
  activeOnBooks, forecastedAnd, forecastLayer, totalOutstandingLoans, totalOutstandingAll,
} from '@/lib/summary'

// Chips, filtering and every total come from the same modules the Dashboard
// uses, so the Forecast tab reconciles with the Monthly Summary Table by
// construction: Fcst SFR / MFR / A&D, Total Fcst, Active Loan (Outstanding),
// Total Outstanding (Loans) and Total Outstanding (All) are the same numbers
// as the Dashboard rows of the same names, for any chip selection.
//
// This page used to recombine engine fields itself, and had drifted: Total
// Fcst left out planned A&D loans; Active Portfolio summed outstanding_<seg>,
// which also carries Land-Bucket-driven cohorts and HHH/JV (both kept out of
// the Dashboard's Loans total); and Current Loan Balance was a second copy of
// Active Portfolio.

const PRODUCT_KEYS = ['sfr', 'mfr', 'and', 'raw_land', 'finished_lots', 'hhh'] as const

// Flows (new originations, payoffs) aren't sliced by applyFilter, so they are
// filtered here by the same chips. `raw` is the unfiltered engine month.
function flows(raw: MonthlyBalance, active: Set<FilterKey>) {
  let newOrigCount = 0, newOrigAmount = 0, payoffsAmount = 0
  for (const k of PRODUCT_KEYS) {
    if (!active.has(k)) continue
    newOrigCount  += raw.new_origs_by_segment[k].count
    newOrigAmount += raw.new_origs_by_segment[k].amount
    payoffsAmount += raw.payoffs_by_segment?.[k] ?? 0
  }
  return { newOrigCount, newOrigAmount, payoffsAmount }
}

export default function ForecastPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [active, setActive]   = useState<Set<FilterKey>>(new Set(ALL_KEYS))
  // Detailed view: three per-project × month tables below the summary.
  const [detailed, setDetailed] = useState(false)

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

  // Same slicing as the Dashboard (no parent filter on this page).
  const filtered = applyFilter(data.months, active, null)

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
          {data.months.length}-month forward projection · {data.version_label}
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
          {/* Detailed toggle reveals three project × month breakdowns below
              the summary tables. Highlighted when active so it's obvious
              which mode the page is in. */}
          <button
            onClick={() => setDetailed(d => !d)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors
                        ${detailed
                          ? 'bg-accent/15 text-accent border-accent/50'
                          : 'border-transparent text-fg-dim hover:text-fg hover:bg-border'}`}
            title={detailed ? 'Hide per-project detail tables' : 'Show per-project detail tables'}
          >
            Detailed
          </button>
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
                <th className="text-right">Fcst A&amp;D</th>
                <th className="text-right">Total Fcst</th>
                <th className="text-right" title="Imported loans on the books. Month 1 ties to the Dashboard's Active Loan (Outstanding) tile.">Active Loan (Outstanding)</th>
                <th className="text-right" title="Active Loan (Outstanding) + Total Fcst — the Dashboard's Total Outstanding (Loans) row">Total Outstanding (Loans)</th>
                <th className="text-right" title="Loans + HHH/JV + Land Bucket — the Dashboard's Total Outstanding (All) row">Total Outstanding (All)</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((raw, i) => {
                const m = filtered[i]
                const f = flows(raw, active)
                return (
                  <tr key={raw.month}>
                    <td className="text-fg font-medium">{raw.label}</td>
                    <td className="num">{f.newOrigCount || '—'}</td>
                    <td className="num">{f.newOrigAmount ? formatCurrency(f.newOrigAmount, true) : '—'}</td>
                    <td className="num text-danger">
                      {f.payoffsAmount ? `−${formatCurrency(f.payoffsAmount, true)}` : '—'}
                    </td>
                    <td className="num text-success-bright">{formatCurrency(m.forecasted_sfr, true)}</td>
                    <td className="num text-success-bright">{formatCurrency(m.forecasted_mfr, true)}</td>
                    <td className="num text-success-bright">{formatCurrency(forecastedAnd(m), true)}</td>
                    <td className="num font-medium">{formatCurrency(forecastLayer(m), true)}</td>
                    <td className="num">{formatCurrency(activeOnBooks(m), true)}</td>
                    <td className="num font-medium">{formatCurrency(totalOutstandingLoans(m), true)}</td>
                    <td className="num font-medium text-accent">{formatCurrency(totalOutstandingAll(m), true)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailed && (
        <DetailedSection
          projects={data.new_origination_projects ?? []}
          months={data.months}
          active={active}
        />
      )}
    </div>
  )
}

// ── Detailed view ──────────────────────────────────────────────────────────
// Three tables stacked vertically, each with developments as rows and months
// as columns:
//   1. Number of loans started per project per month (flow).
//   2. Outstanding (drawn) balance per project per month (snapshot).
//   3. Total approved loan amount per project (same value replayed across
//      every month column for alignment with tables 1 & 2).
// Chip filter narrows which segments' projects appear so the Detailed view
// stays in sync with the summary tables above. No data is fetched here —
// everything was already computed by the engine and shipped on the result.
function DetailedSection({ projects, months, active }: {
  projects: OriginationProjectDetail[]
  months: MonthlyBalance[]
  active: Set<FilterKey>
}) {
  // Only true loan originations — entries you added on /originations.
  // Land Bucket-spawned vertical cohorts are a side-effect of lot sales,
  // not loans you committed-to per se, so they're excluded here.
  // Then respect the chip filter inside the loan set.
  const visible = projects.filter(p =>
    p.source === 'scheduled' && active.has(p.segment as FilterKey),
  )

  if (visible.length === 0) {
    return (
      <div className="card fade-up p-6 text-center text-xs text-fg-dim">
        No scheduled new-origination loans match the current product-type filter.
        Add entries on the New Originations tab or enable more chips above.
      </div>
    )
  }

  // Per-month sum across visible projects for each metric. Used by the
  // grand-total footer row on each table.
  const countTotals = months.map((_, i) =>
    visible.reduce((s, p) => s + (p.months[i]?.count ?? 0), 0),
  )
  const committedTotals = months.map((_, i) =>
    visible.reduce((s, p) => s + (p.months[i]?.committed_amount ?? 0), 0),
  )
  const outstandingTotals = months.map((_, i) =>
    visible.reduce((s, p) => s + (p.months[i]?.outstanding ?? 0), 0),
  )

  return (
    <>
      <DetailTable
        title="Detail · # of Loans by Development"
        months={months}
        projects={visible}
        cell={(p, i) => p.months[i]?.count || 0}
        format={v => v ? String(v) : '—'}
        totals={countTotals}
        totalFormat={v => v ? String(v) : '—'}
      />
      <DetailTable
        title="Detail · Outstanding Balance by Development"
        months={months}
        projects={visible}
        cell={(p, i) => p.months[i]?.outstanding ?? 0}
        format={v => v > 0 ? formatCurrency(v, true) : '—'}
        totals={outstandingTotals}
        totalFormat={v => v > 0 ? formatCurrency(v, true) : '—'}
      />
      <DetailTable
        title="Detail · Total Loan Amount by Development"
        months={months}
        projects={visible}
        // Per-month committed $ — only the loans started that month for that
        // project, valued at their avg loan amount.
        cell={(p, i) => p.months[i]?.committed_amount ?? 0}
        format={v => v > 0 ? formatCurrency(v, true) : '—'}
        totals={committedTotals}
        totalFormat={v => v > 0 ? formatCurrency(v, true) : '—'}
      />
    </>
  )
}

function DetailTable({ title, months, projects, cell, format, totals, totalFormat }: {
  title: string
  months: MonthlyBalance[]
  projects: OriginationProjectDetail[]
  cell: (p: OriginationProjectDetail, i: number) => number
  format: (v: number) => string
  totals: number[]
  totalFormat: (v: number) => string
}) {
  return (
    <div className="card fade-up">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span className="text-[10px] text-fg-dim">{projects.length} development{projects.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-surface min-w-[220px]">Development</th>
              <th className="text-left">Type</th>
              {months.map(m => <th key={m.month} className="text-right">{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.project_id}>
                <td className="sticky left-0 z-10 bg-surface text-fg-strong">
                  <div className="text-fg font-medium">{p.project_name}</div>
                  {p.builder_name && (
                    <div className="text-[10px] text-fg-dim">{p.builder_name}</div>
                  )}
                </td>
                <td className="text-[10px] uppercase tracking-wide text-fg-dim">
                  {SEGMENT_LABEL[p.segment as FilterKey] ?? p.segment}
                  {p.source === 'land_bucket' && <span className="ml-1 text-fg-dim">(LB)</span>}
                </td>
                {months.map((m, i) => (
                  <td key={m.month} className="num">{format(cell(p, i))}</td>
                ))}
              </tr>
            ))}
            <tr className="bg-accent/10 text-fg-strong font-semibold border-t-2 border-accent/40">
              <td className="sticky left-0 z-10 bg-accent/10 uppercase text-[10px] tracking-wide">
                Grand total
              </td>
              <td></td>
              {totals.map((t, i) => (
                <td key={i} className="num">{totalFormat(t)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SEGMENT_LABEL: Partial<Record<FilterKey, string>> = {
  sfr:           'SFR',
  mfr:           'MFR',
  and:           'A&D',
  raw_land:      'Raw Land',
  finished_lots: 'Fin. Lots',
  hhh:           'HHH/JV',
}
