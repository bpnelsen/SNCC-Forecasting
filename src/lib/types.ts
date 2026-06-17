export type LoanType = 'SFR' | 'MFR' | 'RAW_LAND' | 'A&D' | 'FINISHED_LOTS' | 'HHH' | 'OTC' | 'UNKNOWN'

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
  // Finished Lots / Multi-Lot Lot Loan release rule. Defaults: 1 lot,
  // 12-month release horizon. Engine uses these only for loan_type ===
  // 'FINISHED_LOTS' (calculator.ts): the loan is capped at current_loan_amount
  // (never projected upward) and pays down by original_loan_amount /
  // release_period_months per month, floored at 0 and zeroed past maturity.
  number_of_lots: number
  release_period_months: number
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
  // Active imported-loan portfolio drawn balance per segment. = sumExistingOut(
  // loansByType.<SEG>) — purely the imported book of business, decaying at
  // maturity. No new cohorts (LB-driven or scheduled) included. Used by the
  // dashboard Monthly Summary so its per-segment rows are clean of cohort
  // double-counting. hhh has no imported contribution (migration 017
  // reclassified everything), so it isn't surfaced here.
  active_sfr: number
  active_mfr: number
  active_and: number
  active_raw_land: number
  active_finished_lots: number
  // Sum of the planned A&D loans' contribution (initial_balance → draw →
  // release lifecycle) at this month, across every loan on /a-and-d. Not
  // included in active_<seg> or forecasted_<seg> — surfaced separately so
  // the Dashboard can show "Forecasted A&D" = forecasted_and + this.
  a_and_d_planned: number
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
  // Per-segment breakdown of payoffs_amount so the Forecast page can filter
  // the Payoffs column by the product-type chip strip. Includes both imported
  // loan maturities AND forecasted cohort payoffs at end-of-term.
  payoffs_by_segment: {
    sfr: number
    mfr: number
    and: number
    raw_land: number
    finished_lots: number
    hhh: number
  }
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
  // Per-origination-project per-month detail used by the Forecast page's
  // Detailed view. Each entry groups every loan cohort (LB-driven verticals
  // + scheduled /originations entries) under its source project so the user
  // can see counts and drawn balance broken out development-by-development.
  new_origination_projects: OriginationProjectDetail[]
  // Diagnostic fields surfaced for the dashboard's Reconciliation panel.
  // Lets the UI explain why some identities may not balance to the cent.
  reconciliation: {
    // Fraction of the current calendar month still ahead of as_of_date
    // (Truth 4). 0.5 means import was at the half-way point. month-0
    // Forecasted SFR/MFR is scaled by this.
    month_zero_fraction: number
    // Σ loan_amount_disbursed across imported loans whose maturity date is
    // strictly before the as_of_date. These contribute to the Active Loan
    // (Outstanding) tile (sumDisbursed has no maturity gate) but NOT to
    // m.active_<seg> at month 0 (projectExistingLoanOutstanding zeroes
    // matured loans). That delta explains "why tile > Monthly Summary".
    matured_disbursed: number
    // Δ between sumExistingOut(FL loans) at month 0 and sumDisbursed(FL).
    // FL loans where current_loan_amount > loan_amount_disbursed start the
    // engine projection above their disbursed amount; the dashboard tile
    // uses disbursed flat. Usually small but documented for traceability.
    fl_basis_delta: number
  }
}

export type OriginationSegment = 'sfr' | 'mfr' | 'raw_land' | 'and' | 'finished_lots' | 'hhh'

export interface OriginationProjectMonth {
  // Loans started this month for this project.
  count: number
  // Committed $ for loans started this month — count × avg loan amount,
  // summed across every cohort whose origination_month_idx == this month.
  committed_amount: number
  // Drawn balance (running, decays at term) of every loan from this project
  // at this month. Same math as the engine's lot-origination balance curve.
  outstanding: number
}

export interface OriginationProjectDetail {
  project_id: string
  project_name: string
  // 'land_bucket' = vertical loans spawned when a Land Bucket project sells a
  // lot. 'scheduled' = /originations tab entries.
  source: 'land_bucket' | 'scheduled'
  segment: OriginationSegment
  builder_name: string | null
  // Total approved/committed loan amount across every cohort for this
  // project — Σ (count × max_amount_per_loan). Constant for the project; the
  // Detailed view replays it across every month column for visual alignment.
  total_loan_amount: number
  months: OriginationProjectMonth[]
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
  // Active imported-loan drawn balance per segment for this parent.
  // = sumExistingOut on the parent's loan slot. Mirrors MonthlyBalance
  // .active_<seg> at the parent slice.
  active_sfr: number
  active_mfr: number
  active_and: number
  active_raw_land: number
  active_finished_lots: number
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

// Committee-approved loans that haven't closed yet. Free-form pipeline tracker
// rendered by /approved. "Days left" is computed in the UI as
// lc_approval_expiration - today, not stored. See migration 016.
export type ApprovedLoanType   = 'Vertical' | 'A&D' | 'Finished Lots' | 'Land' | 'Other'
export type ApprovedLoanStatus = 'Open' | 'Closed'

export interface ApprovedLoan {
  id: string
  loan_type: ApprovedLoanType
  date_approved: string | null
  borrower_project_name: string
  lc_approval_expiration: string | null
  status: ApprovedLoanStatus
  date_completed: string | null
  disposition_notes: string | null
  next_steps_notes: string | null
  loan_amount: number
  sort_order: number
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
