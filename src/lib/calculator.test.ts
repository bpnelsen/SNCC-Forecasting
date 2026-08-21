import { describe, it, expect } from 'vitest'
import { addMonths, format, startOfMonth } from 'date-fns'
import { runForecast, type ForecastInput } from './calculator'
import type {
  Loan, LoanProgram, Builder, ForecastSettings, NewOriginationEntry, AAndDLoan,
} from './types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * The engine always anchors the horizon to the CURRENT month, so tests build
 * month keys relative to now rather than hardcoding dates (which would rot).
 */
const monthKey = (offset: number) =>
  format(addMonths(startOfMonth(new Date()), offset), 'yyyy-MM')

const SF_PROGRAM: LoanProgram = {
  id: 'prog-sf',
  name: 'SFR Construction',
  product_type: 'SF',
  // One-month full draw keeps the arithmetic obvious: a cohort's balance is
  // exactly count × amount for every month of its term.
  draw_curve: [1],
  default_rate: 0.06,
  default_term_months: 12,
  notes: null,
}

const BUILDER: Builder = {
  id: 'builder-1',
  name: 'Arive',
  default_absorption_rate: 0,
  default_loan_program_id: 'prog-sf',
  parent_company_id: null,
  notes: null,
}

const SETTINGS: ForecastSettings = {
  id: 'settings-1',
  start_date: monthKey(0) + '-01',
  horizon_months: 12,
  default_rate_vertical: 0.05,
  default_rate_land: 0.05,
  is_active: true,
}

function baseInput(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    loans: [],
    landBucketProjects: [],
    builders: [BUILDER],
    loanPrograms: [SF_PROGRAM],
    newOriginations: [],
    hhhJvProjects: [],
    aAndDLoans: [],
    parentCompanies: [],
    parentCompanyPatterns: [],
    borrowerParentMappings: [],
    settings: SETTINGS,
    versionLabel: 'test',
    asOfDate: '2026-01-01',
    ...over,
  }
}

function origination(over: Partial<NewOriginationEntry> = {}): NewOriginationEntry {
  return {
    id: 'orig-1',
    builder_id: BUILDER.id,
    land_bucket_project_id: null,
    development_name: null,
    month: monthKey(0),
    loan_count: 5,
    avg_loan_amount: 100_000,
    loan_program_id: 'prog-sf',
    interest_rate: null,
    total_lots: null,
    end_month: null,
    monthly_mode: 'fixed',
    monthly_schedule: {},
    notes: null,
    ...over,
  } as NewOriginationEntry
}

function aAndDLoan(over: Partial<AAndDLoan> = {}): AAndDLoan {
  return {
    id: 'aad-1',
    name: 'Test A&D',
    builder_id: BUILDER.id,
    initial_balance: 1_000_000,
    total_loan_amount: 10_000_000,
    total_lots: 100,
    lot_release_premium_pct: 110,
    interest_rate: 0.06,
    origination_date: `${monthKey(0)}-01`,
    draw_period_months: 10,
    release_start_date: null,
    release_period_months: 12,
    draw_schedule: {},
    release_schedule: {},
    notes: null,
    ...over,
  } as AAndDLoan
}

// ─── Regression: past-dated new-origination entries ──────────────────────────

