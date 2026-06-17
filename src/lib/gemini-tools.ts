// Tool implementations the /ask agent can call. Each tool is a pure server-
// side function that hits Supabase or runs the engine and returns JSON. The
// agent never sees the DB directly; it sees the result of these calls.
//
// Adding a tool: define the function declaration in TOOL_DECLARATIONS,
// implement the handler in TOOL_HANDLERS, and add a one-line entry in the
// system prompt so the model knows when to reach for it.

import { createServiceClient } from '@/lib/supabase'
import { runForecast } from '@/lib/calculator'
import type {
  ForecastResult, Loan, Builder, LoanProgram, LandBucketProject, HHHJVProject,
  AAndDLoan, ParentCompany, ParentCompanyPattern, BorrowerParentMapping,
  NewOriginationEntry, ForecastSettings,
} from '@/lib/types'

// Gemini function-calling schema. Compatible with @google/genai's Tool type.
export const TOOL_DECLARATIONS = [
  {
    name: 'get_portfolio_summary',
    description:
      'Returns a one-shot snapshot of the portfolio at today (month 0 of the forecast horizon). ' +
      'Best first call for any open-ended question — gives total loan counts, segment outstanding ' +
      'balances (SFR/MFR/A&D/Raw Land/Fin Lots active), forecasted SFR/MFR cohort balances, ' +
      'HHH/JV equity balance, Land Bucket inventory, and total portfolio.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_monthly_balance',
    description:
      'Returns the per-month balance projection for one month in the forecast horizon. ' +
      'Use to answer "what does balance X look like in month Y" or to compare segments month-over-month.',
    parameters: {
      type: 'object',
      properties: {
        month_offset: {
          type: 'integer',
          description:
            'Months from today. 0 = current month, 1 = next month, etc. Horizon is 17 months.',
        },
      },
      required: ['month_offset'],
    },
  },
  {
    name: 'get_loans',
    description:
      'Lists imported portfolio loans, optionally filtered by loan type or borrower-name substring. ' +
      'Returns up to 50 rows; use loan_type filter to drill in on a segment, or borrower_contains ' +
      'to find a specific company. For broad questions, prefer get_portfolio_summary first.',
    parameters: {
      type: 'object',
      properties: {
        loan_type: {
          type: 'string',
          enum: ['SFR', 'MFR', 'A&D', 'RAW_LAND', 'FINISHED_LOTS', 'OTC', 'HHH', 'UNKNOWN'],
          description: 'Restrict to one loan_type segment.',
        },
        borrower_contains: {
          type: 'string',
          description: 'Case-insensitive substring match on the borrower field.',
        },
        limit: {
          type: 'integer',
          description: 'Max rows to return. Defaults to 25, cap is 50.',
        },
      },
    },
  },
  {
    name: 'get_approved_loans',
    description:
      'Lists committee-approved loans from the /approved pipeline. Filter by status (Open/Closed). ' +
      'Each row carries loan_type, borrower/project name, approved date, LC expiration, and ' +
      'loan amount. Open status = still being worked; Closed = funded or fallen off.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Open', 'Closed'] },
      },
    },
  },
  {
    name: 'get_parent_companies',
    description:
      'Lists every parent company tracked in the system with its imported loan count. ' +
      'Use to find what parents exist before drilling in via get_loans.',
    parameters: { type: 'object', properties: {} },
  },
]

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>

