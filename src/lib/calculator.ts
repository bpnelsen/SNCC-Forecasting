import { addMonths, format, parseISO, differenceInMonths } from 'date-fns'
import { Loan, Assumptions, MonthlyBalance, ForecastResult } from './types'

const MONTHS_FORWARD = 17

function monthKey(date: Date): string {
  return format(date, 'yyyy-MM')
}

function monthLabel(date: Date): string {
  return format(date, 'MMM yy')
}

// Ramp a loan's balance from its current projected balance down to 0
// over the remaining months until its due date
function projectLoanBalance(
  loan: Loan,
  monthDate: Date,
  drawPct: number
): number {
  const projected = loan.projected_balance
  if (projected <= 0) return 0

  if (!loan.current_loan_due_date) {
    // No due date: use projected balance flat for 6 months then wind down
    const asOf = new Date()
    const diff  = differenceInMonths(monthDate, asOf)
    if (diff <= 0) return projected
    if (diff >= 12) return 0
    return projected * (1 - diff / 12)
  }

  const dueDate = parseISO(loan.current_loan_due_date)
  const today   = new Date()

  if (monthDate >= dueDate) return 0

  const totalMonths     = Math.max(1, differenceInMonths(dueDate, today))
  const monthsRemaining = Math.max(0, differenceInMonths(dueDate, monthDate))

  // Linear wind-down from projected balance
  return projected * (monthsRemaining / totalMonths)
}

// NHCF: new origination forecast for a builder/type
// Returns net new balance added each month (new loans minus payoffs)
function calcNhcfBalances(
  assumptions: Assumptions,
  startDate: Date
): { sfr: number[]; mfr: number[] } {
  const sfrBalances = new Array(MONTHS_FORWARD).fill(0)
  const mfrBalances = new Array(MONTHS_FORWARD).fill(0)

  const drawPctSf = assumptions.draw_pct_sf
  const drawPctMf = assumptions.draw_pct_mf

  // Running cumulative balances per builder
  const builderBalances: Record<string, { sf: number; mf: number }> = {}

  for (const builderKey of Object.keys(assumptions.nhcf_loan_counts)) {
    builderBalances[builderKey] = { sf: 0, mf: 0 }
    const sizes   = assumptions.nhcf_loan_sizes[builderKey]   || { sf: 0, mf: 0 }
    const counts  = assumptions.nhcf_loan_counts[builderKey]  || {}
    const payoffs = assumptions.nhcf_payoff_counts[builderKey] || {}

    const isMfBuilder = builderKey.includes('mfr') || builderKey.includes('holmes_mfr')

    for (let m = 0; m < MONTHS_FORWARD; m++) {
      const newLoans  = counts[String(m)]  || 0
      const paidOff   = payoffs[String(m)] || 0

      if (isMfBuilder) {
        builderBalances[builderKey].mf += newLoans * sizes.mf * drawPctMf
        builderBalances[builderKey].mf -= paidOff * sizes.mf
        builderBalances[builderKey].mf  = Math.max(0, builderBalances[builderKey].mf)
        mfrBalances[m] += builderBalances[builderKey].mf
      } else {
        builderBalances[builderKey].sf += newLoans * sizes.sf * drawPctSf
        builderBalances[builderKey].sf -= paidOff * sizes.sf
        builderBalances[builderKey].sf  = Math.max(0, builderBalances[builderKey].sf)
        sfrBalances[m] += builderBalances[builderKey].sf
      }
    }
  }

  return { sfr: sfrBalances, mfr: mfrBalances }
}

// Land Bucket: development cost build-out minus lot releases
function calcLandBucketBalance(assumptions: Assumptions, monthDate: Date): number {
  let totalBalance = 0

  for (const dev of assumptions.land_bucket) {
    const startDate      = parseISO(dev.start_date)
    const completionDate = parseISO(dev.completion_date)
    const releaseStart   = parseISO(dev.lot_release_start)

    if (monthDate < startDate) continue

    const totalCost = dev.land_costs + dev.dev_costs + dev.interest

    if (monthDate < completionDate) {
      // Under development: linear build-up
      const totalBuildMonths = Math.max(1, differenceInMonths(completionDate, startDate))
      const elapsed          = differenceInMonths(monthDate, startDate)
      totalBalance += totalCost * Math.min(elapsed / totalBuildMonths, 1)
    } else {
      // Completed: releasing lots
      const lotsReleased = Math.max(
        0,
        differenceInMonths(monthDate, releaseStart)
      )
      const remainingLots  = Math.max(0, dev.lots - lotsReleased)
      const costPerLot     = totalCost / dev.lots
      totalBalance += remainingLots * costPerLot
    }
  }

  return Math.max(0, totalBalance)
}