describe('new originations with a start month before the horizon', () => {
  it('keeps contributing instead of vanishing from the forecast', () => {
    // A 100-lot pool that started 6 months ago at 5 loans/month has 70 lots
    // left. The old code dropped the entry entirely because its start month
    // wasn't in the horizon, so every month that rolled by deleted another
    // planned development from the forecast.
    const result = runForecast(baseInput({
      newOriginations: [origination({
        month: monthKey(-6),
        loan_count: 5,
        total_lots: 100,
        avg_loan_amount: 100_000,
      })],
    }))

    expect(result.months[0].forecasted_sfr).toBeGreaterThan(0)
  })

  it('fast-forwards the lot pool by what was already originated', () => {
    // 6 elapsed months × 5/month = 30 consumed, so 70 of the 100 lots remain.
    // The horizon has to be long enough to drain them (70 / 5 = 14 months) or
    // the horizon length, not the pool, would be what limits the total.
    const result = runForecast(baseInput({
      settings: { ...SETTINGS, horizon_months: 24 },
      newOriginations: [origination({
        month: monthKey(-6),
        loan_count: 5,
        total_lots: 100,
        avg_loan_amount: 100_000,
      })],
    }))

    const totalOriginated = result.months.reduce(
      (sum, m) => sum + m.new_origs_by_segment.sfr.count, 0)
    // 70, not 100 — clamping the start to month 0 without fast-forwarding the
    // pool would re-originate lots that were already used up.
    expect(totalOriginated).toBe(70)
  })

  it('is limited by the horizon when the remaining pool outlasts it', () => {
    // Same entry, 12-month horizon: 60 originated, 10 lots still pending.
    const result = runForecast(baseInput({
      newOriginations: [origination({
        month: monthKey(-6),
        loan_count: 5,
        total_lots: 100,
        avg_loan_amount: 100_000,
      })],
    }))

    const totalOriginated = result.months.reduce(
      (sum, m) => sum + m.new_origs_by_segment.sfr.count, 0)
    expect(totalOriginated).toBe(60)
  })

  it('skips an entry whose pool was already exhausted before the horizon', () => {
    // 20 lots at 5/month finishes in 4 months, all of it 10 months ago.
    const result = runForecast(baseInput({
      newOriginations: [origination({
        month: monthKey(-10),
        loan_count: 5,
        total_lots: 20,
      })],
    }))

    expect(result.months[0].forecasted_sfr).toBe(0)
  })

  it('skips an entry whose end_month already passed', () => {
    const result = runForecast(baseInput({
      newOriginations: [origination({
        month: monthKey(-8),
        end_month: monthKey(-2),
        loan_count: 5,
        total_lots: null,
      })],
    }))

    expect(result.months[0].forecasted_sfr).toBe(0)
  })

  it('still ignores an entry starting after the horizon ends', () => {
    const result = runForecast(baseInput({
      newOriginations: [origination({ month: monthKey(48) })],
    }))

    expect(result.months.every(m => m.forecasted_sfr === 0)).toBe(true)
  })

  it('honours a monthly_schedule for the pre-horizon months', () => {
    // Only 3 loans were scheduled before the horizon, so 97 of the 100-lot
    // pool should remain — a fixed-rate assumption would wrongly consume 15.
    const result = runForecast(baseInput({
      newOriginations: [origination({
        month: monthKey(-3),
        monthly_mode: 'schedule',
        monthly_schedule: { [monthKey(-3)]: 1, [monthKey(-2)]: 1, [monthKey(-1)]: 1, [monthKey(0)]: 4 },
        loan_count: 5,
        total_lots: 100,
      })],
    }))

    expect(result.months[0].new_origs_by_segment.sfr.count).toBe(4)
  })
})

// ─── Regression: A&D loans originated before the horizon ─────────────────────

