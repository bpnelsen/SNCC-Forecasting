import * as XLSX from 'xlsx'
import { classifyLoan, findHeaderRow } from './parser'
import { DAYS_PER_MONTH, PAYOFF_LOAN_TYPES, UNASSIGNED_PARENT_KEY } from './calculator'
import type { BorrowerParentMapping, ParentCompanyPattern, PayoffLoanType, PayoffSchedule } from './types'

// Payoff Schedules → Import: average months from funding to payoff, per parent
// company × loan type, measured from the loans a loan report marks Completed.
//
//   Completed  = Current Loan Status is "Completed"                  (column Q)
//   Term       = Loan Funded Date → Loan Status Completed Date       (J → R)
//                in days ÷ DAYS_PER_MONTH, to the tenth of a month
//   Window     = completed within the last WINDOW_YEARS years
//   Cell       = average term of its loans, needing MIN_LOANS payoffs
//   Default row = every loan of that type, whatever its parent
//
// Loan type uses the import's own classifyLoan (Loan Program only) and parent
// company the engine's borrower attribution, so a cell's average describes
// exactly the loans the forecast will apply it to.

export const WINDOW_YEARS = 2
export const MIN_LOANS = 5

export interface PayoffRecord {
  loan_number: string
  borrower: string
  loan_program: string
  status: string
  funded: string | null      // YYYY-MM-DD
  completed: string | null   // YYYY-MM-DD
}

export interface PayoffImportResult {
  rows: PayoffSchedule[]
  summary: {
    window_start: string
    window_end: string
    loans_in_report: number
    completed: number
    completed_in_window: number
    used: number
    missing_dates: number
    // Completed loans whose type has no payoff schedule (HHH / UNKNOWN).
    unclassified: number
    unassigned_loans: number
    unassigned_borrowers: { borrower: string; loans: number }[]
    by_type: Record<string, { loans: number; average: number | null }>
    cells_filled: number
    cells_below_min: number
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

// Report dates arrive as "MM/DD/YYYY", "MM/DD/YYYY hh:mm:ss", ISO strings or
// Excel serials. Parsed explicitly so the server's time zone can't shift a day.
export function parseReportDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

const dayNumber = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000

/** Months from one YYYY-MM-DD to another, to the tenth. */
export function termMonths(funded: string, completed: string): number {
  return round1((dayNumber(completed) - dayNumber(funded)) / DAYS_PER_MONTH)
}

/** Reads the loan report into one record per loan. */
export function readPayoffRecords(buffer: Buffer | ArrayBuffer): PayoffRecord[] {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: false })
  for (const name of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    const hr = findHeaderRow(rows)
    if (hr === -1) continue
    const headers = (rows[hr] ?? []).map(h => String(h ?? '').toLowerCase().trim())
    const exact = (h: string) => headers.indexOf(h)
    const starts = (h: string) => headers.findIndex(x => x.startsWith(h))
    const col = {
      loan_number: exact('loan number'),
      borrower:    exact('borrower'),
      program:     exact('loan program'),
      funded:      exact('loan funded date'),
      status:      exact('current loan status'),
      completed:   starts('loan status completed date'),
    }
    const missing = Object.entries(col).filter(([, i]) => i === -1).map(([k]) => k)
    if (missing.length > 0) {
      throw new Error(
        `The report is missing column(s): ${missing.join(', ')}. It needs Loan Number, Borrower, ` +
        'Loan Program, Loan Funded Date, Current Loan Status and Loan Status Completed Date.',
      )
    }
    const out: PayoffRecord[] = []
    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i] ?? []
      const loanNumber = String(r[col.loan_number] ?? '').trim()
      if (!loanNumber) continue
      out.push({
        loan_number:  loanNumber,
        borrower:     String(r[col.borrower] ?? '').trim(),
        loan_program: String(r[col.program] ?? '').trim(),
        status:       String(r[col.status] ?? '').trim(),
        funded:       parseReportDate(r[col.funded]),
        completed:    parseReportDate(r[col.completed]),
      })
    }
    return out
  }
  throw new Error('No sheet in the workbook has a recognisable loan report header row.')
}