// Profit sharing income for the month
function calcProfitSharing(assumptions: Assumptions, monthIndex: number): number {
  let total = 0
  const units = assumptions.ps_unit_counts

  for (const [builderKey, monthMap] of Object.entries(units)) {
    const monthUnits = monthMap[String(monthIndex)] || 0
    if (builderKey.includes('holmes')) {
      total += monthUnits * assumptions.ps_holmes_sfr
    } else if (builderKey.includes('arive')) {
      total += monthUnits * assumptions.ps_arive_sfr
    }
  }
  return total
}

export function runForecast(
  loans: Loan[],
  assumptions: Assumptions,
  versionLabel: string,
  asOfDate: string
): ForecastResult {
  const startDate = new Date()
  startDate.setDate(1) // First of current month

  // Group current loans by type
  const loansByType = {
    SFR:           loans.filter(l => l.loan_type === 'SFR'),
    MFR:           loans.filter(l => l.loan_type === 'MFR'),
    RAW_LAND:      loans.filter(l => l.loan_type === 'RAW_LAND'),
    'A&D':         loans.filter(l => l.loan_type === 'A&D'),
    FINISHED_LOTS: loans.filter(l => l.loan_type === 'FINISHED_LOTS'),
    HHH:           loans.filter(l => l.loan_type === 'HHH'),
  }

  const currentBalances = {
    sfr:           loansByType.SFR.reduce((s, l)           => s + l.projected_balance, 0),
    mfr:           loansByType.MFR.reduce((s, l)           => s + l.projected_balance, 0),
    raw_land:      loansByType.RAW_LAND.reduce((s, l)      => s + l.projected_balance, 0),
    and:           loansByType['A&D'].reduce((s, l)         => s + l.projected_balance, 0),
    finished_lots: loansByType.FINISHED_LOTS.reduce((s, l) => s + l.projected_balance, 0),
    hhh:           loansByType.HHH.reduce((s, l)           => s + l.projected_balance, 0),
    total:         0,
  }
  currentBalances.total = Object.values(currentBalances).reduce((a, b) => a + b, 0) - currentBalances.total

  // NHCF new origination forecasts
  const nhcf = calcNhcfBalances(assumptions, startDate)

  const months: MonthlyBalance[] = []
  let prevTotal = 0

  for (let m = 0; m < MONTHS_FORWARD; m++) {
    const monthDate = addMonths(startDate, m)

    // Active loan balances (wind-down existing portfolio)
    const sfr           = loansByType.SFR.reduce((s, l)           => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_sf),  0)
    const mfr           = loansByType.MFR.reduce((s, l)           => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_mf),  0)
    const raw_land      = loansByType.RAW_LAND.reduce((s, l)      => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_active), 0)
    const and           = loansByType['A&D'].reduce((s, l)         => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_active), 0)
    const finished_lots = loansByType.FINISHED_LOTS.reduce((s, l) => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_active), 0)
    const hhh           = loansByType.HHH.reduce((s, l)           => s + projectLoanBalance(l, monthDate, assumptions.draw_pct_active), 0)

    // Land Bucket
    const land_bucket = calcLandBucketBalance(assumptions, monthDate)

    // NHCF forecasted new
    const forecasted_sfr = nhcf.sfr[m] || 0
    const forecasted_mfr = nhcf.mfr[m] || 0

    const total_loans = sfr + mfr + raw_land + and + finished_lots + hhh
    const total_all   = total_loans + land_bucket + forecasted_sfr + forecasted_mfr

    // Yield / income calculations (matches Excel Summary rows 47-54)
    const rate_active = 0.0525 // 5.25% flat on active loans
    const yield_active      = total_loans      * (rate_active                       / 12)
    const yield_projected   = (forecasted_sfr + forecasted_mfr) * (assumptions.rate_projected_loans / 12)
    const yield_land_bucket = land_bucket      * (assumptions.rate_land_bucket      / 12)
    const profit_sharing    = calcProfitSharing(assumptions, m)
    const total_income      = yield_active + yield_projected + yield_land_bucket + profit_sharing

    // Annualized yield
    const annualized_yield_pct = total_all > 0 ? (total_income / total_all) * 12 : 0

    const variance = m === 0 ? 0 : total_all - prevTotal
    prevTotal = total_all

    months.push({
      month:               monthKey(monthDate),
      label:               monthLabel(monthDate),
      sfr,
      mfr,
      raw_land,
      and,
      finished_lots,
      hhh,
      land_bucket,
      total_loans,
      total_all,
      variance,
      new_originations_sfr: 0,
      new_originations_mfr: 0,
      forecasted_sfr,
      forecasted_mfr,
      yield_active,
      yield_projected,
      yield_land_bucket,
      profit_sharing,
      total_income,
      annualized_yield_pct,
    })
  }

  return {
    months,
    as_of_date:        asOfDate,
    version_label:     versionLabel,
    total_active_loans: loans.length,
    current_balances:  currentBalances,
  }
}