describe('A&D loan originated before the forecast window', () => {
  it('does not restart its draw ramp at month 0', () => {
    const past = aAndDLoan({ origination_date: `${monthKey(-8)}-01` })
    const fresh = aAndDLoan({ origination_date: `${monthKey(0)}-01` })

    const pastResult = runForecast(baseInput({ aAndDLoans: [past] }))
    const freshResult = runForecast(baseInput({ aAndDLoans: [fresh] }))

    // A loan opened 8 months ago has drawn 8 of its 10 draw months, so its
    // month-0 balance must be well above a brand-new loan's initial balance.
    expect(pastResult.months[0].and).toBeGreaterThan(freshResult.months[0].and)
    expect(freshResult.months[0].and).toBeCloseTo(1_000_000, 0)
  })

  it('catches up to roughly the right point on the draw ramp', () => {
    // peak = max(1M, 10M × 0.9) = 9M; draws = 8M over 10 months = 800k/month.
    // 8 elapsed months → 1M + 6.4M = 7.4M.
    const result = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-8)}-01` })],
    }))

    expect(result.months[0].and).toBeCloseTo(7_400_000, 0)
  })

  it('caps the caught-up balance at peak', () => {
    // 40 months elapsed but only a 10-month draw period — must not exceed 9M.
    const result = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-40)}-01` })],
    }))

    expect(result.months[0].and).toBeLessThanOrEqual(9_000_000)
    expect(result.months[0].and).toBeCloseTo(9_000_000, 0)
  })

  it('replays lot releases that happened before the horizon', () => {
    // Releases started 6 months ago: 100 lots / 12 months ≈ 8/month, so ~48
    // lots have paid down at (10M/100 × 1.10) = 110k each ≈ 5.28M.
    const withReleases = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({
        origination_date: `${monthKey(-12)}-01`,
        release_start_date: `${monthKey(-6)}-01`,
      })],
    }))
    const withoutReleases = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-12)}-01` })],
    }))

    expect(withReleases.months[0].and).toBeLessThan(withoutReleases.months[0].and)
  })
})

// ─── Regression: horizon guard ───────────────────────────────────────────────

describe('horizon_months validation', () => {
  for (const bad of [0, -3, Number.NaN]) {
    it(`throws an actionable error for horizon_months = ${bad}`, () => {
      // Used to produce an empty months array and then a TypeError on
      // monthly[0], surfacing as an opaque 500 from /api/calculate.
      expect(() => runForecast(baseInput({
        settings: { ...SETTINGS, horizon_months: bad },
      }))).toThrow(/horizon_months must be at least 1/)
    })
  }

  it('accepts a horizon of exactly 1', () => {
    const result = runForecast(baseInput({
      settings: { ...SETTINGS, horizon_months: 1 },
    }))
    expect(result.months).toHaveLength(1)
  })
})

// ─── Data-quality counters ───────────────────────────────────────────────────

describe('data-quality counters', () => {
  const loan = (over: Partial<Loan>): Loan => ({
    loan_number: 'L1',
    borrower: 'Someone',
    loan_program: 'Single Family',
    original_loan_amount: 0,
    loan_funded_date: null,
    current_loan_due_date: `${monthKey(6)}-01`,
    current_loan_amount: 100,
    loan_amount_disbursed: 100,
    loan_amount_remaining: 0,
    interest_reserve_balance: 0,
    current_interest_rate: 0.05,
    interest_accrued_mtd: 0,
    project_name: null,
    unit_name: null,
    development_name: null,
    subdivision_name: null,
    projected_balance: 100,
    loan_type: 'SFR',
    ...over,
  } as Loan)

  it('counts unclassified loans, which are dropped from portfolio totals', () => {
    const result = runForecast(baseInput({
      loans: [
        loan({ loan_number: 'A', loan_type: 'SFR' }),
        loan({ loan_number: 'B', loan_type: 'UNKNOWN' }),
        loan({ loan_number: 'C', loan_type: 'UNKNOWN' }),
      ],
    }))

    expect(result.unclassified_loan_count).toBe(2)
    // The behaviour the count is warning about: hhh_existing is hardcoded to 0,
    // so an UNKNOWN loan contributes to no segment at all — its balance simply
    // goes missing from the dashboard rather than landing in the wrong bucket.
    expect(result.months[0].hhh).toBe(0)
    expect(result.months[0].sfr).toBeGreaterThan(0)
  })

  it('counts loans with no maturity date, which never pay off', () => {
    const result = runForecast(baseInput({
      loans: [
        loan({ loan_number: 'A' }),
        loan({ loan_number: 'B', current_loan_due_date: null }),
      ],
    }))

    expect(result.no_maturity_loan_count).toBe(1)
    // A loan with no maturity is still on the books in the final month.
    const last = result.months[result.months.length - 1]
    expect(last.sfr).toBeGreaterThan(0)
  })
})