// Load the same inputs runForecast() takes. Cached per request handler in the
// API route — the agent typically calls multiple tools per turn, no need to
// re-fetch every time.
async function loadForecastInput() {
  const sb = createServiceClient()

  const { data: versions } = await sb
    .from('current_report_versions').select('*').eq('is_active', true)
  if (!versions?.length) throw new Error('No active version. Import a Current Report.')
  const version = versions[0]

  const { data: settings } = await sb
    .from('forecast_settings').select('*').eq('is_active', true).maybeSingle()
  if (!settings) throw new Error('No active forecast_settings row.')

  const [loans, builders, programs, lbProjects, newOrigs, hhhJv, aAndD, parents, patterns, mappings] =
    await Promise.all([
      sb.from('loans').select('*').eq('version_id', version.id),
      sb.from('builders').select('*'),
      sb.from('loan_programs').select('*'),
      sb.from('land_bucket_projects').select('*'),
      sb.from('new_origination_schedule').select('*'),
      sb.from('hhh_jv_projects').select('*'),
      sb.from('a_and_d_loans').select('*'),
      sb.from('parent_companies').select('*'),
      sb.from('parent_company_patterns').select('*'),
      sb.from('borrower_parent_mapping').select('*'),
    ])

  return {
    loans: (loans.data ?? []) as Loan[],
    builders: (builders.data ?? []) as Builder[],
    loanPrograms: (programs.data ?? []) as LoanProgram[],
    landBucketProjects: (lbProjects.data ?? []) as LandBucketProject[],
    newOriginations: (newOrigs.data ?? []) as NewOriginationEntry[],
    hhhJvProjects: (hhhJv.data ?? []) as HHHJVProject[],
    aAndDLoans: (aAndD.data ?? []) as AAndDLoan[],
    parentCompanies: (parents.data ?? []) as ParentCompany[],
    parentCompanyPatterns: (patterns.data ?? []) as ParentCompanyPattern[],
    borrowerParentMappings: (mappings.data ?? []) as BorrowerParentMapping[],
    settings: settings as ForecastSettings,
    versionLabel: version.label,
    asOfDate: (version.as_of_date as string | null)
      || (version.created_at as string | null)?.slice(0, 10)
      || new Date().toISOString().slice(0, 10),
  }
}

// Memoize the forecast result for the lifetime of one /api/ask request — the
// agent may call get_portfolio_summary then get_monthly_balance back-to-back
// and there's no need to re-run the engine.
let cachedForecast: { result: ForecastResult; ts: number } | null = null
async function getForecast(): Promise<ForecastResult> {
  if (cachedForecast && Date.now() - cachedForecast.ts < 60_000) return cachedForecast.result
  const input = await loadForecastInput()
  const result = runForecast(input)
  cachedForecast = { result, ts: Date.now() }
  return result
}

// Trim a MonthlyBalance to just the fields the agent needs — the engine
// emits ~40 fields per month, most internal. Keeps the function-response
// payload small (Gemini's context isn't free even when the API is).
function trimMonth(m: import('@/lib/types').MonthlyBalance) {
  return {
    month: m.month,
    label: m.label,
    active_sfr: m.active_sfr,
    active_mfr: m.active_mfr,
    active_and: m.active_and,
    active_raw_land: m.active_raw_land,
    active_finished_lots: m.active_finished_lots,
    forecasted_sfr: m.forecasted_sfr,
    forecasted_mfr: m.forecasted_mfr,
    hhh_jv: m.hhh,
    land_bucket: m.land_bucket,
    payoffs_amount: m.payoffs_amount,
    new_originations_count: m.new_originations_count,
    new_originations_amount: m.new_originations_amount,
    total_loans: m.total_loans,
    total_all: m.total_all,
  }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  async get_portfolio_summary() {
    const result = await getForecast()
    const m0 = result.months[0]
    return {
      as_of_date: result.as_of_date,
      version_label: result.version_label,
      total_active_loans: result.total_active_loans,
      month_zero_fraction: result.reconciliation.month_zero_fraction,
      current_month: trimMonth(m0),
      active_loans_outstanding_by_segment: result.active_loans_outstanding,
    }
  },

  async get_monthly_balance(args) {
    const offset = Math.max(0, Math.floor(Number(args.month_offset) || 0))
    const result = await getForecast()
    const m = result.months[offset]
    if (!m) return { error: `No month at offset ${offset}; horizon has ${result.months.length} months.` }
    return trimMonth(m)
  },

  async get_loans(args) {
    const sb = createServiceClient()
    const { data: versions } = await sb
      .from('current_report_versions').select('id').eq('is_active', true)
    if (!versions?.length) return { error: 'No active version.' }

    let q = sb.from('loans').select(
      'loan_number, borrower, loan_program, loan_type, ' +
      'current_loan_amount, loan_amount_disbursed, current_loan_due_date, development_name'
    ).eq('version_id', versions[0].id)

    if (typeof args.loan_type === 'string') q = q.eq('loan_type', args.loan_type)
    if (typeof args.borrower_contains === 'string' && args.borrower_contains.trim()) {
      q = q.ilike('borrower', `%${args.borrower_contains.trim()}%`)
    }
    const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit) || 25)))
    q = q.limit(limit).order('current_loan_amount', { ascending: false })

    const { data, error } = await q
    if (error) return { error: error.message }
    return { count: data?.length ?? 0, loans: data ?? [] }
  },

  async get_approved_loans(args) {
    const sb = createServiceClient()
    let q = sb.from('approved_loans').select(
      'loan_type, date_approved, borrower_project_name, lc_approval_expiration, ' +
      'status, date_completed, disposition_notes, next_steps_notes, loan_amount'
    ).order('date_approved', { ascending: false })
    if (typeof args.status === 'string') q = q.eq('status', args.status)
    const { data, error } = await q
    if (error) return { error: error.message }
    return { count: data?.length ?? 0, approved_loans: data ?? [] }
  },

  async get_parent_companies() {
    const result = await getForecast()
    return {
      parents: result.parent_companies.map(p => ({
        id: p.id,
        name: p.name,
        loan_count: result.parent_loan_counts[p.id] ?? 0,
      })),
      unassigned_loan_count: result.parent_loan_counts['__none__'] ?? 0,
    }
  },
}

