export type LoanType = 'SFR' | 'MFR' | 'RAW_LAND' | 'A&D' | 'FINISHED_LOTS' | 'HHH' | 'UNKNOWN'

export interface Loan {
  id?: string
  version_id?: string
  borrower: string
  loan_number: string
  loan_program: string
  original_loan_amount: number
  loan_funded_date: string | null
  current_loan_due_date: string | null
  current_loan_amount: number
  loan_amount_disbursed: number
  loan_amount_remaining: number
  interest_reserve_balance: number
  current_interest_rate: number
  interest_accrued_mtd: number
  project_name: string | null
  unit_name: string | null
  development_name: string | null
  subdivision_name: string | null
  projected_balance: number
  loan_type: LoanType
}

export interface CurrentReportVersion {
  id: string
  label: string
  filename: string
  file_path: string | null
  imported_by: string
  is_active: boolean
  loan_count: number | null
  as_of_date: string | null
  notes: string | null
  created_at: string
}

export interface LandBucketDevelopment {
  name: string
  builder: string
  phases: number
  lots: number
  interest_rate: number
  release_price: number
  land_costs: number
  dev_costs: number
  interest: number
  start_date: string
  completion_date: string
  lot_release_start: string
}

export interface Assumptions {
  id?: string
  draw_pct_sf: number
  draw_pct_mf: number
  draw_pct_active: number
  rate_projected_loans: number
  rate_land_bucket: number
  ps_holmes_sfr: number
  ps_holmes_mfr: number
  ps_arive_sfr: number
  ps_arive_mfr: number
  nhcf_loan_counts: Record<string, Record<string, number>>
  nhcf_payoff_counts: Record<string, Record<string, number>>
  nhcf_loan_sizes: Record<string, { sf: number; mf: number }>
  land_bucket: LandBucketDevelopment[]
  ps_unit_counts: Record<string, Record<string, number>>
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface MonthlyBalance {
  month: string
  label: string
  sfr: number
  mfr: number
  raw_land: number
  and: number
  finished_lots: number
  hhh: number
  land_bucket: number
  total_loans: number
  total_all: number
  // Drawn/outstanding balance per segment: existing loans valued at
  // loan_amount_disbursed (decays at maturity) + forecasted cohorts.
  outstanding_sfr: number
  outstanding_mfr: number
  outstanding_and: number
  outstanding_raw_land: number
  outstanding_finished_lots: number
  outstanding_hhh: number
  variance: number
  new_originations_sfr: number
  new_originations_mfr: number
  forecasted_sfr: number
  forecasted_mfr: number
  // Forecasted (drawn) balance contributed by new-origination cohorts in the
  // remaining product segments — added so the forecast page can filter by
  // product type, not just SF + MF.
  forecasted_and: number
  forecasted_raw_land: number
  forecasted_finished_lots: number
  forecasted_hhh: number
  // Outstanding balance contributed by ALL forecasted new-origination cohorts
  // (every product type), not just SF + MF.
  forecasted_total: number
  // Per-segment new-origination count and dollar amount AT origination month
  // (LB-driven + scheduled). Lets the forecast page filter the New Orig (#) /
  // New Orig $ columns by product type.
  new_origs_by_segment: {
    sfr: { count: number; amount: number }
    mfr: { count: number; amount: number }
    and: { count: number; amount: number }
    raw_land: { count: number; amount: number }
    finished_lots: { count: number; amount: number }
    hhh: { count: number; amount: number }
  }
  // Existing-loan segments split by parent company so the dashboard can
  // multi-select-filter without re-running the engine. Key '__none__' holds
  // loans whose borrower didn't match any parent.
  by_parent: Record<string, ByParentSegmentBalance>
  yield_active: number
  yield_projected: number
  yield_land_bucket: number
  // Interest accrued each month on HHH/JV projects (project.balance_outstanding
  // × interest_rate ÷ 12 while active). Was previously omitted from total_income.
  yield_hhh_jv: number
  // Interest accrued each month on forward-planned A&D loans, computed from
  // each loan's starting_balance × interest_rate ÷ 12.
  yield_a_and_d_planned: number
  profit_sharing: number
  total_income: number
  annualized_yield_pct: number
  // Module 1 / 2 additions
  lots_sold: number
  lot_sale_proceeds: number
  new_originations_count: number
  new_originations_amount: number
  payoffs_count: number
  payoffs_amount: number
  cash_flow: number
}

export interface ForecastResult {
  months: MonthlyBalance[]
  as_of_date: string
  version_label: string
  total_active_loans: number
  // Sum of loan_amount_disbursed (cash actually drawn/funded) across every
  // loan in the active version, broken out by product type so the dashboard
  // can respect the product-type filter. `total` = sum of all segments.
  active_loans_outstanding: {
    sfr: number
    mfr: number
    and: number
    raw_land: number
    finished_lots: number
    hhh: number
    total: number
  }
  current_balances: {
    sfr: number
    mfr: number
    raw_land: number
    and: number
    finished_lots: number
    hhh: number
    total: number
  }
  land_bucket_schedules: LandBucketProjectSchedule[]
  a_and_d_schedules: AAndDLoanSchedule[]
  // Parent companies known to the engine + how many loans rolled under each.
  // '__none__' = unassigned. The dashboard renders the dropdown from these.
  parent_companies: Array<{ id: string; name: string }>
  parent_loan_counts: Record<string, number>
  // Imported A&D loans (loan_type === 'A&D' from the Current Report) projected
  // flat-until-maturity. Surfaced so the A&D tab can show them alongside
  // forward-planned A&D loans without changing how the engine values them.
  imported_a_and_d_schedules: AAndDLoanSchedule[]
}

// ─── Modular assumption entities (from migration 002) ───────────────────────

export type ProductType = 'SF' | 'MF' | 'LOT' | 'AD' | 'RAW_LAND' | 'OTHER'

export interface LoanProgram {
  id: string
  name: string
  product_type: ProductType
  draw_curve: number[]
  default_rate: number
  default_term_months: number
  notes: string | null
}

export interface Builder {
  id: string
  name: string
  default_absorption_rate: number
  default_loan_program_id: string | null
  notes: string | null
  // Builder → Parent Company (migration 013). The Dashboard parent filter
  // uses this to slice every builder-attributed entity (Land Bucket,
  // forecasted cohorts, HHH/JV, A&D planned).
  parent_company_id: string | null
}

export interface LandBucketProject {
  id: string
  name: string
  builder_id: string | null
  total_lots: number
  lot_price: number
  absorption_rate: number | null
  balance_outstanding: number
  interest_rate: number
  dev_start_date: string | null
  dev_end_date: string | null
  lot_sales_start_date: string | null
  vertical_loan_program_id: string | null
  // Per-project override: dollar amount per vertical loan when a lot sells.
  // NULL = use calculator default (lot_price × multiple).
  vertical_loan_amount: number | null
  // Optional manual lot-release override. Keys are YYYY-MM, values are the
  // integer lots released that month. When non-empty, overrides absorption_rate.
  lot_release_schedule: Record<string, number>
  notes: string | null
}

// HHH / JV development project. Mirrors the meaningful Land Bucket fields but
// is a distinct entity (not a loan, not a land bucket project). Its
// balance_outstanding feeds the HHH/JV forecast segment.
export interface HHHJVProject {
  id: string
  name: string
  builder_id: string | null
  total_lots: number
  lot_price: number
  absorption_rate: number | null
  balance_outstanding: number
  interest_rate: number
  dev_start_date: string | null
  dev_end_date: string | null
  lot_sales_start_date: string | null
  vertical_loan_program_id: string | null
  vertical_loan_amount: number | null
  notes: string | null
}

// A&D (Acquisition & Development) loan — distinct from imported A&D loans
// and forecasted A&D cohorts. Models the full lifecycle: origination →
// initial_balance, draw to peak (90% of total_loan_amount) over
// draw_period_months, then lot releases pay it down. See migration 011.
// Parent Company groups borrowers across loans so the dashboard can slice
// imported-loan metrics by parent. See migration 012.
export interface ParentCompany {
  id: string
  name: string
  notes: string | null
}
export interface ParentCompanyPattern {
  id: string
  parent_company_id: string
  pattern: string
}
export interface BorrowerParentMapping {
  borrower: string
  parent_company_id: string
}
// Per-parent breakdown for one month. Split into two halves:
//   • imported-loan attribution (borrower → parent): sfr/mfr/and/raw_land/
//     finished_lots/hhh and matching outstanding_<seg>.
//   • builder-attribution (builder → parent): forecasted_<seg> for every new-
//     origination cohort and the project-style entities (Land Bucket starting
//     balance, HHH/JV balance, A&D planned balance).
// Dashboard applyFilter sums the relevant subset per parent depending on
// which chips and parents are active.
export interface ByParentSegmentBalance {
  // Imported loans (borrower → parent) — max committed
  sfr: number
  mfr: number
  and: number
  raw_land: number
  finished_lots: number
  hhh: number
  // Imported loans, disbursed-with-maturity (the basis of Outstanding)
  outstanding_sfr: number
  outstanding_mfr: number
  outstanding_and: number
  outstanding_raw_land: number
  outstanding_finished_lots: number
  outstanding_hhh: number
  // Forecasted new-origination cohort balances (builder → parent)
  forecasted_sfr: number
  forecasted_mfr: number
  forecasted_and: number
  forecasted_raw_land: number
  forecasted_finished_lots: number
  forecasted_hhh: number
  // Project-style builder-attributed contributions
  land_bucket: number       // sum of LB project starting_balance under this parent
  hhh_jv_balance: number    // sum of HHH/JV project balance under this parent (folds into hhh)
  a_and_d_planned: number   // sum of planned A&D loan balance under this parent (folds into and)
}

export interface AAndDLoan {
  id: string
  name: string
  builder_id: string | null
  initial_balance: number
  total_loan_amount: number
  total_lots: number
  lot_release_premium_pct: number  // 110 = release_price 110% of prorata
  interest_rate: number
  origination_date: string | null
  draw_period_months: number
  release_start_date: string | null
  release_period_months: number
  draw_schedule: Record<string, number>     // { YYYY-MM: $ }
  release_schedule: Record<string, number>  // { YYYY-MM: lots }
  notes: string | null
}

export interface AAndDLoanMonth {
  month: string
  label: string
  starting_balance: number
  draw_this_month: number
  lots_released: number
  lots_released_cum: number
  release_proceeds: number
  ending_balance: number
}

export interface AAndDLoanSchedule {
  loan_id: string
  loan_name: string
  builder_name: string | null
  total_lots: number
  total_loan_amount: number
  months: AAndDLoanMonth[]
  // Populated only for imported A&D loans (from the Current Report), so the
  // /a-and-d Imported card can show borrower / maturity / current commitment
  // without re-fetching the loans list.
  imported_borrower?: string | null
  imported_maturity_date?: string | null
  imported_current_loan_amount?: number
}

export interface NewOriginationEntry {  id: string
  builder_id: string
  land_bucket_project_id: string | null
  // Free-text development name. When the user picks an existing project from
  // the autocomplete, both this and land_bucket_project_id are populated.
  development_name: string | null
  // Series start month, 'YYYY-MM'.
  month: string
  // Per-month loans started when monthly_mode = 'fixed'.
  loan_count: number
  avg_loan_amount: number
  loan_program_id: string | null
  // Per-entry interest rate override (fraction, e.g. 0.0525). null = fall
  // back to the entry's loan_program.default_rate at calc time.
  interest_rate: number | null
  // Cap on cumulative loans started by this entry. null / 0 = no cap.
  total_lots: number | null
  // Inclusive calendar stop, 'YYYY-MM'. null = no date stop.
  end_month: string | null
  // 'fixed' = loan_count every month; 'schedule' = monthly_schedule lookup.
  monthly_mode: 'fixed' | 'schedule'
  // { 'YYYY-MM': count } used when monthly_mode = 'schedule'.
  monthly_schedule: Record<string, number>
  notes: string | null
}

export interface ForecastSettings {
  id: string
  start_date: string
  horizon_months: number
  default_rate_vertical: number
  default_rate_land: number
  is_active: boolean
}

// ─── Forecast outputs for Module 1 (Land Bucket) ────────────────────────────

export interface LandBucketMonth {
  month: string
  label: string
  lots_sold: number
  lots_sold_cumulative: number
  lots_remaining: number
  sale_proceeds: number
  // Balance at the START of the month, before this month's sale activity.
  // Month 0 = sum of project.balance_outstanding (the Land Bucket tab's
  // "Grand total"); month i = previous month's ending_balance.
  starting_balance: number
  ending_balance: number
  interest_income: number
  new_vertical_origs_count: number
  new_vertical_origs_amount: number
}

export interface LandBucketProjectSchedule {
  project_id: string
  project_name: string
  builder_name: string | null
  total_lots: number
  lot_price: number
  absorption_rate: number
  months: LandBucketMonth[]
}
