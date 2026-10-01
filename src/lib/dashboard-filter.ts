import type { MonthlyBalance, ActiveChangeBySegment } from './types'

// Dashboard product-type / parent filtering.
//
// Extracted from the dashboard page so it can be tested directly: this is the
// arithmetic behind every number on that page, and a field silently dropped
// here shows up as an unfiltered value in the Monthly Summary.

// The set of toggleable product/category buckets shown in the dashboard.
// Land Bucket isn't a "product type" per se but it sits next to the loan
// segments in every chart, so it lives in the same filter strip.
export type FilterKey = 'sfr' | 'mfr' | 'and' | 'raw_land' | 'finished_lots' | 'hhh' | 'land_bucket'

export interface FilterChip {
  key: FilterKey
  label: string
  color: string
}

export const CHIPS: FilterChip[] = [
  { key: 'sfr',           label: 'SFR',           color: '#58A6FF' },
  { key: 'mfr',           label: 'MFR',           color: '#D4A853' },
  { key: 'and',           label: 'A&D',           color: '#3FB950' },
  { key: 'raw_land',      label: 'Raw Land',      color: '#8B949E' },
  { key: 'finished_lots', label: 'Finished Lots', color: '#A371F7' },
  { key: 'hhh',           label: 'HHH/JV',        color: '#F85149' },
  { key: 'land_bucket',   label: 'Land Bucket',   color: '#79C0FF' },
]

export const ALL_KEYS = new Set<FilterKey>(CHIPS.map(c => c.key))

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
export function applyFilter(
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
      // These three were computed by sliceSegment and then dropped, so they
      // kept the engine's UNFILTERED value via the spread above. With any
      // chip or parent filter active, Forecasted A&D — and through it Total
      // Outstanding (Loans) — still carried the whole book's A&D forecast,
      // so the row would not fall when A&D was switched off.
      //
      // forecasted_hhh is deliberately NOT written back: sliceSegment folds
      // slot.hhh_jv_balance into `forecasted` for the hhh segment (so the
      // HHH row stays consistent across filter states), which is a different
      // quantity from the engine's forecasted_hhh. The dashboard reads the
      // combined hhh value, not forecasted_hhh, so nothing depends on it.
      forecasted_and:           sAnd.fcst,
      forecasted_raw_land:      sRaw.fcst,
      forecasted_finished_lots: sFin.fcst,
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
      // Active-row change by cause follows the product-type chips. It has no
      // per-parent breakdown, so under a parent filter it is left as the
      // whole book and the Dashboard does not present it as reconciling.
      active_change: sliceActiveChange(m.active_change, active),
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

const ACTIVE_CHANGE_SEGS = ['sfr', 'mfr', 'and', 'raw_land', 'finished_lots', 'hhh'] as const

function sliceActiveChange(
  change: MonthlyBalance['active_change'] | undefined,
  active: Set<FilterKey>,
): MonthlyBalance['active_change'] {
  const slice = (r: ActiveChangeBySegment | undefined): ActiveChangeBySegment => {
    const out = { sfr: 0, mfr: 0, and: 0, raw_land: 0, finished_lots: 0, hhh: 0 }
    for (const k of ACTIVE_CHANGE_SEGS) out[k] = active.has(k) ? (r?.[k] ?? 0) : 0
    return out
  }
  return {
    past_maturity: slice(change?.past_maturity),
    maturing:      slice(change?.maturing),
    paydown:       slice(change?.paydown),
  }
}
