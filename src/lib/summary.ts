import type { MonthlyBalance, ActiveChangeBySegment } from './types'

// The Monthly Summary totals, defined once.
//
// The Dashboard's Monthly Summary Table, its Reconciliation panel and the
// Forecast tab all show these figures. Each used to compute them separately,
// and the Forecast tab's versions had drifted: its "Total Fcst" left out
// planned A&D loans, and its "Active Portfolio" summed outstanding_<seg>,
// which also includes Land-Bucket-driven cohorts and HHH/JV — both of which
// the Dashboard deliberately keeps out of "Loans". Anything that should agree
// with the Dashboard must read these instead of recombining fields itself.
//
// All take a month that has already been through applyFilter, so chip and
// parent filtering is applied exactly once and the same way everywhere.

/** Loans on the books: imported loans only. At month 0 this ties to the
 *  Active Loan (Outstanding) tile (less the documented FL basis delta). */
export function activeOnBooks(m: MonthlyBalance): number {
  return m.active_sfr + m.active_mfr + m.active_and +
    m.active_raw_land + m.active_finished_lots
}

/** Forecasted A&D: scheduled A&D cohorts plus planned loans on the A&D tab. */
export function forecastedAnd(m: MonthlyBalance): number {
  return m.forecasted_and + m.a_and_d_planned
}

/** The forecast layer: everything in Total Outstanding (Loans) that is not
 *  yet on the books. */
export function forecastLayer(m: MonthlyBalance): number {
  return m.forecasted_sfr + m.forecasted_mfr + forecastedAnd(m)
}

/** Total Outstanding (Loans) = on the books + the forecast layer. HHH/JV
 *  (equity, not a loan) and Land Bucket (inventory) are excluded. */
export function totalOutstandingLoans(m: MonthlyBalance): number {
  return activeOnBooks(m) + forecastLayer(m)
}

/** Total Outstanding (All) = Loans + HHH/JV + Land Bucket. */
export function totalOutstandingAll(m: MonthlyBalance): number {
  return totalOutstandingLoans(m) + m.hhh + m.land_bucket
}

/**
 * Why Total Outstanding (Loans) changed from `prev` to `curr`, by cause.
 * The parts sum to `total` exactly; `other` is whatever doesn't, and should be
 * 0 — it's shown rather than hidden so a gap is visible instead of absorbed.
 */
export function monthBridge(prev: MonthlyBalance, curr: MonthlyBalance) {
  const rowSum = (r: ActiveChangeBySegment | undefined) =>
    r ? r.sfr + r.mfr + r.and + r.raw_land + r.finished_lots + r.hhh : 0
  const c = curr.active_change
  const parts = {
    pastMaturity:   rowSum(c?.past_maturity),
    maturing:       rowSum(c?.maturing),
    draws:          rowSum(c?.draws),
    paydown:        rowSum(c?.paydown),
    forecastedSfr:  curr.forecasted_sfr - prev.forecasted_sfr,
    forecastedMfr:  curr.forecasted_mfr - prev.forecasted_mfr,
    forecastedAnd:  forecastedAnd(curr) - forecastedAnd(prev),
  }
  const total = totalOutstandingLoans(curr) - totalOutstandingLoans(prev)
  const explained = Object.values(parts).reduce((a, b) => a + b, 0)
  return { ...parts, other: total - explained, total }
}

/**
 * Total Portfolio (All) as Total Outstanding (All) plus the parts where it
 * counts differently. `other` should be 0 and is shown, not absorbed.
 */
export function portfolioBreakdown(m: MonthlyBalance) {
  const rowSum = (r: ActiveChangeBySegment | undefined) =>
    r ? r.sfr + r.mfr + r.and + r.raw_land + r.finished_lots + r.hhh : 0
  const outstandingAll = totalOutstandingAll(m)
  const parts = {
    undrawn:       rowSum(m.portfolio_gap?.undrawn),
    pastMaturity:  rowSum(m.portfolio_gap?.past_maturity),
    extraForecast: rowSum(m.portfolio_gap?.extra_forecast),
  }
  const explained = outstandingAll + parts.undrawn + parts.pastMaturity + parts.extraForecast
  return { outstandingAll, ...parts, other: m.total_all - explained, total: m.total_all }
}
