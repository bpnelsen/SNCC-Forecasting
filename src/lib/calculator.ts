import { addMonths, format, parseISO, differenceInMonths } from 'date-fns'
import {
  Loan,
  LoanType,
  ProductType,
  LoanProgram,
  Builder,
  LandBucketProject,
  ForecastSettings,
  ScheduledOrigination,
  LandBucketMonth,
  LandBucketProjectSchedule,
  MonthlyBalance,
  ForecastResult,
} from './types'

// Fallback when a project doesn't set vertical_loan_amount: lot_price × this.
const DEFAULT_LOT_TO_VERTICAL_MULTIPLE = 3.0

const LOAN_TYPE_TO_PRODUCT_TYPE: Record<LoanType, ProductType> = {
  SFR: 'SF',
  MFR: 'MF',
  'A&D': 'AD',
  RAW_LAND: 'RAW_LAND',
  FINISHED_LOTS: 'LOT',
  HHH: 'OTHER',
  UNKNOWN: 'OTHER',
}

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

function programForLoanType(programs: LoanProgram[], loanType: LoanType): LoanProgram | null {
  const pt = LOAN_TYPE_TO_PRODUCT_TYPE[loanType] ?? 'OTHER'
  return programs.find(p => p.product_type === pt) ?? null
}

// ─── Module 1: Land Bucket Engine ────────────────────────────────────────────

interface Origination {
  origination_month_idx: number
  count: number
  max_amount_per_loan: number
  program: LoanProgram
  source: 'lot' | 'scheduled'
  source_id: string
}

interface LandBucketRunResult {
  schedules: LandBucketProjectSchedule[]
  lotOriginations: Origination[]
  totals: LandBucketMonth[]
}