// System prompt: domain context + tool-use guidance. Kept long-ish because
// the model needs business-rule context (HHH/JV semantics, Truth 4, FL rule)
// to answer correctly. Gemini Flash has a 1M context window so this is free
// budget-wise.
export const SYSTEM_INSTRUCTION = `
You are the SNCC Forecasting analytical assistant. You answer questions about
Security National's construction-lending portfolio by calling tools and
synthesizing the results. Never invent numbers — every numeric claim must come
from a tool result you can cite.

Domain context (these are TRUE rules, not preferences):
- Loan segments: SFR (single-family construction), MFR (multifamily), A&D
  (acquisition + development), Raw Land, Finished Lots, OTC (one-time close —
  rolls into SFR for dashboard rollups but kept as its own loan_type).
- "Active <segment>" = sum of loan_amount_disbursed for imported loans of
  that type, decaying to 0 at each loan's current_loan_due_date.
- "Forecasted SFR/MFR" = drawn balance of new-origination cohorts SCHEDULED
  on the /originations tab — NOT including Land Bucket-spawned verticals.
  Month 0 is prorated by remaining-month fraction (Truth 4); future months
  use the full draw curve.
- HHH/JV is an EQUITY investment sourced from the manual /hhh-jv tab — it
  is NOT a loan. Included in Total Outstanding (All) but excluded from
  Total Outstanding (Loans).
- Land Bucket is land/inventory from the /land-bucket tab — also not a loan.
- "Current balance" of an imported loan = loan_amount_disbursed (cash drawn).
- Active Loan (Outstanding) tile sums loan_amount_disbursed for ALL active
  (non-matured) loan-type segments regardless of chip filter.

Tool guidance:
- For any open-ended question, start with get_portfolio_summary — it gives
  you the current-month snapshot in one call.
- Drill into specific months with get_monthly_balance (offset 0 = current).
- For questions about specific loans / borrowers / segments, use get_loans
  with appropriate filters.
- For pipeline questions ("what's about to close", "approved but not funded"),
  use get_approved_loans with status="Open".
- For "who is this parent" or "which parents exist", use get_parent_companies.

Style:
- Lead with the answer in one sentence, then the supporting numbers.
- Format dollar amounts as $X.XM or $X.Xk; cite the month label (e.g.
  "Jun 26") not just the offset.
- If a tool returns an error or zero rows, say so plainly; don't paper over it.
- Don't restate the question; don't pad with disclaimers.
`.trim()
