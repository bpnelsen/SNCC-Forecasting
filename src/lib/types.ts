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
  variance: number
  new_originations_sfr: number
  new_originations_mfr: number
  forecasted_sfr: number
  forecasted_mfr: number
  // Outstanding balance contributed by ALL forecasted new-origination cohorts
  // (every product type), not just SF + MF.
  forecasted_total: number
  yield_active: number
  yield_projected: number
  yield_land_bucket: number
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

export interface NewOriginationEntry {
  id: string
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