/** Borrower → parent company id, same rules as the engine: overrides, then patterns. */
export function parentResolver(
  mappings: Pick<BorrowerParentMapping, 'borrower' | 'parent_company_id'>[],
  patterns: Pick<ParentCompanyPattern, 'parent_company_id' | 'pattern'>[],
): (borrower: string) => string {
  const overrides = new Map(mappings.map(m => [m.borrower, m.parent_company_id]))
  const pats = patterns.map(p => ({ id: p.parent_company_id, pattern: p.pattern.toLowerCase() }))
  return (borrower: string) => {
    if (!borrower) return UNASSIGNED_PARENT_KEY
    const explicit = overrides.get(borrower)
    if (explicit) return explicit
    const hay = borrower.toLowerCase()
    return pats.find(p => p.pattern.length > 0 && hay.includes(p.pattern))?.id ?? UNASSIGNED_PARENT_KEY
  }
}

export function computePayoffAverages(
  records: PayoffRecord[],
  parentOf: (borrower: string) => string,
  today: string,
): PayoffImportResult {
  const windowStart = `${Number(today.slice(0, 4)) - WINDOW_YEARS}${today.slice(4, 10)}`
  const completed = records.filter(r => r.status.toLowerCase() === 'completed')
  const inWindow = completed.filter(r => r.completed && r.completed >= windowStart && r.completed <= today)

  const terms = new Map<string, number[]>()   // `${parentId}|${type}` and `|${type}` (default)
  const push = (key: string, m: number) => { const a = terms.get(key); if (a) a.push(m); else terms.set(key, [m]) }
  const unassigned = new Map<string, number>()
  let used = 0, missingDates = 0, unclassified = 0, unassignedLoans = 0

  for (const r of inWindow) {
    if (!r.funded || !r.completed || r.completed < r.funded) { missingDates++; continue }
    const type = classifyLoan(r.loan_program)
    if (!(PAYOFF_LOAN_TYPES as string[]).includes(type)) { unclassified++; continue }
    const months = termMonths(r.funded, r.completed)
    used++
    push(`|${type}`, months)
    const parent = parentOf(r.borrower)
    if (parent === UNASSIGNED_PARENT_KEY) {
      unassignedLoans++
      unassigned.set(r.borrower || '(blank)', (unassigned.get(r.borrower || '(blank)') ?? 0) + 1)
    } else {
      push(`${parent}|${type}`, months)
    }
  }

  const rows: PayoffSchedule[] = []
  let below = 0
  for (const [key, list] of terms) {
    if (list.length < MIN_LOANS) { below++; continue }
    const [parent, type] = key.split('|')
    rows.push({
      parent_company_id: parent || null,
      loan_type: type as PayoffLoanType,
      payoff_months: round1(list.reduce((a, b) => a + b, 0) / list.length),
      loan_count: list.length,
      source: 'import',
    })
  }

  const byType: PayoffImportResult['summary']['by_type'] = {}
  for (const t of PAYOFF_LOAN_TYPES) {
    const list = terms.get(`|${t}`) ?? []
    byType[t] = { loans: list.length, average: list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null }
  }

  return {
    rows,
    summary: {
      window_start: windowStart,
      window_end: today,
      loans_in_report: records.length,
      completed: completed.length,
      completed_in_window: inWindow.length,
      used,
      missing_dates: missingDates,
      unclassified,
      unassigned_loans: unassignedLoans,
      unassigned_borrowers: [...unassigned.entries()]
        .map(([borrower, loans]) => ({ borrower, loans }))
        .sort((a, b) => b.loans - a.loans),
      by_type: byType,
      cells_filled: rows.length,
      cells_below_min: below,
    },
  }
}
