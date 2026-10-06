import { describe, it, expect } from 'vitest'
import { addMonths, format, startOfMonth } from 'date-fns'
import {
  runForecast, prorateDrawCurve, payoffMonthsFor, loanPayoffPlan, type ForecastInput,
} from './calculator'
import type {
  Loan, LoanProgram, Builder, ForecastSettings, NewOriginationEntry, PayoffSchedule,
} from './types'

// The engine anchors to the current month, so build month keys relative to now.
const monthKey = (offset: number) =>
  format(addMonths(startOfMonth(new Date()), offset), 'yyyy-MM')

// 12-month program drawing 1/12 a month — compressing it is easy to check.
const SF_PROGRAM: LoanProgram = {
  id: 'prog-sf', name: 'SFR Construction', product_type: 'SF',
  draw_curve: Array(12).fill(1 / 12), default_rate: 0.06, default_term_months: 12, notes: null,
}

const PARENT = { id: 'parent-acme', name: 'Acme', notes: null }

const BUILDER: Builder = {
  id: 'builder-1', name: 'Acme Builder', default_absorption_rate: 0,
  default_loan_program_id: 'prog-sf', parent_company_id: PARENT.id, notes: null,
}

const SETTINGS: ForecastSettings = {
  id: 'settings-1', start_date: monthKey(0) + '-01', horizon_months: 8,
  default_rate_vertical: 0.05, default_rate_land: 0.05, is_active: true,
}
const HISTORICAL: ForecastSettings = { ...SETTINGS, payoff_mode: 'historical' }

const loan = (over: Partial<Loan> = {}): Loan => ({
  borrower: 'Acme Homes', loan_number: 'L-1', loan_program: 'SFR Construction',
  original_loan_amount: 300_000,
  loan_funded_date: `${monthKey(-3)}-01`,
  current_loan_due_date: `${monthKey(18)}-01`,
  current_loan_amount: 300_000, loan_amount_disbursed: 200_000, loan_amount_remaining: 100_000,
  interest_reserve_balance: 0, current_interest_rate: 0.06, interest_accrued_mtd: 0,
  project_name: null, unit_name: null, development_name: null, subdivision_name: null,
  projected_balance: 200_000, loan_type: 'SFR', number_of_lots: 1, release_period_months: 12,
  ...over,
})

const schedule = (over: Partial<PayoffSchedule> = {}): PayoffSchedule => ({
  parent_company_id: PARENT.id, loan_type: 'SFR', payoff_months: 6, ...over,
})

function input(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    loans: [loan()],
    landBucketProjects: [],
    builders: [BUILDER],
    loanPrograms: [SF_PROGRAM],
    newOriginations: [],
    hhhJvProjects: [],
    aAndDLoans: [],
    parentCompanies: [PARENT],
    parentCompanyPatterns: [],
    borrowerParentMappings: [{ borrower: 'Acme Homes', parent_company_id: PARENT.id }],
    payoffSchedules: [schedule()],
    settings: HISTORICAL,
    versionLabel: 'test',
    asOfDate: '2026-01-01',
    ...over,
  }
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01)

