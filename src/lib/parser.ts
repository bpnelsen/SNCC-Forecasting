import * as XLSX from 'xlsx'
import { Loan, LoanType } from './types'

function classifyLoan(program: string, borrower: string, development: string): LoanType {
  const p = (program || '').toLowerCase()
  const b = (borrower || '').toLowerCase()
  const d = (development || '').toLowerCase()

  if (b.includes('holmes') || d.includes('oquirrh')) return 'HHH'
  if (p.includes('multifamily') || p.includes('multi-family') || p.includes(' mf')) return 'MFR'
  if (p.includes('raw land') || p.includes('raw')) return 'RAW_LAND'
  if (p.includes('acquisition') || p.includes('a&d') || p.includes('development loan')) return 'A&D'
  if (p.includes('finished lot') || p.includes('lot loan')) return 'FINISHED_LOTS'
  if (
    p.includes('single family') || p.includes('sfr') ||
    p.includes('residential construction') || p.includes('construction')
  ) return 'SFR'

  return 'UNKNOWN'
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function toDate(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (!s) return null
  const parsed = new Date(s)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0]
}

export function parseCurrentReport(buffer: Buffer): Loan[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })

  // Find the "Current Report" sheet (case-insensitive)
  const sheetName = wb.SheetNames.find(n =>
    n.toLowerCase().replace(/\s/g, '') === 'currentreport'
  ) || wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row (look for 'Borrower' or 'Loan Number')
  let headerRow = -1
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i] as string[]
    if (row.some(c => typeof c === 'string' && c.toLowerCase().includes('borrower'))) {
      headerRow = i
      break
    }
  }
  if (headerRow === -1) headerRow = 0

  const headers = (rows[headerRow] as string[]).map(h => String(h || '').toLowerCase().trim())

  const idx = (keyword: string) => headers.findIndex(h => h.includes(keyword))

  const col = {
    borrower:          idx('borrower'),
    loan_number:       idx('loan number') !== -1 ? idx('loan number') : idx('loan #'),
    loan_program:      idx('loan program') !== -1 ? idx('loan program') : idx('program'),
    original_amt:      idx('original loan amount') !== -1 ? idx('original loan amount') : idx('original'),
    funded_date:       idx('funded date') !== -1 ? idx('funded date') : idx('fund'),
    due_date:          idx('due date') !== -1 ? idx('due date') : idx('due'),
    current_amt:       idx('current loan amount') !== -1 ? idx('current loan amount') : idx('current loan'),
    disbursed:         idx('disbursed'),
    remaining:         idx('remaining'),
    interest_reserve:  idx('interest reserve'),
    rate:              idx('interest rate') !== -1 ? idx('interest rate') : idx('rate'),
    accrued:           idx('accrued'),
    project:           idx('project name') !== -1 ? idx('project name') : idx('project'),
    unit:              idx('unit'),
    development:       idx('development'),
    subdivision:       idx('subdivision'),
  }

  const loans: Loan[] = []

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const loanNum = String(row[col.loan_number] || '').trim()
    if (!loanNum) continue

    const borrower    = String(row[col.borrower] || '').trim()
    const program     = String(row[col.loan_program] || '').trim()
    const development = col.development >= 0 ? String(row[col.development] || '').trim() : ''

    const disbursed  = toNum(col.disbursed >= 0 ? row[col.disbursed] : 0)
    const currentAmt = toNum(col.current_amt >= 0 ? row[col.current_amt] : 0)

    // Col Q logic: MAX(disbursed, current_loan_amount * 0.92)
    const projected = Math.max(disbursed, currentAmt * 0.92)

    loans.push({
      borrower,
      loan_number:              loanNum,
      loan_program:             program,
      original_loan_amount:     toNum(col.original_amt >= 0 ? row[col.original_amt] : 0),
      loan_funded_date:         toDate(col.funded_date >= 0 ? row[col.funded_date] : null),
      current_loan_due_date:    toDate(col.due_date >= 0 ? row[col.due_date] : null),
      current_loan_amount:      currentAmt,
      loan_amount_disbursed:    disbursed,
      loan_amount_remaining:    toNum(col.remaining >= 0 ? row[col.remaining] : 0),
      interest_reserve_balance: toNum(col.interest_reserve >= 0 ? row[col.interest_reserve] : 0),
      current_interest_rate:    toNum(col.rate >= 0 ? row[col.rate] : 0),
      interest_accrued_mtd:     toNum(col.accrued >= 0 ? row[col.accrued] : 0),
      project_name:             col.project >= 0 ? String(row[col.project] || '').trim() || null : null,
      unit_name:                col.unit >= 0 ? String(row[col.unit] || '').trim() || null : null,
      development_name:         development || null,
      subdivision_name:         col.subdivision >= 0 ? String(row[col.subdivision] || '').trim() || null : null,
      projected_balance:        projected,
      loan_type:                classifyLoan(program, borrower, development),
    })
  }

  return loans
}
