import { addMonths, format, parseISO, startOfMonth, isBefore } from 'date-fns'
import {
  Loan,
  LoanType,
  ProductType,
  LoanProgram,
  Builder,
  LandBucketProject,
  ForecastSettings,
  LandBucketMonth,
  LandBucketProjectSchedule,
  MonthlyBalance,
  ForecastResult,
  NewOriginationEntry,
  HHHJVProject,
  AAndDLoan,
  AAndDLoanMonth,
  AAndDLoanSchedule,
  ParentCompany,
  ParentCompanyPattern,
  BorrowerParentMapping,
  ByParentSegmentBalance,
  OriginationProjectDetail,
  OriginationProjectMonth,
} from './types'

// Key used in MonthlyBalance.by_parent for loans whose borrower didn't match
// any parent company (no explicit mapping and no pattern hit).
export const UNASSIGNED_PARENT_KEY = '__none__'

// Vertical loan amount = lot_price × this multiple. Quick default until the
// per-project / per-builder size is wired through the schema.
const DEFAULT_LOT_TO_VERTICAL_MULTIPLE = 3.0

type Segment = 'sfr' | 'mfr' | 'raw_land' | 'and' | 'finished_lots' | 'hhh'

const PRODUCT_TYPE_TO_SEGMENT: Record<ProductType, Segment> = {
  SF: 'sfr',
  MF: 'mfr',
  LOT: 'finished_lots',
  AD: 'and',
  RAW_LAND: 'raw_land',
  OTHER: 'hhh',
}

interface MonthSpec {
  date: Date
  key: string
  label: string
}

function generateMonths(start: Date, count: number): MonthSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const d = addMonths(start, i)
    return { date: d, key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') }
  })
}

function cumulativeDraw(curve: number[], ageMonths: number): number {
  if (ageMonths < 0 || curve.length === 0) return 0
  const upto = Math.min(curve.length, ageMonths + 1)
  let sum = 0
  for (let i = 0; i < upto; i++) sum += curve[i]
  return Math.min(sum, 1)
}

// ─── Module 1: Land Bucket Engine ────────────────────────────────────────────

interface LotOrigination {
  origination_month_idx: number
  count: number
  max_amount_per_loan: number
  program: LoanProgram
  project_id: string
  // Optional per-entry rate override (fraction). null = use program.default_rate.
  rate_override: number | null
  // Builder that spawned this cohort (LB project's builder, or
  // NewOriginationEntry.builder_id). Lets the parent filter attribute each
  // cohort's balance to a parent via builder → parent_company_id.
  builder_id: string | null
}

interface LandBucketRunResult {
  schedules: LandBucketProjectSchedule[]
  lotOriginations: LotOrigination[]
  totals: LandBucketMonth[]
}

function runLandBucket(
  projects: LandBucketProject[],
  buildersById: Map<string, Builder>,
  programsById: Map<string, LoanProgram>,
  months: MonthSpec[],
): LandBucketRunResult {
  const schedules: LandBucketProjectSchedule[] = []
  const lotOriginations: LotOrigination[] = []
  const totals: LandBucketMonth[] = months.map(m => ({
    month: m.key,
    label: m.label,
    lots_sold: 0,
    lots_sold_cumulative: 0,
    lots_remaining: 0,
    sale_proceeds: 0,
    starting_balance: 0,
    ending_balance: 0,
    interest_income: 0,
    new_vertical_origs_count: 0,
    new_vertical_origs_amount: 0,
  }))

  for (const project of projects) {
    const builder = project.builder_id ? buildersById.get(project.builder_id) ?? null : null
    const absorption = project.absorption_rate ?? builder?.default_absorption_rate ?? 0
    const lotSalesStart = project.lot_sales_start_date ? parseISO(project.lot_sales_start_date) : null
    const verticalProgram = project.vertical_loan_program_id
      ? programsById.get(project.vertical_loan_program_id) ?? null
      : null
    const manualSchedule = project.lot_release_schedule ?? {}
    const hasManualSchedule = Object.keys(manualSchedule).length > 0

    const monthly: LandBucketMonth[] = []
    let balance = project.balance_outstanding
    let lotsSoldCum = 0
    let absorptionAccum = 0

    for (let i = 0; i < months.length; i++) {
      const { date: monthDate, key, label } = months[i]
      const lotsRemaining = Math.max(0, project.total_lots - lotsSoldCum)
      // Captured BEFORE any sale activity this month, so month 0's starting
      // balance = project.balance_outstanding (matches the Land Bucket tab's
      // Grand total). Subsequent months pick up the prior month's ending.
      const startingBalance = balance

      // Interest computed on starting balance — fixed rate, paid current.
      const interestIncome = balance * project.interest_rate / 12

      let lotsThisMonth = 0
      if (hasManualSchedule) {
        const requested = Math.max(0, Math.floor(Number(manualSchedule[key]) || 0))
        lotsThisMonth = Math.min(requested, lotsRemaining)
        lotsSoldCum += lotsThisMonth
      } else if (lotSalesStart && monthDate >= lotSalesStart && lotsRemaining > 0 && absorption > 0) {
        absorptionAccum += absorption
        lotsThisMonth = Math.min(Math.floor(absorptionAccum), lotsRemaining)
        absorptionAccum -= lotsThisMonth
        lotsSoldCum += lotsThisMonth
      }

      const proceeds = lotsThisMonth * project.lot_price
      balance = Math.max(0, balance - proceeds)

      let newOrigsCount = 0
      let newOrigsAmount = 0
      if (lotsThisMonth > 0 && verticalProgram) {
        const amountPerLoan = project.vertical_loan_amount != null && project.vertical_loan_amount > 0
          ? project.vertical_loan_amount
          : project.lot_price * DEFAULT_LOT_TO_VERTICAL_MULTIPLE
        lotOriginations.push({
          origination_month_idx: i,
          count: lotsThisMonth,
          max_amount_per_loan: amountPerLoan,
          program: verticalProgram,
          project_id: project.id,
          rate_override: null,
          builder_id: project.builder_id,
        })
        newOrigsCount = lotsThisMonth
        newOrigsAmount = lotsThisMonth * amountPerLoan
      }

      monthly.push({
        month: key,
        label,
        lots_sold: lotsThisMonth,
        lots_sold_cumulative: lotsSoldCum,
        lots_remaining: project.total_lots - lotsSoldCum,
        sale_proceeds: proceeds,
        starting_balance: startingBalance,
        ending_balance: balance,
        interest_income: interestIncome,
        new_vertical_origs_count: newOrigsCount,
        new_vertical_origs_amount: newOrigsAmount,
      })

      const t = totals[i]
      t.lots_sold += lotsThisMonth
      t.lots_sold_cumulative += lotsSoldCum
      t.lots_remaining += project.total_lots - lotsSoldCum
      t.sale_proceeds += proceeds
      t.starting_balance += startingBalance
      t.ending_balance += balance
      t.interest_income += interestIncome
      t.new_vertical_origs_count += newOrigsCount
      t.new_vertical_origs_amount += newOrigsAmount
    }

    schedules.push({
      project_id: project.id,
      project_name: project.name,
      builder_name: builder?.name ?? null,
      total_lots: project.total_lots,
      lot_price: project.lot_price,
      absorption_rate: absorption,
      months: monthly,
    })
  }

  return { schedules, lotOriginations, totals }
}