describe('prorateDrawCurve', () => {
  it('compresses a curve into fewer months, keeping its total', () => {
    const out = prorateDrawCurve(Array(12).fill(1 / 12), 12, 6)
    expect(out).toHaveLength(6)
    out.forEach(v => expect(v).toBeCloseTo(1 / 6, 10))
  })

  it('stretches a curve into more months', () => {
    const out = prorateDrawCurve([0.5, 0.5], 2, 4)
    expect(out).toHaveLength(4)
    out.forEach(v => expect(v).toBeCloseTo(0.25, 10))
  })

  it('keeps the shape: a front-loaded curve stays front-loaded', () => {
    const out = prorateDrawCurve([0.6, 0.3, 0.1, 0], 4, 2)
    expect(out[0]).toBeCloseTo(0.9, 10)
    expect(out[1]).toBeCloseTo(0.1, 10)
  })

  it('handles terms that do not divide evenly', () => {
    const out = prorateDrawCurve(Array(12).fill(1 / 12), 12, 9)
    expect(out).toHaveLength(9)
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('returns the curve unchanged when the terms match or are invalid', () => {
    expect(prorateDrawCurve([0.4, 0.6], 12, 12)).toEqual([0.4, 0.6])
    expect(prorateDrawCurve([0.4, 0.6], 0, 6)).toEqual([0.4, 0.6])
  })
})

describe('payoffMonthsFor', () => {
  const rows = [
    schedule({ parent_company_id: PARENT.id, payoff_months: 6 }),
    schedule({ parent_company_id: null, payoff_months: 9 }),
  ]
  it('prefers the parent row, then the default row', () => {
    expect(payoffMonthsFor(rows, PARENT.id, 'SFR')).toBe(6)
    expect(payoffMonthsFor(rows, 'other-parent', 'SFR')).toBe(9)
    expect(payoffMonthsFor(rows, '__none__', 'SFR')).toBe(9)
  })
  it('keeps tenths', () => {
    expect(payoffMonthsFor([schedule({ payoff_months: 6.54 })], PARENT.id, 'SFR')).toBe(6.5)
  })
  it('returns null when no row covers the loan type', () => {
    expect(payoffMonthsFor(rows, PARENT.id, 'MFR')).toBeNull()
  })
})

describe('loanPayoffPlan', () => {
  const start = startOfMonth(new Date())
  it('pays off at funded + N months', () => {
    const plan = loanPayoffPlan(loan(), PARENT.id, [schedule()], [SF_PROGRAM], start)
    expect(plan?.payoff_date).toBe(`${monthKey(3)}-01`)
    expect(plan?.curve).toHaveLength(6)
  })
  it('falls back to maturity when the assumed payoff is already past', () => {
    const old = loan({ loan_funded_date: `${monthKey(-10)}-01` })
    expect(loanPayoffPlan(old, PARENT.id, [schedule()], [SF_PROGRAM], start)).toBeNull()
  })
  it('keeps tenths: whole calendar months, then the fraction in days', () => {
    const plan = loanPayoffPlan(loan(), PARENT.id, [schedule({ payoff_months: 6.5 })], [SF_PROGRAM], start)
    // funded the 1st, 3 months ago → 6 months later is the 1st of month +3,
    // plus 0.5 × 30.44 ≈ 15 days.
    expect(plan?.payoff_date).toBe(`${monthKey(3)}-16`)
    expect(plan?.payoff_months).toBe(6.5)
  })
  it('falls back to maturity without a funded date', () => {
    expect(loanPayoffPlan(loan({ loan_funded_date: null }), PARENT.id, [schedule()], [SF_PROGRAM], start)).toBeNull()
  })
})

describe('runForecast — Maturity vs Historical', () => {
  it('defaults to maturity and ignores the schedules there', () => {
    const r = runForecast(input({ settings: SETTINGS }))
    expect(r.payoff_mode).toBe('maturity')
    // Matures in month 18 — still on the books at the end of an 8-month horizon.
    expect(r.months[7].active_sfr).toBeGreaterThan(0)
  })

  it('pays an existing loan off at funded + N months in historical mode', () => {
    const r = runForecast(input())
    expect(r.payoff_mode).toBe('historical')
    // Funded 3 months ago, 6-month assumed payoff → gone from month 3.
    expect(r.months[2].active_sfr).toBeGreaterThan(0)
    expect(r.months[3].active_sfr).toBe(0)
    expect(r.months[3].sfr).toBe(0)
    expect(r.months[3].payoffs_by_segment.sfr).toBe(r.months[2].active_sfr)
  })

  it('draws along the prorated curve, reaching the ceiling by payoff', () => {
    // Prorated curve: 6 × 1/6. Age 3 now (4/6 drawn per curve), so the
    // remaining $100K draws over ages 4 and 5: $250K, then $300K.
    const r = runForecast(input())
    expect(r.months[0].active_sfr).toBe(200_000)
    near(r.months[1].active_sfr, 250_000)
    near(r.months[2].active_sfr, 300_000)
    // Maturity mode draws along the full 12-month curve — slower.
    const m = runForecast(input({ settings: SETTINGS }))
    expect(m.months[1].active_sfr).toBeLessThan(r.months[1].active_sfr)
  })

  it('keeps maturity for a loan whose assumed payoff already passed', () => {
    const r = runForecast(input({ loans: [loan({ loan_funded_date: `${monthKey(-10)}-01` })] }))
    expect(r.months[7].active_sfr).toBeGreaterThan(0)
  })

  it('keeps maturity when no schedule covers the parent or type', () => {
    const r = runForecast(input({ payoffSchedules: [schedule({ loan_type: 'MFR' })] }))
    expect(r.months[7].active_sfr).toBeGreaterThan(0)
  })

  it('applies the default row to a loan with no parent', () => {
    const r = runForecast(input({
      borrowerParentMappings: [],
      payoffSchedules: [schedule({ parent_company_id: null, payoff_months: 5 })],
    }))
    expect(r.months[1].active_sfr).toBeGreaterThan(0)
    expect(r.months[2].active_sfr).toBe(0)
  })

  it('can pay off later than maturity — historical replaces it', () => {
    const r = runForecast(input({
      loans: [loan({ current_loan_due_date: `${monthKey(1)}-01` })],
      payoffSchedules: [schedule({ payoff_months: 8 })],
    }))
    expect(r.months[1].active_sfr).toBeGreaterThan(0)
    expect(r.months[4].active_sfr).toBeGreaterThan(0)
    expect(r.months[5].active_sfr).toBe(0)
  })

  it('pays Finished Lots off in full at the assumed payoff date', () => {
    const fl = loan({ loan_type: 'FINISHED_LOTS', release_period_months: 24 })
    const r = runForecast(input({ loans: [fl], payoffSchedules: [schedule({ loan_type: 'FINISHED_LOTS' })] }))
    expect(r.months[2].active_finished_lots).toBeGreaterThan(0)
    expect(r.months[3].active_finished_lots).toBe(0)
  })

  describe('new-origination cohorts', () => {
    const entry = (over: Partial<NewOriginationEntry> = {}): NewOriginationEntry => ({
      id: 'orig-1', builder_id: BUILDER.id, land_bucket_project_id: null, development_name: null,
      // Next month keeps this-month proration out of the arithmetic.
      month: monthKey(1), loan_count: 10, avg_loan_amount: 100_000, loan_program_id: 'prog-sf',
      interest_rate: null, total_lots: 10, end_month: monthKey(1),
      monthly_mode: 'fixed', monthly_schedule: {}, notes: null,
      ...over,
    } as NewOriginationEntry)

    it('pay off after the parent\'s assumed months on a prorated curve', () => {
      const r = runForecast(input({
        loans: [], newOriginations: [entry()],
        payoffSchedules: [schedule({ payoff_months: 4 })],
      }))
      // 12 × 1/12 compressed to 4 × 1/4: $1M × 25%, 50%, 75%, 100%, then paid off.
      near(r.months[1].forecasted_sfr, 250_000)
      near(r.months[4].forecasted_sfr, 1_000_000)
      expect(r.months[5].forecasted_sfr).toBe(0)
      near(r.months[5].payoffs_by_segment.sfr, 1_000_000)
    })

    it('round a fractional assumption to whole months', () => {
      const r = runForecast(input({
        loans: [], newOriginations: [entry()],
        payoffSchedules: [schedule({ payoff_months: 3.6 })],
      }))
      // 3.6 → 4 months, same as the whole-month case above.
      near(r.months[4].forecasted_sfr, 1_000_000)
      expect(r.months[5].forecasted_sfr).toBe(0)
    })

    it('run to the program term in maturity mode', () => {
      const r = runForecast(input({
        loans: [], newOriginations: [entry()], settings: SETTINGS,
        payoffSchedules: [schedule({ payoff_months: 4 })],
      }))
      near(r.months[1].forecasted_sfr, 1_000_000 / 12)
      expect(r.months[5].forecasted_sfr).toBeGreaterThan(0)
    })
  })
})