function runLandBucket(
  projects: LandBucketProject[],
  buildersById: Map<string, Builder>,
  programsById: Map<string, LoanProgram>,
  months: MonthSpec[],
): LandBucketRunResult {
  const schedules: LandBucketProjectSchedule[] = []
  const lotOriginations: Origination[] = []
  const totals: LandBucketMonth[] = months.map(m => ({
    month: m.key,
    label: m.label,
    lots_sold: 0,
    lots_sold_cumulative: 0,
    lots_remaining: 0,
    sale_proceeds: 0,
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

    const monthly: LandBucketMonth[] = []
    let balance = project.balance_outstanding
    let lotsSoldCum = 0
    let absorptionAccum = 0

    for (let i = 0; i < months.length; i++) {
      const { date: monthDate, key, label } = months[i]
      const lotsRemaining = Math.max(0, project.total_lots - lotsSoldCum)

      // Interest computed on starting balance — fixed rate, paid current.
      const interestIncome = balance * project.interest_rate / 12

      let lotsThisMonth = 0
      if (lotSalesStart && monthDate >= lotSalesStart && lotsRemaining > 0 && absorption > 0) {
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
        const amountPerLoan = project.vertical_loan_amount ?? project.lot_price * DEFAULT_LOT_TO_VERTICAL_MULTIPLE
        lotOriginations.push({
          origination_month_idx: i,
          count: lotsThisMonth,
          max_amount_per_loan: amountPerLoan,
          program: verticalProgram,
          source: 'lot',
          source_id: project.id,
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

// Existing portfolio loan: ramp balance per its program's draw curve based on
// age since funding. Zero after maturity. No program / unknown type → hold at
// max until maturity.
function projectExistingLoanBalance(
  loan: Loan,
  monthDate: Date,
  programs: LoanProgram[],
  startDate: Date,
): number {
  if (loan.current_loan_due_date) {
    const dueDate = parseISO(loan.current_loan_due_date)
    if (monthDate >= dueDate) return 0
  }

  const maxAmount = Math.max(
    loan.projected_balance,
    loan.current_loan_amount,
    loan.loan_amount_disbursed,
  )
  if (maxAmount <= 0) return 0

  const program = programForLoanType(programs, loan.loan_type)
  if (!program || program.draw_curve.length === 0) return maxAmount

  const fundedDate = loan.loan_funded_date ? parseISO(loan.loan_funded_date) : startDate
  const age = differenceInMonths(monthDate, fundedDate)
  return maxAmount * cumulativeDraw(program.draw_curve, age)
}

// Origination cohort balance at month index `m`. Used for both lot-driven and
// scheduled cohorts — the source field is purely descriptive.
function originationBalance(orig: Origination, m: number): number {
  const age = m - orig.origination_month_idx
  if (age < 0) return 0
  if (age >= orig.program.default_term_months) return 0
  return orig.count * orig.max_amount_per_loan * cumulativeDraw(orig.program.draw_curve, age)
}

// Convert scheduled origination rows into cohorts pinned to a month index.
// Rows whose forecast_month falls outside the horizon are dropped.
function buildScheduledOriginations(
  scheduled: ScheduledOrigination[],
  programsById: Map<string, LoanProgram>,
  months: MonthSpec[],
): Origination[] {
  const result: Origination[] = []
  for (const s of scheduled) {
    if (s.count <= 0 || s.max_amount_per_loan <= 0) continue
    const program = programsById.get(s.loan_program_id)
    if (!program) continue
    const key = format(parseISO(s.forecast_month), 'yyyy-MM')
    const idx = months.findIndex(m => m.key === key)
    if (idx < 0) continue
    result.push({
      origination_month_idx: idx,
      count: s.count,
      max_amount_per_loan: s.max_amount_per_loan,
      program,
      source: 'scheduled',
      source_id: s.id,
    })
  }
  return result
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface ForecastInput {
  loans: Loan[]
  landBucketProjects: LandBucketProject[]
  builders: Builder[]
  loanPrograms: LoanProgram[]
  scheduledOriginations: ScheduledOrigination[]
  settings: ForecastSettings
  versionLabel: string
  asOfDate: string
}

export function runForecast(input: ForecastInput): ForecastResult {
  const startDate = parseISO(input.settings.start_date)
  const months = generateMonths(startDate, input.settings.horizon_months)

  const buildersById = new Map(input.builders.map(b => [b.id, b]))
  const programsById = new Map(input.loanPrograms.map(p => [p.id, p]))

  const lb = runLandBucket(input.landBucketProjects, buildersById, programsById, months)
  const scheduledOrigs = buildScheduledOriginations(input.scheduledOriginations, programsById, months)
  const allOriginations: Origination[] = [...lb.lotOriginations, ...scheduledOrigs]

  const loansByType: Record<LoanType, Loan[]> = {
    SFR: [],
    MFR: [],
    RAW_LAND: [],
    'A&D': [],
    FINISHED_LOTS: [],
    HHH: [],
    UNKNOWN: [],
  }
  for (const l of input.loans) loansByType[l.loan_type].push(l)

  const monthly: MonthlyBalance[] = []
  let prevTotalAll = 0
  const prevExistingBalances = new Map<string, number>()

  for (let i = 0; i < months.length; i++) {
    const m = months[i]

    const sumExisting = (loans: Loan[]) =>
      loans.reduce((s, l) => s + projectExistingLoanBalance(l, m.date, input.loanPrograms, startDate), 0)

    const sfr_existing = sumExisting(loansByType.SFR)
    const mfr_existing = sumExisting(loansByType.MFR)
    const and_existing = sumExisting(loansByType['A&D'])
    const raw_existing = sumExisting(loansByType.RAW_LAND)
    const fl_existing = sumExisting(loansByType.FINISHED_LOTS)
    const hhh_existing = sumExisting(loansByType.HHH) + sumExisting(loansByType.UNKNOWN)

    // Lot-driven new originations distributed by program product_type
    const newBySegment: Record<Segment, number> = {
      sfr: 0, mfr: 0, raw_land: 0, and: 0, finished_lots: 0, hhh: 0,
    }
    for (const orig of allOriginations) {
      const bal = originationBalance(orig, i)
      if (bal === 0) continue
      newBySegment[PRODUCT_TYPE_TO_SEGMENT[orig.program.product_type]] += bal
    }

    const sfr = sfr_existing + newBySegment.sfr
    const mfr = mfr_existing + newBySegment.mfr
    const and = and_existing + newBySegment.and
    const raw_land = raw_existing + newBySegment.raw_land
    const finished_lots = fl_existing + newBySegment.finished_lots
    const hhh = hhh_existing + newBySegment.hhh

    const land_bucket = lb.totals[i].ending_balance
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
      yield_projected += originationBalance(orig, i) * orig.program.default_rate / 12
    }
    const yield_land_bucket = lb.totals[i].interest_income
    const total_income = yield_active + yield_projected + yield_land_bucket
    const annualized_yield_pct = total_all > 0 ? (total_income / total_all) * 12 : 0

    // Payoff detection: existing loan whose balance transitioned to 0
    let payoffs_count = 0
    let payoffs_amount = 0
    for (const loan of input.loans) {
      const key = loan.id ?? loan.loan_number
      const curr = projectExistingLoanBalance(loan, m.date, input.loanPrograms, startDate)
      const prev = prevExistingBalances.get(key) ?? 0
      if (i > 0 && prev > 0 && curr === 0) {
        payoffs_count += 1
        payoffs_amount += prev
      }
      prevExistingBalances.set(key, curr)
    }
    // Origination cohorts pay off when age == term
    for (const orig of allOriginations) {
      if (i - orig.origination_month_idx === orig.program.default_term_months) {
        payoffs_count += orig.count
        payoffs_amount += orig.count * orig.max_amount_per_loan
      }
    }

    // Count new originations (lot-driven + scheduled) firing in this month
    let new_origs_count = 0
    let new_origs_amount = 0
    for (const orig of allOriginations) {
      if (orig.origination_month_idx === i) {
        new_origs_count += orig.count
        new_origs_amount += orig.count * orig.max_amount_per_loan
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
      variance,
      new_originations_sfr: newBySegment.sfr,
      new_originations_mfr: newBySegment.mfr,
      forecasted_sfr: newBySegment.sfr,
      forecasted_mfr: newBySegment.mfr,
      yield_active,
      yield_projected,
      yield_land_bucket,
      profit_sharing: 0,
      total_income,
      annualized_yield_pct,
      lots_sold: lb.totals[i].lots_sold,
      lot_sale_proceeds: lb.totals[i].sale_proceeds,
      new_originations_count: new_origs_count,
      new_originations_amount: new_origs_amount,
      payoffs_count,
      payoffs_amount,
      cash_flow,
    })
  }

  const m0 = monthly[0]
  return {
    months: monthly,
    as_of_date: input.asOfDate,
    version_label: input.versionLabel,
    total_active_loans: input.loans.length,
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
  }
}