// ─── Module 2: Vertical Loan Engine ──────────────────────────────────────────

// Months between two month-of-year dates (calendar months, signed).
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 +
         (to.getMonth() - from.getMonth())
}

// Finished Lots / Multi-Lot Lot Loan release rule. Returns the principal
// released by month index `i` (months since the forecast start). Per-month
// decrement = original_loan_amount / release_period_months — same math whether
// you think of it as "1/H of the loan" or "(lots/H) × (OLA/lots) per month".
function finishedLotsReleasedByMonth(loan: Loan, i: number): number {
  if (loan.loan_type !== 'FINISHED_LOTS') return 0
  const horizon = loan.release_period_months || 0
  if (horizon <= 0) return 0
  const perMonth = (loan.original_loan_amount || 0) / horizon
  return Math.max(0, i) * perMonth
}

// Existing portfolio loan balance for a given forecast month.
//
// Every loan contributes its actual recorded max balance to the portfolio
// regardless of builder, loan program, or funded date. We don't synthesize
// a draw curve on top of an existing loan that already has a real balance on
// the books — the draw curve is for brand-new cohorts originated from land
// bucket lot sales, which legitimately start at $0 and ramp.
//
// FINISHED_LOTS exception: caps at current_loan_amount (never pulled up by
// projected_balance) and pays down linearly by original_loan_amount /
// release_period_months per month from the forecast start. Migration 015.
//
// Returns 0 once the loan matures (monthDate >= current_loan_due_date).
function projectExistingLoanBalance(
  loan: Loan,
  monthDate: Date,
  _programs: LoanProgram[],
  startDate: Date,
): number {
  if (loan.current_loan_due_date) {
    const dueDate = parseISO(loan.current_loan_due_date)
    if (monthDate >= dueDate) return 0
  }

  if (loan.loan_type === 'FINISHED_LOTS') {
    const start = Math.max(loan.current_loan_amount, loan.loan_amount_disbursed, 0)
    const i = monthsBetween(startDate, monthDate)
    return Math.max(0, start - finishedLotsReleasedByMonth(loan, i))
  }

  const maxAmount = Math.max(
    loan.projected_balance,
    loan.current_loan_amount,
    loan.loan_amount_disbursed,
  )
  return maxAmount > 0 ? maxAmount : 0
}

// Outstanding (cash actually drawn) for an existing loan. Same maturity gate
// as projectExistingLoanBalance, but valued at loan_amount_disbursed instead
// of the committed/face amount — held flat until the loan matures, then 0.
// FINISHED_LOTS: same linear paydown as projectExistingLoanBalance.
function projectExistingLoanOutstanding(loan: Loan, monthDate: Date, startDate: Date): number {
  if (loan.current_loan_due_date) {
    const dueDate = parseISO(loan.current_loan_due_date)
    if (monthDate >= dueDate) return 0
  }
  if (loan.loan_type === 'FINISHED_LOTS') {
    const start = Math.max(loan.loan_amount_disbursed, loan.current_loan_amount, 0)
    const i = monthsBetween(startDate, monthDate)
    return Math.max(0, start - finishedLotsReleasedByMonth(loan, i))
  }
  return loan.loan_amount_disbursed > 0 ? loan.loan_amount_disbursed : 0
}

// HHH/JV project contribution for a given forecast month key ('YYYY-MM').
// balance_outstanding applies from dev_start_date's month (inclusive, or
// immediately if null) until dev_end_date's month (exclusive, or the whole
// horizon if null). YYYY-MM string compare is chronological.
function hhhJvBalanceForMonth(p: HHHJVProject, monthKey: string): number {
  const startKey = p.dev_start_date ? p.dev_start_date.slice(0, 7) : null
  const endKey   = p.dev_end_date ? p.dev_end_date.slice(0, 7) : null
  if (startKey && monthKey < startKey) return 0
  if (endKey && monthKey >= endKey) return 0
  return p.balance_outstanding > 0 ? p.balance_outstanding : 0
}

// ─── A&D loans ───────────────────────────────────────────────────────────────
// Peak balance = 90% of total_loan_amount; the loan ramps from initial_balance
// to peak over draw_period_months, then releases pay it down. Each release =
// lots × (total_loan / total_lots) × premium%. See migration 011.
const A_AND_D_PEAK_FRACTION = 0.9

