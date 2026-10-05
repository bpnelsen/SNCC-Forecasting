import { describe, it, expect } from 'vitest'
import { applyFilter, ALL_KEYS, type FilterKey } from './dashboard-filter'
import type { MonthlyBalance } from './types'

// A month carrying a distinct value in every field the filter touches, so a
// dropped write-back shows up as the original number rather than as zero.
function month(over: Partial<MonthlyBalance> = {}): MonthlyBalance {
  return {
    key: '2026-09',
    label: 'Sep 26',
    sfr: 100, mfr: 200, and: 300, raw_land: 400, finished_lots: 500, hhh: 600,
    land_bucket: 700,
    forecasted_sfr: 10, forecasted_mfr: 20, forecasted_and: 30,
    forecasted_raw_land: 40, forecasted_finished_lots: 50, forecasted_hhh: 60,
    outstanding_sfr: 90, outstanding_mfr: 180, outstanding_and: 270,
    outstanding_raw_land: 360, outstanding_finished_lots: 450, outstanding_hhh: 540,
    active_sfr: 80, active_mfr: 160, active_and: 240,
    active_raw_land: 320, active_finished_lots: 400,
    a_and_d_planned: 5,
    total_loans: 0, total_all: 0, variance: 0,
    total_income: 0, annualized_yield_pct: 0,
    new_origs_by_segment: {
      sfr: { count: 0, amount: 0 }, mfr: { count: 0, amount: 0 },
      and: { count: 0, amount: 0 }, raw_land: { count: 0, amount: 0 },
      finished_lots: { count: 0, amount: 0 }, hhh: { count: 0, amount: 0 },
    },
    by_parent: {},
    ...over,
  } as MonthlyBalance
}

describe('applyFilter', () => {
  it('leaves every number untouched when nothing is filtered', () => {
    const m = month()
    const [out] = applyFilter([m], ALL_KEYS, null)
    expect(out.forecasted_and).toBe(30)
    expect(out.forecasted_raw_land).toBe(40)
    expect(out.forecasted_finished_lots).toBe(50)
    expect(out.active_and).toBe(240)
    expect(out.a_and_d_planned).toBe(5)
  })

  it('zeroes the A&D forecast when the A&D chip is off', () => {
    // Regression: sliceSegment computed the sliced forecast for and/raw_land/
    // finished_lots and applyFilter never wrote it back, so these kept the
    // engine's unfiltered value. Switching A&D off left the whole book's A&D
    // forecast inside Total Outstanding (Loans).
    const keys = new Set<FilterKey>(ALL_KEYS)
    keys.delete('and')
    const [out] = applyFilter([month()], keys, null)

    expect(out.and).toBe(0)
    expect(out.active_and).toBe(0)
    expect(out.a_and_d_planned).toBe(0)
    expect(out.forecasted_and).toBe(0)

    // The row the dashboard actually renders must fall to the non-A&D parts.
    const outLoans =
      out.active_sfr + out.active_mfr + out.active_and +
      out.active_raw_land + out.active_finished_lots +
      out.forecasted_sfr + out.forecasted_mfr +
      out.forecasted_and + out.a_and_d_planned
    expect(outLoans).toBe(80 + 160 + 0 + 320 + 400 + 10 + 20 + 0 + 0)
  })

  it('zeroes the raw-land and finished-lots forecasts when their chips are off', () => {
    const keys = new Set<FilterKey>(ALL_KEYS)
    keys.delete('raw_land')
    keys.delete('finished_lots')
    const [out] = applyFilter([month()], keys, null)
    expect(out.forecasted_raw_land).toBe(0)
    expect(out.forecasted_finished_lots).toBe(0)
    expect(out.forecasted_sfr).toBe(10)   // untouched chips keep their values
  })

  it('slices the A&D forecast to the selected parents', () => {
    const m = month({
      by_parent: {
        p1: {
          sfr: 10, mfr: 0, and: 7, raw_land: 0, finished_lots: 0, hhh: 0,
          active_sfr: 4, active_mfr: 0, active_and: 3,
          active_raw_land: 0, active_finished_lots: 0,
          forecasted_sfr: 2, forecasted_mfr: 0, forecasted_and: 4,
          forecasted_raw_land: 0, forecasted_finished_lots: 0, forecasted_hhh: 0,
          outstanding_sfr: 0, outstanding_mfr: 0, outstanding_and: 0,
          outstanding_raw_land: 0, outstanding_finished_lots: 0, outstanding_hhh: 0,
          land_bucket: 0, hhh_jv_balance: 0, a_and_d_planned: 1,
        },
        p2: {
          sfr: 0, mfr: 0, and: 99, raw_land: 0, finished_lots: 0, hhh: 0,
          active_sfr: 0, active_mfr: 0, active_and: 90,
          active_raw_land: 0, active_finished_lots: 0,
          forecasted_sfr: 0, forecasted_mfr: 0, forecasted_and: 9,
          forecasted_raw_land: 0, forecasted_finished_lots: 0, forecasted_hhh: 0,
          outstanding_sfr: 0, outstanding_mfr: 0, outstanding_and: 0,
          outstanding_raw_land: 0, outstanding_finished_lots: 0, outstanding_hhh: 0,
          land_bucket: 0, hhh_jv_balance: 0, a_and_d_planned: 50,
        },
      },
    } as Partial<MonthlyBalance>)

    const [out] = applyFilter([m], ALL_KEYS, new Set(['p1']))
    // p1 only: not the global 30, and not p1 + p2.
    expect(out.forecasted_and).toBe(4)
    expect(out.active_and).toBe(3)
    expect(out.a_and_d_planned).toBe(1)
  })
})
