import { describe, it, expect } from 'vitest'
import { applyFilter, ALL_KEYS, type FilterKey } from './dashboard-filter'
import {
  activeOnBooks, forecastedAnd, forecastLayer, totalOutstandingLoans, totalOutstandingAll,
} from './summary'
import type { MonthlyBalance } from './types'

// Distinct values everywhere, including in the fields the totals must NOT
// read (outstanding_<seg>, forecasted_raw_land / finished_lots / hhh), so a
// formula reaching for the wrong field shows up as a wrong number.
const month = (): MonthlyBalance => ({
  month: '2026-09', label: 'Sep 26',
  sfr: 1, mfr: 2, and: 3, raw_land: 4, finished_lots: 5, hhh: 600, land_bucket: 700,
  forecasted_sfr: 10, forecasted_mfr: 20, forecasted_and: 30,
  forecasted_raw_land: 4000, forecasted_finished_lots: 5000, forecasted_hhh: 6000,
  outstanding_sfr: 90_000, outstanding_mfr: 90_000, outstanding_and: 90_000,
  outstanding_raw_land: 90_000, outstanding_finished_lots: 90_000, outstanding_hhh: 90_000,
  active_sfr: 100, active_mfr: 200, active_and: 300, active_raw_land: 400, active_finished_lots: 500,
  a_and_d_planned: 7,
  total_loans: 0, total_all: 0, variance: 0, total_income: 0, annualized_yield_pct: 0,
  new_origs_by_segment: {
    sfr: { count: 0, amount: 0 }, mfr: { count: 0, amount: 0 }, and: { count: 0, amount: 0 },
    raw_land: { count: 0, amount: 0 }, finished_lots: { count: 0, amount: 0 }, hhh: { count: 0, amount: 0 },
  },
  by_parent: {},
} as unknown as MonthlyBalance)

describe('Monthly Summary totals', () => {
  it('compose from the Dashboard rows and nothing else', () => {
    const [m] = applyFilter([month()], ALL_KEYS, null)
    expect(activeOnBooks(m)).toBe(1_500)          // Σ Active rows
    expect(forecastedAnd(m)).toBe(37)             // scheduled A&D 30 + A&D tab 7
    expect(forecastLayer(m)).toBe(67)             // 10 + 20 + 37
    expect(totalOutstandingLoans(m)).toBe(1_567)  // 1,500 + 67
    // + HHH/JV and Land Bucket. applyFilter recomputes hhh from its slice.
    expect(totalOutstandingAll(m)).toBe(1_567 + m.hhh + 700)
  })

  it('follow the chips the same way on every page', () => {
    const keys = new Set<FilterKey>(ALL_KEYS)
    keys.delete('and')
    const [m] = applyFilter([month()], keys, null)
    expect(forecastedAnd(m)).toBe(0)
    expect(totalOutstandingLoans(m)).toBe(100 + 200 + 400 + 500 + 10 + 20)
  })
})
