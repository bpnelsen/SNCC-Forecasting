import { describe, it, expect } from 'vitest'
import { addMonths, format, startOfMonth } from 'date-fns'
import {
  runForecast, originationsInMonth, effectiveDraw, previewLandBucketProject, type ForecastInput,
} from './calculator'
import { totalOutstandingAll } from './summary'
import type {
  Loan, LoanProgram, Builder, ForecastSettings, NewOriginationEntry, AAndDLoan, LandBucketProject,
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
  // The catch-up still drives the A&D tab's own projection of the loan, so it
  // is asserted on the loan's schedule. What changed is that such a loan no
  // longer adds to the forecast TOTAL: it should already be in the imported
  // loan report, and adding it again double-counted it.
  const m0 = (r: ReturnType<typeof runForecast>) =>
    r.a_and_d_schedules[0].months[0].starting_balance

  it('does not restart its draw ramp at month 0', () => {
    const past = aAndDLoan({ origination_date: `${monthKey(-8)}-01` })
    const fresh = aAndDLoan({ origination_date: `${monthKey(0)}-01` })

    const pastResult = runForecast(baseInput({ aAndDLoans: [past] }))
    const freshResult = runForecast(baseInput({ aAndDLoans: [fresh] }))

    // A loan opened 8 months ago has drawn 8 of its 10 draw months, so its
    // month-0 balance must be well above a brand-new loan's initial balance.
    expect(m0(pastResult)).toBeGreaterThan(m0(freshResult))
    expect(m0(freshResult)).toBeCloseTo(1_000_000, 0)
  })

  it('catches up to roughly the right point on the draw ramp', () => {
    // peak = max(1M, 10M × 0.9) = 9M; draws = 8M over 10 months = 800k/month.
    // 8 elapsed months → 1M + 6.4M = 7.4M.
    const result = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-8)}-01` })],
    }))

    expect(m0(result)).toBeCloseTo(7_400_000, 0)
  })

  it('caps the caught-up balance at peak', () => {
    // 40 months elapsed but only a 10-month draw period — must not exceed 9M.
    const result = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-40)}-01` })],
    }))

    expect(m0(result)).toBeLessThanOrEqual(9_000_000)
    expect(m0(result)).toBeCloseTo(9_000_000, 0)
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

    expect(m0(withReleases)).toBeLessThan(m0(withoutReleases))
  })

  it('is kept out of the forecast total, since it is already on the books', () => {
    const result = runForecast(baseInput({
      aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(-8)}-01` })],
    }))
    expect(result.a_and_d_schedules[0].forecast_scale).toBe(0)
    expect(result.months.every(m => m.a_and_d_planned === 0)).toBe(true)
    expect(result.months.every(m => m.and === 0)).toBe(true)
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

// ─── originationsInMonth: the figure the New Originations UI shows ───────────

describe('originationsInMonth', () => {
  const thisMonth = monthKey(0)

  it('reports the fixed-mode count for the current month', () => {
    const r = originationsInMonth(origination({ month: monthKey(-2), loan_count: 5, total_lots: null }), thisMonth)
    expect(r.count).toBe(5)
  })

  it('reports 0 with a reason when the schedule has no entry for the month', () => {
    const r = originationsInMonth(origination({
      month: monthKey(-2),
      monthly_mode: 'schedule',
      monthly_schedule: { [monthKey(-2)]: 4 },   // nothing for this month
      total_lots: null,
    }), thisMonth)
    expect(r.count).toBe(0)
    expect(r.reason).toContain('No per-month count set')
  })

  it('reports 0 when the series starts later', () => {
    const r = originationsInMonth(origination({ month: monthKey(3) }), thisMonth)
    expect(r.count).toBe(0)
    expect(r.reason).toContain('after')
  })

  it('reports 0 when end_month has already passed', () => {
    const r = originationsInMonth(origination({ month: monthKey(-6), end_month: monthKey(-2) }), thisMonth)
    expect(r.count).toBe(0)
    expect(r.reason).toContain('End Month')
  })

  it('reports 0 when the lot pool was exhausted before this month', () => {
    // 20 lots at 5/month finishes four months in, all of it before now.
    const r = originationsInMonth(origination({
      month: monthKey(-10), loan_count: 5, total_lots: 20,
    }), thisMonth)
    expect(r.count).toBe(0)
    expect(r.reason).toContain('Cap')
  })

  it('clamps to whatever is left of the lot pool', () => {
    // Started 2 months ago at 5/month = 10 consumed, cap 12 -> only 2 left.
    const r = originationsInMonth(origination({
      month: monthKey(-2), loan_count: 5, total_lots: 12,
    }), thisMonth)
    expect(r.count).toBe(2)
  })

  it('agrees with what runForecast actually originates this month', () => {
    // The whole point of sharing this helper: the number shown in the UI must
    // match the number the dashboard forecasts, for every one of these shapes.
    const cases: Partial<NewOriginationEntry>[] = [
      { month: monthKey(0), loan_count: 3, total_lots: null },
      { month: monthKey(-2), loan_count: 5, total_lots: null },
      { month: monthKey(-2), loan_count: 5, total_lots: 12 },
      { month: monthKey(-10), loan_count: 5, total_lots: 20 },
      { month: monthKey(3), loan_count: 4, total_lots: null },
      { month: monthKey(-6), loan_count: 4, end_month: monthKey(-2), total_lots: null },
      {
        month: monthKey(-3), monthly_mode: 'schedule', total_lots: null,
        monthly_schedule: { [monthKey(-3)]: 1, [monthKey(0)]: 7 },
      },
      {
        month: monthKey(-3), monthly_mode: 'schedule', total_lots: null,
        monthly_schedule: { [monthKey(-3)]: 1 },
      },
    ]

    for (const over of cases) {
      const entry = origination(over)
      const helper = originationsInMonth(entry, thisMonth)
      const forecast = runForecast(baseInput({ newOriginations: [entry] }))
      expect(
        forecast.months[0].new_origs_by_segment.sfr.count,
        `mismatch for ${JSON.stringify(over)} — reason: ${helper.reason}`,
      ).toBe(helper.count)
    }
  })
})

// ─── Draw curve: what the UI reports vs what the engine uses ─────────────────

describe('effectiveDraw', () => {
  // A 24-entry curve summing to 0.90, where the back 12 entries carry 0.30.
  const CURVE_24 = [...Array(12).fill(0.05), ...Array(12).fill(0.025)]

  it('truncates the curve at the term, matching the engine peak', () => {
    // The raw array says "24 months, 90%". On a 12-month term the engine only
    // ever applies the first 12 entries, so each loan peaks at 60% — a 30-point
    // overstatement if you read the raw sum off the array.
    const program: LoanProgram = {
      ...SF_PROGRAM, draw_curve: CURVE_24, default_term_months: 12,
    }
    const eff = effectiveDraw(program)
    expect(eff.drawMonths).toBe(12)
    expect(eff.deadMonths).toBe(12)
    expect(eff.pct).toBeCloseTo(0.60, 6)
    expect(eff.rawPct).toBeCloseTo(0.90, 6)

    // Prove it against the engine rather than trusting the arithmetic: one
    // cohort of 10 × $100k = $1.0M of commitment.
    const result = runForecast(baseInput({
      loanPrograms: [program],
      newOriginations: [origination({
        loan_count: 10, avg_loan_amount: 100_000,
        total_lots: 10, end_month: monthKey(0),
      })],
      settings: { ...SETTINGS, horizon_months: 30 },
    }))
    const peak = Math.max(...result.months.map(m => m.forecasted_sfr))
    expect(peak).toBeCloseTo(1_000_000 * eff.pct, 0)
  })

  it('reports the full curve when the term covers it', () => {
    const eff = effectiveDraw({ draw_curve: CURVE_24, default_term_months: 24 })
    expect(eff.drawMonths).toBe(24)
    expect(eff.deadMonths).toBe(0)
    expect(eff.pct).toBeCloseTo(0.90, 6)
  })

  it('flags a curve that overfunds, since the engine clamps it at 100%', () => {
    const eff = effectiveDraw({ draw_curve: [0.7, 0.7], default_term_months: 12 })
    expect(eff.clamped).toBe(true)
    expect(eff.pct).toBe(1)
    expect(eff.rawPct).toBeCloseTo(1.4, 6)
  })
})

// ─── New Originations actually drive balances off the program draw curve ─────

describe('new originations draw against their loan program curve', () => {
  // A deliberately lumpy curve so the monthly series is a recognisable
  // fingerprint of the curve rather than a plausible-looking ramp.
  const LUMPY: number[] = [0.25, 0.50, 0.25]

  const program = (over: Partial<LoanProgram> = {}): LoanProgram => ({
    ...SF_PROGRAM, draw_curve: LUMPY, default_term_months: 6, ...over,
  })

  // One cohort of 10 loans × $100k, originated in month 0 and then stopped,
  // so the whole series comes from a single cohort ageing through the curve.
  const oneCohort = (over: Partial<NewOriginationEntry> = {}) => origination({
    loan_count: 10,
    avg_loan_amount: 100_000,
    total_lots: 10,
    end_month: monthKey(0),
    ...over,
  })

  it('reproduces the curve month by month, then drops at the term', () => {
    const result = runForecast(baseInput({
      loanPrograms: [program()],
      newOriginations: [oneCohort()],
      settings: { ...SETTINGS, horizon_months: 8 },
    }))
    const series = result.months.map(m => Math.round(m.forecasted_sfr))

    // cumulativeDraw is the running sum of the curve, clamped at 1, and the
    // cohort holds that balance until age === default_term_months (6).
    expect(series).toEqual([
      250_000,    // age 0 → 0.25
      750_000,    // age 1 → 0.75
      1_000_000,  // age 2 → 1.00 (curve exhausted)
      1_000_000,  // age 3 → holds
      1_000_000,  // age 4
      1_000_000,  // age 5
      0,          // age 6 → term reached, balance zeroed
      0,
    ])
  })

  it('follows the curve it is given — a different curve moves the numbers', () => {
    const front = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [1] })],
      newOriginations: [oneCohort()],
      settings: { ...SETTINGS, horizon_months: 3 },
    })).months.map(m => Math.round(m.forecasted_sfr))

    const back = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [0, 0, 1] })],
      newOriginations: [oneCohort()],
      settings: { ...SETTINGS, horizon_months: 3 },
    })).months.map(m => Math.round(m.forecasted_sfr))

    expect(front).toEqual([1_000_000, 1_000_000, 1_000_000])
    expect(back).toEqual([0, 0, 1_000_000])
  })

  it('falls back to the builder default program when the entry names none', () => {
    // The entry points at no program; the builder points at 'prog-alt'. If
    // resolution were broken this would silently use the SF fallback instead,
    // which has a different curve.
    const alt = program({ id: 'prog-alt', name: 'Alt', draw_curve: [0, 1] })
    const result = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [1] }), alt],
      builders: [{ ...BUILDER, default_loan_program_id: 'prog-alt' }],
      newOriginations: [oneCohort({ loan_program_id: null })],
      settings: { ...SETTINGS, horizon_months: 2 },
    }))
    expect(result.months.map(m => Math.round(m.forecasted_sfr))).toEqual([0, 1_000_000])
  })

  it('honours an explicit program over the builder default', () => {
    const alt = program({ id: 'prog-alt', name: 'Alt', draw_curve: [0, 1] })
    const result = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [1] }), alt],
      builders: [{ ...BUILDER, default_loan_program_id: 'prog-alt' }],
      newOriginations: [oneCohort({ loan_program_id: 'prog-sf' })],
      settings: { ...SETTINGS, horizon_months: 2 },
    }))
    expect(result.months.map(m => Math.round(m.forecasted_sfr))).toEqual([1_000_000, 1_000_000])
  })

  it('scales with loan count and avg amount, not just with the curve', () => {
    const result = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [0.5] })],
      newOriginations: [oneCohort({
        loan_count: 3, total_lots: 3, avg_loan_amount: 250_000,
      })],
      settings: { ...SETTINGS, horizon_months: 1 },
    }))
    // 3 × $250k × 0.5 = $375k
    expect(Math.round(result.months[0].forecasted_sfr)).toBe(375_000)
  })

  it('applies the curve to each monthly cohort separately when recurring', () => {
    // 2 loans/month for 3 months on a front-loaded 2-month curve. Each cohort
    // ages independently, so month 2 carries cohort 0 at full draw plus
    // cohort 1 at full draw plus cohort 2 at its first month.
    const result = runForecast(baseInput({
      loanPrograms: [program({ draw_curve: [0.5, 0.5], default_term_months: 12 })],
      newOriginations: [origination({
        loan_count: 2, avg_loan_amount: 100_000,
        total_lots: 6, end_month: monthKey(2),
      })],
      settings: { ...SETTINGS, horizon_months: 3 },
    }))
    const series = result.months.map(m => Math.round(m.forecasted_sfr))
    // cohort balances (2 × $100k = $200k commitment each):
    //  m0: c0@0.5                      = 100k
    //  m1: c0@1.0 + c1@0.5             = 200k + 100k = 300k
    //  m2: c0@1.0 + c1@1.0 + c2@0.5    = 200k + 200k + 100k = 500k
    expect(series).toEqual([100_000, 300_000, 500_000])
  })
})

describe('New Originations tab totals vs forecast balances', () => {
  it('tab Total ($) is commitment; the forecast is commitment × effective draw', () => {
    // The tab's Total ($) column is count × avg_loan_amount — what the loans
    // are committed for. It deliberately does not apply the draw curve, so it
    // will not tie to the forecast whenever a curve draws to less than 100%.
    // This pins the relationship so neither side is "fixed" in isolation.
    const curve = Array(12).fill(0.05)           // 12 months, sums to 0.60
    const program: LoanProgram = {
      ...SF_PROGRAM, draw_curve: curve, default_term_months: 12,
    }
    const entry = origination({
      loan_count: 40, avg_loan_amount: 350_000,
      total_lots: 40, end_month: monthKey(0),    // one cohort, all in month 0
    })

    const commitment = 40 * 350_000              // what the tab shows: $14.0M
    const eff = effectiveDraw(program)
    expect(eff.pct).toBeCloseTo(0.60, 6)

    const result = runForecast(baseInput({
      loanPrograms: [program],
      newOriginations: [entry],
      settings: { ...SETTINGS, horizon_months: 12 },
    }))
    const peak = Math.max(...result.months.map(m => m.forecasted_sfr))

    expect(commitment).toBe(14_000_000)
    expect(Math.round(peak)).toBe(8_400_000)     // 14.0M × 0.60
    expect(peak).toBeCloseTo(commitment * eff.pct, 0)
  })
})

// ─── Dashboard: tile vs Total Outstanding (Loans) ────────────────────────────

describe('Active Loan (Outstanding) tile vs Total Outstanding (Loans) row', () => {
  // A plain SFR loan, funded, not matured, disbursed < committed.
  const existingLoan = (over: Partial<Loan> = {}): Loan => ({
    borrower: 'Acme Homes',
    loan_number: 'L-1',
    loan_program: 'SFR Construction',
    original_loan_amount: 300_000,
    loan_funded_date: `${monthKey(-3)}-01`,
    current_loan_due_date: `${monthKey(18)}-01`,
    current_loan_amount: 300_000,
    loan_amount_disbursed: 200_000,
    loan_amount_remaining: 100_000,
    interest_reserve_balance: 0,
    current_interest_rate: 0.06,
    interest_accrued_mtd: 0,
    project_name: null,
    unit_name: null,
    development_name: null,
    subdivision_name: null,
    projected_balance: 200_000,
    loan_type: 'SFR',
    number_of_lots: 1,
    release_period_months: 12,
    ...over,
  })

  it('differs by exactly the forecast layer — the tile excludes it', () => {
    // The tile is imported loans' disbursed balance. The row adds the
    // new-origination cohorts and planned A&D for that month. They are
    // different quantities, so the row being larger is expected, not a bug.
    const result = runForecast(baseInput({
      loans: [existingLoan(), existingLoan({ loan_number: 'L-2' })],
      loanPrograms: [{ ...SF_PROGRAM, draw_curve: [1], default_term_months: 24 }],
      newOriginations: [origination({
        loan_count: 4, avg_loan_amount: 250_000,
        total_lots: 4, end_month: monthKey(0),
      })],
      settings: { ...SETTINGS, horizon_months: 3 },
    }))

    const m0 = result.months[0]
    const tile = (['sfr', 'mfr', 'and', 'raw_land', 'finished_lots'] as const)
      .reduce((s, k) => s + result.active_loans_outstanding[k], 0)
    const activeOnly =
      m0.active_sfr + m0.active_mfr + m0.active_and +
      m0.active_raw_land + m0.active_finished_lots
    const forecastLayer =
      m0.forecasted_sfr + m0.forecasted_mfr + m0.forecasted_and + m0.a_and_d_planned
    const rowTotal = activeOnly + forecastLayer

    // Tile: 2 × $200k disbursed.
    expect(tile).toBe(400_000)
    // Forecast layer: 4 × $250k at a full first-month draw.
    expect(Math.round(forecastLayer)).toBe(1_000_000)
    // The row exceeds the tile by the forecast layer, and by nothing else
    // once the documented FL-basis and matured-loan deltas are zero.
    expect(result.reconciliation.fl_basis_delta).toBe(0)
    expect(result.reconciliation.matured_disbursed).toBe(0)
    expect(Math.round(rowTotal - tile)).toBe(Math.round(forecastLayer))
    expect(Math.round(rowTotal)).toBe(1_400_000)
  })

  it('keeps a matured loan on the books at month 0, then drops it', () => {
    // Month 0 deliberately has no maturity gate, so the Active rows tie to
    // the tile. The gate starts at month 1, which is what gives the segment
    // rows their month-over-month decay.
    const result = runForecast(baseInput({
      loans: [existingLoan({ current_loan_due_date: `${monthKey(-2)}-01` })],
      settings: { ...SETTINGS, horizon_months: 3 },
    }))
    expect(result.active_loans_outstanding.sfr).toBe(200_000)
    expect(result.months[0].active_sfr).toBe(200_000)
    expect(result.months[1].active_sfr).toBe(0)
    expect(result.months[2].active_sfr).toBe(0)
  })
})

// ─── This month's anticipated originations are prorated by today ─────────────

describe('current-month originations prorate by today, in every month', () => {
  // The user's rule: $10M anticipated for September. On the 15th half has
  // funded and is on the books, so the forecast carries half; on the last day
  // it carries nothing, and September ties to the Active Loan (Outstanding) tile.
  const now = startOfMonth(new Date())
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayKey = (d: number) => `${monthKey(0)}-${String(d).padStart(2, '0')}`

  const FULL_DRAW: LoanProgram = { ...SF_PROGRAM, draw_curve: [1], default_term_months: 24 }

  // $10M anticipated: 10 loans × $1M, all in the current month.
  const tenMillionThisMonth = origination({
    loan_count: 10, avg_loan_amount: 1_000_000,
    total_lots: 10, end_month: monthKey(0),
  })

  const run = (today: string, over: Partial<ForecastInput> = {}) => runForecast(baseInput({
    loanPrograms: [FULL_DRAW],
    newOriginations: [tenMillionThisMonth],
    settings: { ...SETTINGS, horizon_months: 3 },
    today,
    ...over,
  }))

  it('carries the unelapsed share on the 15th — this month and after', () => {
    const r = run(dayKey(15))
    const expected = 10_000_000 * (daysInMonth - 15) / daysInMonth
    expect(r.months[0].forecasted_sfr).toBeCloseTo(expected, 0)
    // Not back to 100% next month: the funded half is in the loan report for
    // the rest of its life, so restoring it here would count it twice.
    expect(r.months[1].forecasted_sfr).toBeCloseTo(expected, 0)
    expect(r.months[2].forecasted_sfr).toBeCloseTo(expected, 0)
  })

  it('carries nothing on the last day of the month', () => {
    const r = run(dayKey(daysInMonth))
    expect(r.months.every(m => m.forecasted_sfr === 0)).toBe(true)
  })

  it('ties September Total Outstanding (Loans) to the tile on the last day', () => {
    const booked: Loan = {
      borrower: 'Acme Homes', loan_number: 'L-1', loan_program: 'SFR Construction',
      original_loan_amount: 5_000_000, loan_funded_date: `${monthKey(-2)}-01`,
      current_loan_due_date: `${monthKey(12)}-01`, current_loan_amount: 5_000_000,
      loan_amount_disbursed: 4_000_000, loan_amount_remaining: 1_000_000,
      interest_reserve_balance: 0, current_interest_rate: 0.06, interest_accrued_mtd: 0,
      project_name: null, unit_name: null, development_name: null, subdivision_name: null,
      projected_balance: 4_000_000, loan_type: 'SFR', number_of_lots: 1, release_period_months: 12,
    }
    const r = run(dayKey(daysInMonth), { loans: [booked] })
    const m = r.months[0]
    const tile = (['sfr', 'mfr', 'and', 'raw_land', 'finished_lots'] as const)
      .reduce((s, k) => s + r.active_loans_outstanding[k], 0)
    const row =
      m.active_sfr + m.active_mfr + m.active_and + m.active_raw_land + m.active_finished_lots +
      m.forecasted_sfr + m.forecasted_mfr + m.forecasted_and + m.a_and_d_planned
    expect(tile).toBe(4_000_000)
    expect(row).toBe(tile)
  })

  it('adds a cohort starting next month in full', () => {
    const r = run(dayKey(daysInMonth), {
      newOriginations: [origination({
        month: monthKey(1), loan_count: 10, avg_loan_amount: 1_000_000,
        total_lots: 10, end_month: monthKey(1),
      })],
    })
    expect(r.months[0].forecasted_sfr).toBe(0)
    expect(r.months[1].forecasted_sfr).toBe(10_000_000)
  })

  it('prorates A&D cohorts the same way, not just SFR and MFR', () => {
    const AD: LoanProgram = { ...FULL_DRAW, id: 'prog-ad', name: 'A&D', product_type: 'AD' }
    const r = run(dayKey(15), {
      loanPrograms: [AD],
      newOriginations: [{ ...tenMillionThisMonth, loan_program_id: 'prog-ad' }],
    })
    const expected = 10_000_000 * (daysInMonth - 15) / daysInMonth
    expect(r.months[0].forecasted_and).toBeCloseTo(expected, 0)
    expect(r.months[1].forecasted_and).toBeCloseTo(expected, 0)
  })

  it('prorates an A&D tab loan originating this month, and drops one from earlier', () => {
    const thisMonth = aAndDLoan({ id: 'a1', origination_date: dayKey(1) })
    const earlier   = aAndDLoan({ id: 'a2', origination_date: `${monthKey(-3)}-01` })
    const r = run(dayKey(15), { newOriginations: [], aAndDLoans: [thisMonth, earlier] })
    const frac = (daysInMonth - 15) / daysInMonth
    const [s1, s2] = r.a_and_d_schedules
    expect(s1.forecast_scale).toBeCloseTo(frac, 10)
    expect(s2.forecast_scale).toBe(0)
    // Only the this-month loan contributes, at its unelapsed share.
    expect(r.months[0].a_and_d_planned).toBeCloseTo(s1.months[0].starting_balance * frac, 0)
  })
})

// ─── Payoffs are the balance that leaves, not face ───────────────────────────

describe('payoffs', () => {
  const partlyDrawn = (over: Partial<Loan> = {}): Loan => ({
    borrower: 'Acme Homes', loan_number: 'L-1', loan_program: 'SFR Construction',
    original_loan_amount: 500_000, loan_funded_date: `${monthKey(-4)}-01`,
    current_loan_due_date: `${monthKey(3)}-01`,
    current_loan_amount: 500_000,          // commitment (face)
    loan_amount_disbursed: 300_000,        // what's actually drawn
    loan_amount_remaining: 200_000, interest_reserve_balance: 0,
    current_interest_rate: 0.06, interest_accrued_mtd: 0,
    project_name: null, unit_name: null, development_name: null, subdivision_name: null,
    projected_balance: 500_000, loan_type: 'SFR', number_of_lots: 1, release_period_months: 12,
    ...over,
  })

  it('pays an existing loan off at its drawn balance, not its commitment', () => {
    const r = runForecast(baseInput({ loans: [partlyDrawn()], settings: { ...SETTINGS, horizon_months: 5 } }))
    // Matures in month 3: the payoff is the $300K drawn, not the $500K face,
    // and exactly equals what leaves the Active SFR row that month.
    expect(r.months[3].payoffs_by_segment.sfr).toBe(300_000)
    expect(r.months[2].active_sfr - r.months[3].active_sfr).toBe(300_000)
    expect(r.months.reduce((s, m) => s + m.payoffs_by_segment.sfr, 0)).toBe(300_000)
  })

  it('pays a cohort off at its drawn balance under the curve, not full commitment', () => {
    // 10 × $100K = $1M committed, on a curve that draws 5%/month to 60% over
    // a 12-month term. Starting next month keeps this-month proration out.
    const program: LoanProgram = { ...SF_PROGRAM, draw_curve: Array(12).fill(0.05), default_term_months: 12 }
    const r = runForecast(baseInput({
      loanPrograms: [program],
      newOriginations: [origination({
        month: monthKey(1), loan_count: 10, avg_loan_amount: 100_000,
        total_lots: 10, end_month: monthKey(1),
      })],
      settings: { ...SETTINGS, horizon_months: 15 },
    }))
    const payoffMonth = 1 + 12
    expect(Math.round(r.months[payoffMonth].payoffs_by_segment.sfr)).toBe(600_000)
    // What paid off is what left the forecast.
    expect(Math.round(r.months[payoffMonth - 1].forecasted_sfr)).toBe(600_000)
    expect(r.months[payoffMonth].forecasted_sfr).toBe(0)
  })

  it('does not pay off a this-month cohort the forecast no longer carries', () => {
    // On the last day of the month the forecast carries 0% of this month's
    // cohort — it's in the loan report and pays off there. Paying it off
    // again at term counted it twice.
    const now = startOfMonth(new Date())
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const r = runForecast(baseInput({
      loanPrograms: [{ ...SF_PROGRAM, draw_curve: [1], default_term_months: 6 }],
      newOriginations: [origination({ loan_count: 10, avg_loan_amount: 100_000, total_lots: 10, end_month: monthKey(0) })],
      settings: { ...SETTINGS, horizon_months: 8 },
      today: `${monthKey(0)}-${dim}`,
    }))
    expect(r.months.every(m => m.payoffs_by_segment.sfr === 0)).toBe(true)
  })
})

describe('payoffs beside Total Outstanding (Loans)', () => {
  it('leave out Land-Bucket-driven cohorts, which that total excludes', () => {
    // A land bucket project selling 2 lots/month spawns vertical SFR loans.
    // Those cohorts are in total_loans but not in Total Outstanding (Loans),
    // so the Forecast tab must not show their payoffs next to it.
    const program: LoanProgram = { ...SF_PROGRAM, draw_curve: [1], default_term_months: 3 }
    const lb: LandBucketProject = {
      id: 'lb1', name: 'Willow Creek', builder_id: BUILDER.id, total_lots: 20, lot_price: 50_000,
      absorption_rate: 2, balance_outstanding: 1_000_000, interest_rate: 0.07,
      dev_start_date: null, dev_end_date: null, lot_sales_start_date: `${monthKey(0)}-01`,
      vertical_loan_program_id: program.id, vertical_loan_amount: 300_000,
      lot_release_schedule: {}, notes: null,
    }
    const r = runForecast(baseInput({
      loanPrograms: [program], landBucketProjects: [lb],
      settings: { ...SETTINGS, horizon_months: 6 },
    }))
    const all   = r.months.reduce((s, m) => s + m.payoffs_by_segment.sfr, 0)
    const loans = r.months.reduce((s, m) => s + m.payoffs_loans_by_segment.sfr, 0)
    expect(all).toBeGreaterThan(0)   // LB cohorts do pay off, for cash flow
    expect(loans).toBe(0)            // but not beside the Loans total
    expect(r.months.every(m => m.forecasted_sfr === 0)).toBe(true)
  })
})

// ─── Land Bucket projected balance increases ─────────────────────────────────

describe('Land Bucket projected balance increases', () => {
  const PARENT = 'parent-1'
  const project = (over: Partial<LandBucketProject> = {}): LandBucketProject => ({
    id: 'lb1', name: 'Willow Creek', builder_id: BUILDER.id, total_lots: 0, lot_price: 0,
    absorption_rate: 0, balance_outstanding: 1_000_000, interest_rate: 0.12,
    dev_start_date: null, dev_end_date: null, lot_sales_start_date: null,
    vertical_loan_program_id: null, vertical_loan_amount: null, lot_release_schedule: {},
    balance_increase_schedule: { [monthKey(2)]: 500_000 },
    notes: null, ...over,
  })
  const run = (over: Partial<LandBucketProject> = {}, input: Partial<ForecastInput> = {}) => runForecast(baseInput({
    landBucketProjects: [project(over)],
    builders: [{ ...BUILDER, parent_company_id: PARENT }],
    settings: { ...SETTINGS, horizon_months: 5 },
    ...input,
  }))

  it('shows in its own month and every month after', () => {
    const r = run()
    expect(r.months.map(m => m.land_bucket)).toEqual([
      1_000_000, 1_000_000, 1_500_000, 1_500_000, 1_500_000,
    ])
  })

  it('is ignored for the current month, which is already Balance Outstanding', () => {
    const r = run({ balance_increase_schedule: { [monthKey(0)]: 500_000 } })
    expect(r.months.every(m => m.land_bucket === 1_000_000)).toBe(true)
  })

  it('carries into Total Outstanding (All), Total (All) and the parent slice', () => {
    const base = run({ balance_increase_schedule: {} })
    const r = run()
    expect(r.months[2].total_all - base.months[2].total_all).toBe(500_000)
    expect(totalOutstandingAll(r.months[2]) - totalOutstandingAll(base.months[2])).toBe(500_000)
    expect(r.months[2].by_parent[PARENT].land_bucket).toBe(1_500_000)
  })

  it('earns interest from its month, and is cash out that month', () => {
    const base = run({ balance_increase_schedule: {} })
    const r = run()
    // 12% on the extra $500K = $5,000 a month, from month 2.
    expect(r.months[1].total_income - base.months[1].total_income).toBeCloseTo(0, 6)
    expect(r.months[2].total_income - base.months[2].total_income).toBeCloseTo(5_000, 6)
    // Funding the increase is an outflow in its month, less that month's interest.
    expect(r.months[2].cash_flow - base.months[2].cash_flow).toBeCloseTo(-500_000 + 5_000, 6)
  })

  it('still pays down with lot sales', () => {
    // 1 lot a month at $100K from month 1.
    const r = run({
      total_lots: 10, lot_price: 100_000,
      lot_release_schedule: { [monthKey(1)]: 1, [monthKey(2)]: 1, [monthKey(3)]: 1 },
    })
    // m1 opens 1.0M, sells 100K → 900K; m2 opens 900K + 500K = 1.4M, sells → 1.3M; m3 opens 1.3M.
    expect(r.months.slice(0, 4).map(m => m.land_bucket)).toEqual([1_000_000, 1_000_000, 1_400_000, 1_300_000])
  })

  it('previews in the editor exactly as the forecast computes it', () => {
    const p = project({
      total_lots: 10, lot_price: 100_000,
      lot_release_schedule: { [monthKey(1)]: 1, [monthKey(3)]: 2 },
      balance_increase_schedule: { [monthKey(2)]: 500_000, [monthKey(4)]: 250_000 },
    })
    const forecast = runForecast(baseInput({
      landBucketProjects: [p], settings: { ...SETTINGS, horizon_months: 5 },
    })).land_bucket_schedules[0].months
    const preview = previewLandBucketProject(p, [BUILDER], [SF_PROGRAM], 5)
    expect(preview).toEqual(forecast)
  })
})

// ─── Dashboard horizon selector (6 / 9 / 12 / 18 / 24) ───────────────────────

describe('forecast horizon', () => {
  // A mixed book: an imported loan maturing mid-horizon, recurring new
  // originations, a land bucket project with sales and an increase, and an
  // A&D tab loan — every source that evolves month to month.
  const book = (horizon: number) => runForecast(baseInput({
    loans: [{
      borrower: 'Acme', loan_number: 'L-1', loan_program: 'SFR', original_loan_amount: 400_000,
      loan_funded_date: `${monthKey(-3)}-01`, current_loan_due_date: `${monthKey(8)}-01`,
      current_loan_amount: 400_000, loan_amount_disbursed: 250_000, loan_amount_remaining: 150_000,
      interest_reserve_balance: 0, current_interest_rate: 0.07, interest_accrued_mtd: 0,
      project_name: null, unit_name: null, development_name: null, subdivision_name: null,
      projected_balance: 400_000, loan_type: 'SFR', number_of_lots: 1, release_period_months: 12,
    }],
    loanPrograms: [{ ...SF_PROGRAM, draw_curve: Array(10).fill(0.1), default_term_months: 9 }],
    newOriginations: [origination({ loan_count: 3, avg_loan_amount: 300_000, total_lots: 40 })],
    landBucketProjects: [{
      id: 'lb1', name: 'Willow', builder_id: BUILDER.id, total_lots: 30, lot_price: 80_000,
      absorption_rate: 2, balance_outstanding: 2_000_000, interest_rate: 0.09,
      dev_start_date: null, dev_end_date: null, lot_sales_start_date: `${monthKey(4)}-01`,
      vertical_loan_program_id: SF_PROGRAM.id, vertical_loan_amount: 250_000,
      lot_release_schedule: {}, balance_increase_schedule: { [monthKey(3)]: 400_000 }, notes: null,
    }],
    aAndDLoans: [aAndDLoan({ origination_date: `${monthKey(2)}-01` })],
    settings: { ...SETTINGS, horizon_months: horizon },
  }))

  it('returns exactly the chosen number of months', () => {
    for (const h of [6, 9, 12, 18, 24]) expect(book(h).months).toHaveLength(h)
  })

  it('agrees month for month with a longer run — a shorter horizon only drops months', () => {
    const full = book(24)
    for (const h of [6, 9, 12, 18]) {
      expect(book(h).months).toEqual(full.months.slice(0, h))
    }
  })

  it('takes the peak from the chosen months only', () => {
    // What the Total Portfolio tile shows as "Peak".
    const peakOf = (h: number) => Math.max(...book(h).months.map(m => m.total_all))
    const full = book(24).months.map(m => m.total_all)
    for (const h of [6, 12]) expect(peakOf(h)).toBe(Math.max(...full.slice(0, h)))
  })
})