// Per-loan stateful projection over the forecast horizon. Returns the
// full month-by-month schedule (used for the per-loan stacked chart) and
// the totals contributor array (used by the main loop).
function projectAAndDLoan(
  loan: AAndDLoan,
  builderName: string | null,
  months: MonthSpec[],
): { schedule: AAndDLoanSchedule; contributions: number[] } {
  const monthsOut: AAndDLoanMonth[] = []
  const contributions = new Array<number>(months.length).fill(0)

  const origKey = loan.origination_date ? loan.origination_date.slice(0, 7) : null
  const releaseKey = loan.release_start_date ? loan.release_start_date.slice(0, 7) : null
  const peak = Math.max(loan.initial_balance, loan.total_loan_amount * A_AND_D_PEAK_FRACTION)
  const totalDraws = Math.max(0, peak - loan.initial_balance)
  const linearDraw = loan.draw_period_months > 0 ? totalDraws / loan.draw_period_months : 0
  const lotReleasePrice = loan.total_lots > 0
    ? (loan.total_loan_amount / loan.total_lots) * (loan.lot_release_premium_pct / 100)
    : 0
  const linearLotsPerMonth = loan.release_period_months > 0
    ? loan.total_lots / loan.release_period_months
    : 0

  let balance = 0
  let originated = false
  let drawMonthsApplied = 0
  let lotsReleased = 0
  let lotsAcc = 0

  for (let i = 0; i < months.length; i++) {
    const monthKey = months[i].key

    // Pre-origination: contributes nothing.
    if (!origKey || monthKey < origKey) {
      monthsOut.push({
        month: monthKey,
        label: months[i].label,
        starting_balance: balance,
        draw_this_month: 0,
        lots_released: 0,
        lots_released_cum: lotsReleased,
        release_proceeds: 0,
        ending_balance: balance,
      })
      contributions[i] = balance
      continue
    }

    // First time we reach the origination month, the principal lands.
    if (!originated) {
      balance = loan.initial_balance
      originated = true
    }

    const startingBalance = balance

    // Draw phase: month between origination and release_start (or no release
    // configured), still within the draw window.
    let drawThisMonth = 0
    const inDrawWindow = (!releaseKey || monthKey < releaseKey) && drawMonthsApplied < loan.draw_period_months
    if (inDrawWindow) {
      const override = Number(loan.draw_schedule?.[monthKey] ?? 0)
      drawThisMonth = override > 0 ? override : linearDraw
      balance = Math.min(peak, balance + drawThisMonth)
      drawMonthsApplied += 1
    }

    // Release phase: at/after release_start_date, while lots remain.
    let lotsThisMonth = 0
    let proceeds = 0
    if (releaseKey && monthKey >= releaseKey && lotsReleased < loan.total_lots) {
      const override = loan.release_schedule?.[monthKey]
      if (override != null) {
        lotsThisMonth = Math.max(0, Math.floor(Number(override) || 0))
      } else if (linearLotsPerMonth > 0) {
        lotsAcc += linearLotsPerMonth
        lotsThisMonth = Math.floor(lotsAcc)
        lotsAcc -= lotsThisMonth
      }
      lotsThisMonth = Math.min(lotsThisMonth, loan.total_lots - lotsReleased)
      lotsReleased += lotsThisMonth
      proceeds = lotsThisMonth * lotReleasePrice
      balance = Math.max(0, balance - proceeds)
    }

    monthsOut.push({
      month: monthKey,
      label: months[i].label,
      starting_balance: startingBalance,
      draw_this_month: drawThisMonth,
      lots_released: lotsThisMonth,
      lots_released_cum: lotsReleased,
      release_proceeds: proceeds,
      ending_balance: balance,
    })
    // Use starting_balance so month 0 of the forecast equals the as-of value
    // (mirrors the Land Bucket starting-balance treatment).
    contributions[i] = startingBalance
  }

  return {
    schedule: {
      loan_id: loan.id,
      loan_name: loan.name,
      builder_name: builderName,
      total_lots: loan.total_lots,
      total_loan_amount: loan.total_loan_amount,
      months: monthsOut,
    },
    contributions,
  }
}

// Lot-driven origination cohort balance at month index `m`.
//
// monthZeroFraction (default 1) prorates the month-0 contribution of SF/MF
// cohorts originating in month 0 by the % of the current month still ahead
// of the import date. Dashboard tile "Forecasted SFR/MFR" shows the
// post-import portion of month 0 — per Truth 4 spec.
function lotOriginationBalance(
  orig: LotOrigination,
  m: number,
  monthZeroFraction: number = 1,
): number {
  const age = m - orig.origination_month_idx
  if (age < 0) return 0
  if (age >= orig.program.default_term_months) return 0
  const base = orig.count * orig.max_amount_per_loan * cumulativeDraw(orig.program.draw_curve, age)
  if (
    m === 0 &&
    orig.origination_month_idx === 0 &&
    (orig.program.product_type === 'SF' || orig.program.product_type === 'MF')
  ) {
    return base * monthZeroFraction
  }
  return base
}

// Percent of the current calendar month still ahead of the import date.
// Jun 15 in a 30-day June → (30 - 15) / 30 = 0.5.
//
// Returns 1 if `asOfDate` isn't in the same calendar month as the horizon's
// month 0 — the partial-month proration only makes sense when month 0 IS
// the import's month. If you uploaded last month, month 0 here is a fresh
// future month and gets the full first-month draw.
function monthZeroFraction(asOfDate: string, monthZeroStart: Date): number {
  const asOf = parseISO(asOfDate)
  if (asOf.getFullYear() !== monthZeroStart.getFullYear() ||
      asOf.getMonth() !== monthZeroStart.getMonth()) {
    return 1
  }
  const dayOfMonth = asOf.getDate()
  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate()
  return Math.max(0, Math.min(1, (daysInMonth - dayOfMonth) / daysInMonth))
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface ForecastInput {
  loans: Loan[]
  landBucketProjects: LandBucketProject[]
  builders: Builder[]
  loanPrograms: LoanProgram[]
  newOriginations: NewOriginationEntry[]
  hhhJvProjects: HHHJVProject[]
  aAndDLoans: AAndDLoan[]
  parentCompanies: ParentCompany[]
  parentCompanyPatterns: ParentCompanyPattern[]
  borrowerParentMappings: BorrowerParentMapping[]
  settings: ForecastSettings
  versionLabel: string
  asOfDate: string
}

export function runForecast(input: ForecastInput): ForecastResult {
  // forecast_settings.start_date is frozen at the row's insert time (migration
  // default date_trunc('month', current_date)). For a forward-looking tool the
  // horizon must start no earlier than the current month, otherwise the whole
  // forecast — and the in-window check for scheduled new originations — is
  // anchored to a stale month and upcoming entries fall off the end.
  const storedStart = parseISO(input.settings.start_date)
  const thisMonth = startOfMonth(new Date())
  const startDate = isBefore(storedStart, thisMonth) ? thisMonth : storedStart
  const months = generateMonths(startDate, input.settings.horizon_months)
  // Fraction of the current calendar month still ahead of the import date
  // (Truth 4): SF/MF cohorts originating in month 0 are scaled by this so
  // the Forecasted SFR/MFR rollups show the post-import portion only.
  const m0Frac = monthZeroFraction(input.asOfDate, months[0].date)

  const buildersById = new Map(input.builders.map(b => [b.id, b]))
  const programsById = new Map(input.loanPrograms.map(p => [p.id, p]))

  const lb = runLandBucket(input.landBucketProjects, buildersById, programsById, months)
  const monthIndexByKey = new Map(months.map((m, i) => [m.key, i]))

  // A&D planned loans: project each loan's lifecycle, keep per-month
  // schedules for the /a-and-d projection card, and a totals array to add
  // into the A&D segment in the main loop below.
  const aAndDSchedules: AAndDLoanSchedule[] = []
  const aAndDContribByMonth = new Array<number>(months.length).fill(0)
  for (const loan of input.aAndDLoans) {
    const builderName = loan.builder_id
      ? buildersById.get(loan.builder_id)?.name ?? null
      : null
    const { schedule, contributions } = projectAAndDLoan(loan, builderName, months)
    aAndDSchedules.push(schedule)
    for (let i = 0; i < months.length; i++) aAndDContribByMonth[i] += contributions[i]
  }

  // Imported A&D loans — flat-until-maturity, no draws/releases. Built here so
  // the /a-and-d page can show them alongside planned loans. NOT added to
  // aAndDContribByMonth — the existing `and_existing` already counts them.
  const importedAAndDSchedules: AAndDLoanSchedule[] = input.loans
    .filter(l => l.loan_type === 'A&D')
    .map<AAndDLoanSchedule>(l => {
      const monthsOut: AAndDLoanMonth[] = months.map(m => {
        const bal = projectExistingLoanBalance(l, m.date, input.loanPrograms, startDate)
        return {
          month: m.key,
          label: m.label,
          starting_balance: bal,
          draw_this_month: 0,
          lots_released: 0,
          lots_released_cum: 0,
          release_proceeds: 0,
          ending_balance: bal,
        }
      })
      return {
        loan_id: l.id ?? l.loan_number,
        loan_name: l.loan_number || l.borrower || 'Imported A&D',
        builder_name: null,
        total_lots: 0,
        total_loan_amount: Math.max(
          l.projected_balance, l.current_loan_amount, l.loan_amount_disbursed,
        ),
        months: monthsOut,
        imported_borrower: l.borrower || null,
        imported_maturity_date: l.current_loan_due_date,
        imported_current_loan_amount: l.current_loan_amount,
      }
    })

  // Expand each new-origination entry into a recurring series of monthly
  // cohorts that draws down a lot pool. The series starts at entry.month and
  // originates loans every month (fixed loan_count, or monthly_schedule lookup)
  // until cumulative count reaches total_lots OR end_month passes, whichever
  // comes first. No cap and no end_month → bounded only by the horizon.
  //
  // Program resolution: explicit loan_program_id → builder default → first SF
  // program → first program. Only with zero programs configured is an entry
  // skipped (nothing to draw a curve against).
  const fallbackProgram =
    input.loanPrograms.find(p => p.product_type === 'SF') ??
    input.loanPrograms[0] ??
    null

  const scheduledOriginations: LotOrigination[] = []
  for (const entry of input.newOriginations) {
    if (entry.avg_loan_amount <= 0) continue
    const startIdx = monthIndexByKey.get(entry.month)
    if (startIdx === undefined) continue  // series starts outside the horizon

    const programId = entry.loan_program_id
      ?? buildersById.get(entry.builder_id)?.default_loan_program_id
      ?? null
    const program = (programId ? programsById.get(programId) : undefined) ?? fallbackProgram
    if (!program) continue

    const cap = entry.total_lots && entry.total_lots > 0 ? entry.total_lots : Infinity
    // end_month is inclusive; an unparseable / out-of-horizon value just means
    // "no calendar stop within the horizon".
    const endIdxRaw = entry.end_month ? monthIndexByKey.get(entry.end_month) : undefined
    const lastIdx = endIdxRaw === undefined ? months.length - 1 : endIdxRaw
    const schedule = entry.monthly_mode === 'schedule' ? (entry.monthly_schedule ?? {}) : null

    let cumulative = 0
    for (let i = startIdx; i <= lastIdx && i < months.length; i++) {
      if (cumulative >= cap) break
      const monthlyCount = schedule
        ? Math.max(0, Math.floor(Number(schedule[months[i].key]) || 0))
        : Math.max(0, Math.floor(entry.loan_count))
      if (monthlyCount <= 0) continue
      const take = Math.min(monthlyCount, cap - cumulative)
      if (take <= 0) break
      cumulative += take
      scheduledOriginations.push({
        origination_month_idx: i,
        count: take,
        max_amount_per_loan: entry.avg_loan_amount,
        program,
        project_id: entry.land_bucket_project_id ?? entry.id,
        rate_override: entry.interest_rate ?? null,
        builder_id: entry.builder_id ?? null,
      })
    }
  }
  const allOriginations: LotOrigination[] = [...lb.lotOriginations, ...scheduledOriginations]

  // Count / dollar amount of scheduled new originations *at their origination
  // month* so the Forecast page can show what was actually scheduled (the
  // land-bucket counts in lb.totals only cover lot-driven verticals).
  const scheduledByMonthIdx = new Map<number, { count: number; amount: number }>()
  for (const o of scheduledOriginations) {
    const agg = scheduledByMonthIdx.get(o.origination_month_idx) ?? { count: 0, amount: 0 }
    agg.count += o.count
    agg.amount += o.count * o.max_amount_per_loan
    scheduledByMonthIdx.set(o.origination_month_idx, agg)
  }

  const loansByType: Record<LoanType, Loan[]> = {
    SFR: [],
    MFR: [],
    RAW_LAND: [],
    'A&D': [],
    FINISHED_LOTS: [],
    HHH: [],
    OTC: [],
    UNKNOWN: [],
  }
  for (const l of input.loans) loansByType[l.loan_type].push(l)
  // OTC is tagged separately on /loans so analysts can see "OTC" in the Type
  // column, but it rolls into the SFR segment for every dashboard / chart /
  // forecast rollup — same draw curve, same maturity behavior, same
  // outstanding semantics as a Single Family construction loan.
  const sfrLoans = [...loansByType.SFR, ...loansByType.OTC]

  const sumDisbursed = (loans: Loan[]) =>
    loans.reduce((s, l) => s + (l.loan_amount_disbursed || 0), 0)

  // Resolve borrower → parent_company_id. Explicit overrides win, then
  // case-insensitive substring patterns, otherwise UNASSIGNED_PARENT_KEY.
  const parentByBorrower = new Map<string, string>()
  {
    const overrides = new Map(input.borrowerParentMappings.map(m => [m.borrower, m.parent_company_id]))
    const patternsByParent: { parentId: string; pattern: string }[] =
      input.parentCompanyPatterns.map(p => ({ parentId: p.parent_company_id, pattern: p.pattern.toLowerCase() }))
    const distinctBorrowers = new Set(input.loans.map(l => l.borrower).filter((b): b is string => !!b))
    for (const borrower of distinctBorrowers) {
      const explicit = overrides.get(borrower)
      if (explicit) { parentByBorrower.set(borrower, explicit); continue }
      const haystack = borrower.toLowerCase()
      const match = patternsByParent.find(p => p.pattern.length > 0 && haystack.includes(p.pattern))
      parentByBorrower.set(borrower, match ? match.parentId : UNASSIGNED_PARENT_KEY)
    }
  }
  const parentIdFor = (loan: Loan): string =>
    (loan.borrower && parentByBorrower.get(loan.borrower)) || UNASSIGNED_PARENT_KEY

  // Builder → parent_company_id (migration 013) — used to attribute every
  // builder-spawned entity (forecasted cohorts, Land Bucket starting balance,
  // HHH/JV balance, A&D planned balance) to the right parent in by_parent.
  const parentByBuilder = new Map<string, string>()
  for (const b of input.builders) {
    parentByBuilder.set(b.id, b.parent_company_id || UNASSIGNED_PARENT_KEY)
  }
  const parentIdForBuilder = (builderId: string | null | undefined): string =>
    (builderId && parentByBuilder.get(builderId)) || UNASSIGNED_PARENT_KEY

  // Precomputed lookups so the monthly loop doesn't repeatedly scan arrays.
  const lbProjectBuilder = new Map<string, string | null>(
    input.landBucketProjects.map(p => [p.id, p.builder_id]),
  )

  // Per-segment loan groups per parent (computed once, reused every month).
  // For each parent we precompute Loan[] arrays per segment so the monthly
  // loop just sumExisting()'s them.
  type ParentSegmentLoans = Record<Segment, Loan[]>
  const emptyParentSegments = (): ParentSegmentLoans => ({
    sfr: [], mfr: [], and: [], raw_land: [], finished_lots: [], hhh: [],
  })
  const loanTypeToSegment: Record<LoanType, Segment> = {
    SFR: 'sfr', MFR: 'mfr', 'A&D': 'and', RAW_LAND: 'raw_land',
    FINISHED_LOTS: 'finished_lots', HHH: 'hhh', OTC: 'sfr', UNKNOWN: 'hhh',
  }
  const loansByParent = new Map<string, ParentSegmentLoans>()
  const loanCountByParent = new Map<string, number>()
  // Seed every known parent (plus the unassigned bucket) so the dropdown
  // always shows all parents even if none have loans yet.
  loansByParent.set(UNASSIGNED_PARENT_KEY, emptyParentSegments())
  loanCountByParent.set(UNASSIGNED_PARENT_KEY, 0)
  for (const p of input.parentCompanies) {
    loansByParent.set(p.id, emptyParentSegments())
    loanCountByParent.set(p.id, 0)
  }
  for (const l of input.loans) {
    const parentId = parentIdFor(l)
    if (!loansByParent.has(parentId)) {
      loansByParent.set(parentId, emptyParentSegments())
      loanCountByParent.set(parentId, 0)
    }
    loansByParent.get(parentId)![loanTypeToSegment[l.loan_type]].push(l)
    loanCountByParent.set(parentId, (loanCountByParent.get(parentId) ?? 0) + 1)
  }

  const monthly: MonthlyBalance[] = []
  let prevTotalAll = 0
  const prevExistingBalances = new Map<string, number>()

  for (let i = 0; i < months.length; i++) {
    const m = months[i]

    const sumExisting = (loans: Loan[]) =>
      loans.reduce((s, l) => s + projectExistingLoanBalance(l, m.date, input.loanPrograms, startDate), 0)

    const sfr_existing = sumExisting(sfrLoans)
    const mfr_existing = sumExisting(loansByType.MFR)
    const and_existing = sumExisting(loansByType['A&D'])
    const raw_existing = sumExisting(loansByType.RAW_LAND)
    const fl_existing = sumExisting(loansByType.FINISHED_LOTS)
    // HHH/JV segment is sourced strictly from the manual /hhh-jv tab + any
    // forecasted hhh cohorts. Imported loans never contribute here, even if
    // a legacy row is still typed HHH or UNKNOWN (migration 017 reclassifies
    // those by program). Keeps the dashboard HHH/JV tile equal to the sum
    // of HHH/JV project balances.
    const hhh_existing = 0

    // Lot-driven new originations distributed by program product_type
    const newBySegment: Record<Segment, number> = {
      sfr: 0, mfr: 0, raw_land: 0, and: 0, finished_lots: 0, hhh: 0,
    }
    // Per-segment new-origination count + amount AT origination month — feeds
    // the forecast page's product-type chip filter.
    const newOrigsBySeg: Record<Segment, { count: number; amount: number }> = {
      sfr:           { count: 0, amount: 0 },
      mfr:           { count: 0, amount: 0 },
      and:           { count: 0, amount: 0 },
      raw_land:      { count: 0, amount: 0 },
      finished_lots: { count: 0, amount: 0 },
      hhh:           { count: 0, amount: 0 },
    }
    // Count / amount AND drawn balance contribution of scheduled new
    // originations. LB-spawned vertical cohorts are a side-effect of lot
    // sales rather than originations the user committed to, so the counts
    // ($ + #) AND the forecasted_<seg> balance contribution exclude them.
    // newBySegmentScheduled drives the forecasted_<seg> exports; newBySegment
    // below still walks all sources so the headline m.<seg> /
    // m.outstanding_<seg> totals don't lose the LB-driven contribution.
    const newBySegmentScheduled: Record<Segment, number> = {
      sfr: 0, mfr: 0, raw_land: 0, and: 0, finished_lots: 0, hhh: 0,
    }
    for (const orig of scheduledOriginations) {
      const seg = PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type]
      if (orig.origination_month_idx === i) {
        newOrigsBySeg[seg].count  += orig.count
        newOrigsBySeg[seg].amount += orig.count * orig.max_amount_per_loan
      }
      const bal = lotOriginationBalance(orig, i, m0Frac)
      if (bal === 0) continue
      newBySegmentScheduled[seg] += bal
    }
    for (const orig of allOriginations) {
      const bal = lotOriginationBalance(orig, i, m0Frac)
      if (bal === 0) continue
      newBySegment[PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type]] += bal
    }

    const sfr = sfr_existing + newBySegment.sfr
    const mfr = mfr_existing + newBySegment.mfr
    // Planned A&D loans (forward-modeled lifecycle) stack on top of imported
    // A&D loans and forecasted A&D cohorts.
    const aAndDPlanned = aAndDContribByMonth[i]
    const and = and_existing + newBySegment.and + aAndDPlanned
    const raw_land = raw_existing + newBySegment.raw_land
    const finished_lots = fl_existing + newBySegment.finished_lots
    // HHH/JV projects feed the HHH/JV segment (balance == outstanding).
    const hhhJv = input.hhhJvProjects.reduce(
      (s, p) => s + hhhJvBalanceForMonth(p, m.key), 0)
    const hhh = hhh_existing + newBySegment.hhh + hhhJv

    // Outstanding (drawn) per segment: existing loans valued at disbursed
    // (decays at maturity) + forecasted cohorts (already a drawn balance).
    const sumExistingOut = (loans: Loan[]) =>
      loans.reduce((s, l) => s + projectExistingLoanOutstanding(l, m.date, startDate), 0)
    // Active = imported-loan drawn balance per segment. Memoized so the
    // outstanding_<seg> sums and the MonthlyBalance.active_<seg> exports
    // read the same value.
    const active_sfr           = sumExistingOut(sfrLoans)
    const active_mfr           = sumExistingOut(loansByType.MFR)
    const active_and           = sumExistingOut(loansByType['A&D'])
    const active_raw_land      = sumExistingOut(loansByType.RAW_LAND)
    const active_finished_lots = sumExistingOut(loansByType.FINISHED_LOTS)
    const outstanding_sfr           = active_sfr           + newBySegment.sfr
    const outstanding_mfr           = active_mfr           + newBySegment.mfr
    const outstanding_and           = active_and           + newBySegment.and + aAndDPlanned
    const outstanding_raw_land      = active_raw_land      + newBySegment.raw_land
    const outstanding_finished_lots = active_finished_lots + newBySegment.finished_lots
    // HHH/JV outstanding mirrors hhh_existing: hhh_jv_projects + forecasted only.
    const outstanding_hhh           = newBySegment.hhh + hhhJv

    // Per-parent breakdown for the month. Splits into:
    //   • imported-loan attribution (borrower → parent) for sfr/mfr/etc.
    //     and outstanding_<seg>;
    //   • builder-attribution (builder → parent) for forecasted cohorts,
    //     LB starting balance, HHH/JV balance, A&D planned balance.
    type SegBucket = Record<Segment, number>
    const newSegBucket = (): SegBucket => ({
      sfr: 0, mfr: 0, and: 0, raw_land: 0, finished_lots: 0, hhh: 0,
    })
    // Two per-parent cohort balance maps:
    //   fcstByParent          — all sources (LB-driven + scheduled). Feeds the
    //                           per-parent outstanding_<seg> rollup so totals
    //                           keep matching m.outstanding_<seg>.
    //   fcstSchedByParent     — scheduled cohorts only. Feeds per-parent
    //                           forecasted_<seg> so the dashboard tiles /
    //                           Monthly Summary respect the same scheduled-
    //                           only rule as m.forecasted_<seg>.
    const fcstByParent      = new Map<string, SegBucket>()
    const fcstSchedByParent = new Map<string, SegBucket>()
    const lbByParent      = new Map<string, number>()
    const hhhJvByParent   = new Map<string, number>()
    const aAndDByParent   = new Map<string, number>()
    const bumpInto = (map: Map<string, SegBucket>, pid: string, seg: Segment, amount: number) => {
      let bucket = map.get(pid)
      if (!bucket) { bucket = newSegBucket(); map.set(pid, bucket) }
      bucket[seg] += amount
    }
    const bump = (map: Map<string, number>, pid: string, amount: number) => {
      if (amount === 0) return
      map.set(pid, (map.get(pid) ?? 0) + amount)
    }

    const scheduledIdSet = new Set(scheduledOriginations)
    for (const orig of allOriginations) {
      const bal = lotOriginationBalance(orig, i, m0Frac)
      if (bal === 0) continue
      const seg = PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type]
      const pid = parentIdForBuilder(orig.builder_id)
      bumpInto(fcstByParent, pid, seg, bal)
      if (scheduledIdSet.has(orig)) bumpInto(fcstSchedByParent, pid, seg, bal)
    }
    for (const sched of lb.schedules) {
      const builderId = lbProjectBuilder.get(sched.project_id) ?? null
      bump(lbByParent, parentIdForBuilder(builderId), sched.months[i]?.starting_balance ?? 0)
    }
    for (const project of input.hhhJvProjects) {
      bump(hhhJvByParent, parentIdForBuilder(project.builder_id),
           hhhJvBalanceForMonth(project, m.key))
    }
    for (let k = 0; k < aAndDSchedules.length; k++) {
      const loan  = input.aAndDLoans[k]
      const sched = aAndDSchedules[k]
      bump(aAndDByParent, parentIdForBuilder(loan?.builder_id ?? null),
           sched.months[i]?.starting_balance ?? 0)
    }

    // Union of every parent that contributed anything (loans OR builder-
    // attributed). All known parents are already in loansByParent so the
    // dropdown stays stable; unioning catches keys that only appear in
    // builder-attributed maps (e.g. an LB project whose builder maps to a
    // parent who has no imported loans of their own).
    const allParents = new Set<string>(loansByParent.keys())
    for (const k of fcstByParent.keys())   allParents.add(k)
    for (const k of lbByParent.keys())     allParents.add(k)
    for (const k of hhhJvByParent.keys())  allParents.add(k)
    for (const k of aAndDByParent.keys())  allParents.add(k)

    const by_parent: Record<string, ByParentSegmentBalance> = {}
    for (const parentId of allParents) {
      const segs       = loansByParent.get(parentId)      ?? null
      const fcst       = fcstByParent.get(parentId)       ?? newSegBucket()
      const fcstSched  = fcstSchedByParent.get(parentId)  ?? newSegBucket()
      const lb_p       = lbByParent.get(parentId)         ?? 0
      const hhh_p      = hhhJvByParent.get(parentId)      ?? 0
      const aad_p      = aAndDByParent.get(parentId)      ?? 0
      // Active = parent's imported-loan drawn balance per segment (no cohorts).
      // Memoized so the outstanding_<seg> rollup and the per-parent
      // active_<seg> export share one computation.
      const p_active_sfr           = segs ? sumExistingOut(segs.sfr)           : 0
      const p_active_mfr           = segs ? sumExistingOut(segs.mfr)           : 0
      const p_active_and           = segs ? sumExistingOut(segs.and)           : 0
      const p_active_raw_land      = segs ? sumExistingOut(segs.raw_land)      : 0
      const p_active_finished_lots = segs ? sumExistingOut(segs.finished_lots) : 0
      by_parent[parentId] = {
        sfr:           segs ? sumExisting(segs.sfr)           : 0,
        mfr:           segs ? sumExisting(segs.mfr)           : 0,
        and:           segs ? sumExisting(segs.and)           : 0,
        raw_land:      segs ? sumExisting(segs.raw_land)      : 0,
        finished_lots: segs ? sumExisting(segs.finished_lots) : 0,
        // Per-parent hhh slot intentionally excludes imported loan
        // attribution so the dashboard's per-parent HHH/JV matches the
        // global HHH/JV segment (manual tab + forecasted only).
        hhh:           0,
        // outstanding_<seg> rolls in the matching builder-attributed contributions
        // so the Outstanding tile / Total Outstanding rows can sum per parent
        // without consulting the forecasted / planned / hhh-jv maps separately.
        outstanding_sfr:           p_active_sfr           + fcst.sfr,
        outstanding_mfr:           p_active_mfr           + fcst.mfr,
        outstanding_and:           p_active_and           + fcst.and + aad_p,
        outstanding_raw_land:      p_active_raw_land      + fcst.raw_land,
        outstanding_finished_lots: p_active_finished_lots + fcst.finished_lots,
        outstanding_hhh:           fcst.hhh + hhh_p,
        active_sfr:           p_active_sfr,
        active_mfr:           p_active_mfr,
        active_and:           p_active_and,
        active_raw_land:      p_active_raw_land,
        active_finished_lots: p_active_finished_lots,
        // Per-parent forecasted_<seg> tracks scheduled cohorts only so the
        // dashboard's per-parent slice matches the global rule (LB-driven
        // verticals stay out of "Forecasted").
        forecasted_sfr:           fcstSched.sfr,
        forecasted_mfr:           fcstSched.mfr,
        forecasted_and:           fcstSched.and,
        forecasted_raw_land:      fcstSched.raw_land,
        forecasted_finished_lots: fcstSched.finished_lots,
        forecasted_hhh:           fcstSched.hhh,
        land_bucket:    lb_p,
        hhh_jv_balance: hhh_p,
        a_and_d_planned: aad_p,
      }
    }

    // Use the starting balance so the Dashboard tile / Total (All) anchor to
    // the Land Bucket tab's Grand total (Σ balance_outstanding) at month 0,
    // then move with each month's net activity going forward.
    const land_bucket = lb.totals[i].starting_balance
    const total_loans = sfr + mfr + and + raw_land + finished_lots + hhh
    const total_all = total_loans + land_bucket

    // Income: per-loan rate where available, program default for new cohorts
    let yield_active = 0
    for (const loan of input.loans) {
      const bal = projectExistingLoanBalance(loan, m.date, input.loanPrograms, startDate)
      const rate = loan.current_interest_rate > 0 ? loan.current_interest_rate : input.settings.default_rate_vertical
      yield_active += bal * rate / 12
    }
    let yield_projected = 0
    for (const orig of allOriginations) {
      const rate = orig.rate_override ?? orig.program.default_rate
      yield_projected += lotOriginationBalance(orig, i, m0Frac) * rate / 12
    }
    const yield_land_bucket = lb.totals[i].interest_income
    // HHH/JV projects: while between dev_start_date and dev_end_date, they
    // earn interest on balance_outstanding at the project's interest_rate.
    let yield_hhh_jv = 0
    for (const project of input.hhhJvProjects) {
      const bal = hhhJvBalanceForMonth(project, m.key)
      if (bal === 0) continue
      yield_hhh_jv += bal * (project.interest_rate || 0) / 12
    }
    // A&D planned loans: per-loan starting balance × interest_rate ÷ 12. Use
    // starting_balance to match the LB convention (interest charged on the
    // month's opening balance, before draws/releases within the month).
    let yield_a_and_d_planned = 0
    for (let k = 0; k < aAndDSchedules.length; k++) {
      const loan  = input.aAndDLoans[k]
      const sched = aAndDSchedules[k]
      const bal = sched.months[i]?.starting_balance ?? 0
      if (bal === 0) continue
      yield_a_and_d_planned += bal * (loan?.interest_rate || 0) / 12
    }
    const total_income = yield_active + yield_projected + yield_land_bucket
                       + yield_hhh_jv + yield_a_and_d_planned
    const annualized_yield_pct = total_all > 0 ? (total_income / total_all) * 12 : 0

    // Payoff detection: existing loan whose balance transitioned to 0
    let payoffs_count = 0
    let payoffs_amount = 0
    const payoffs_by_segment: Record<Segment, number> = {
      sfr: 0, mfr: 0, and: 0, raw_land: 0, finished_lots: 0, hhh: 0,
    }
    for (const loan of input.loans) {
      const key = loan.id ?? loan.loan_number
      const curr = projectExistingLoanBalance(loan, m.date, input.loanPrograms, startDate)
      const prev = prevExistingBalances.get(key) ?? 0
      if (i > 0 && prev > 0 && curr === 0) {
        payoffs_count += 1
        payoffs_amount += prev
        payoffs_by_segment[loanTypeToSegment[loan.loan_type]] += prev
      }
      prevExistingBalances.set(key, curr)
    }
    // Lot-driven cohorts: pay off when age == term
    for (const orig of allOriginations) {
      if (i - orig.origination_month_idx === orig.program.default_term_months) {
        payoffs_count += orig.count
        const amount = orig.count * orig.max_amount_per_loan
        payoffs_amount += amount
        payoffs_by_segment[PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type]] += amount
      }
    }

    // Net new draws this month = positive change in total vertical balance
    const draws = i === 0 ? 0 : Math.max(0, total_loans - (monthly[i - 1].total_loans))
    const cash_flow = total_income + payoffs_amount + lb.totals[i].sale_proceeds - draws

    const variance = i === 0 ? 0 : total_all - prevTotalAll
    prevTotalAll = total_all

    monthly.push({
      month: m.key,
      label: m.label,
      sfr,
      mfr,
      raw_land,
      and,
      finished_lots,
      hhh,
      land_bucket,
      total_loans,
      total_all,
      outstanding_sfr,
      outstanding_mfr,
      outstanding_and,
      outstanding_raw_land,
      outstanding_finished_lots,
      outstanding_hhh,
      active_sfr,
      active_mfr,
      active_and,
      active_raw_land,
      active_finished_lots,
      variance,
      new_originations_sfr: newBySegmentScheduled.sfr,
      new_originations_mfr: newBySegmentScheduled.mfr,
      // Forecasted_<seg> exports scheduled cohorts only — LB-driven verticals
      // continue to feed m.<seg> / m.outstanding_<seg> totals but never the
      // "Forecasted" rollups (Dashboard Monthly Summary, Forecast page Fcst
      // columns, Current Breakdown tile).
      forecasted_sfr: newBySegmentScheduled.sfr,
      forecasted_mfr: newBySegmentScheduled.mfr,
      forecasted_and: newBySegmentScheduled.and,
      forecasted_raw_land: newBySegmentScheduled.raw_land,
      forecasted_finished_lots: newBySegmentScheduled.finished_lots,
      forecasted_hhh: newBySegmentScheduled.hhh,
      new_origs_by_segment: newOrigsBySeg,
      by_parent,
      forecasted_total:
        newBySegmentScheduled.sfr + newBySegmentScheduled.mfr + newBySegmentScheduled.and +
        newBySegmentScheduled.raw_land + newBySegmentScheduled.finished_lots + newBySegmentScheduled.hhh,
      yield_active,
      yield_projected,
      yield_land_bucket,
      yield_hhh_jv,
      yield_a_and_d_planned,
      profit_sharing: 0,
      total_income,
      annualized_yield_pct,
      lots_sold: lb.totals[i].lots_sold,
      lot_sale_proceeds: lb.totals[i].sale_proceeds,
      new_originations_count:
        lb.totals[i].new_vertical_origs_count + (scheduledByMonthIdx.get(i)?.count ?? 0),
      new_originations_amount:
        lb.totals[i].new_vertical_origs_amount + (scheduledByMonthIdx.get(i)?.amount ?? 0),
      payoffs_count,
      payoffs_amount,
      payoffs_by_segment,
      cash_flow,
    })
  }

  // ── Per-origination-project detail (Forecast → Detailed view) ─────────────
  // Group every cohort in allOriginations by its source project so the page
  // can render rows of developments × months for count / outstanding /
  // total-committed. project_id namespaces: LB project ids vs /originations
  // entry ids — both are uuids and won't collide, but we prefix them in the
  // bucket key just in case a builder ever reuses an id across both tables.
  const lbProjectsById = new Map(input.landBucketProjects.map(p => [p.id, p]))
  const newOrigEntriesById = new Map(input.newOriginations.map(n => [n.id, n]))
  type ProjectBucket = {
    name: string
    source: 'land_bucket' | 'scheduled'
    segment: Segment
    builder_id: string | null
    origs: LotOrigination[]
  }
  const origsByProject = new Map<string, ProjectBucket>()
  for (const orig of allOriginations) {
    const lb = lbProjectsById.get(orig.project_id)
    const ne = newOrigEntriesById.get(orig.project_id)
    const isLb = !!lb
    const key = `${isLb ? 'lb' : 'sc'}:${orig.project_id}`
    let bucket = origsByProject.get(key)
    if (!bucket) {
      const name = isLb
        ? (lb!.name || orig.project_id)
        : (ne?.development_name || ne?.id || orig.project_id)
      bucket = {
        name,
        source: isLb ? 'land_bucket' : 'scheduled',
        segment: PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type],
        builder_id: orig.builder_id,
        origs: [],
      }
      origsByProject.set(key, bucket)
    }
    bucket.origs.push(orig)
  }

  const newOriginationProjects: OriginationProjectDetail[] = []
  for (const [key, bucket] of origsByProject) {
    let totalLoanAmount = 0
    for (const orig of bucket.origs) {
      totalLoanAmount += orig.count * orig.max_amount_per_loan
    }
    const monthsData: OriginationProjectMonth[] = months.map((_, i) => {
      let count = 0
      let committed_amount = 0
      let outstanding = 0
      for (const orig of bucket.origs) {
        if (orig.origination_month_idx === i) {
          count += orig.count
          committed_amount += orig.count * orig.max_amount_per_loan
        }
        outstanding += lotOriginationBalance(orig, i, m0Frac)
      }
      return { count, committed_amount, outstanding }
    })
    newOriginationProjects.push({
      project_id: key,
      project_name: bucket.name,
      source: bucket.source,
      segment: bucket.segment,
      builder_name: bucket.builder_id ? buildersById.get(bucket.builder_id)?.name ?? null : null,
      total_loan_amount: totalLoanAmount,
      months: monthsData,
    })
  }
  // Stable display order: scheduled entries first (user-curated), then
  // LB-driven; alphabetical inside each group.
  newOriginationProjects.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'scheduled' ? -1 : 1
    return a.project_name.localeCompare(b.project_name)
  })

  const m0 = monthly[0]
  return {
    months: monthly,
    as_of_date: input.asOfDate,
    version_label: input.versionLabel,
    total_active_loans: input.loans.length,
    active_loans_outstanding: {
      sfr:           sumDisbursed(sfrLoans),
      mfr:           sumDisbursed(loansByType.MFR),
      and:           sumDisbursed(loansByType['A&D']),
      raw_land:      sumDisbursed(loansByType.RAW_LAND),
      finished_lots: sumDisbursed(loansByType.FINISHED_LOTS),
      // Active-loans tile excludes HHH-typed and UNKNOWN imported loans —
      // dashboard HHH/JV is the manual /hhh-jv tab's domain.
      hhh:           0,
      total:         input.loans.reduce((s, l) => s + (l.loan_amount_disbursed || 0), 0),
    },
    current_balances: {
      sfr: m0.sfr,
      mfr: m0.mfr,
      raw_land: m0.raw_land,
      and: m0.and,
      finished_lots: m0.finished_lots,
      hhh: m0.hhh,
      total: m0.total_all,
    },
    land_bucket_schedules: lb.schedules,
    a_and_d_schedules: aAndDSchedules,
    imported_a_and_d_schedules: importedAAndDSchedules,
    parent_companies: input.parentCompanies.map(p => ({ id: p.id, name: p.name })),
    parent_loan_counts: Object.fromEntries(loanCountByParent),
    new_origination_projects: newOriginationProjects,
    reconciliation: {
      month_zero_fraction: m0Frac,
      // Loans whose maturity date is strictly before as_of_date — those
      // contribute to the Active Loan (Outstanding) tile but not to the
      // engine's month-0 active_<seg> projection.
      matured_disbursed: (() => {
        const asOf = parseISO(input.asOfDate)
        let sum = 0
        for (const l of input.loans) {
          if (!l.current_loan_due_date) continue
          if (parseISO(l.current_loan_due_date) < asOf) {
            sum += l.loan_amount_disbursed || 0
          }
        }
        return sum
      })(),
      // FL basis delta: sumExistingOut at month 0 vs sumDisbursed for FL only.
      // FL uses max(disbursed, current_loan_amount) as the start basis; tile
      // uses disbursed.
      fl_basis_delta: (() => {
        let sum = 0
        for (const l of loansByType.FINISHED_LOTS) {
          const start = Math.max(l.current_loan_amount, l.loan_amount_disbursed, 0)
          sum += start - (l.loan_amount_disbursed || 0)
        }
        return sum
      })(),
    },
  }
}
