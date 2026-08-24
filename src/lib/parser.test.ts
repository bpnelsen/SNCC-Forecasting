import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCurrentReportWithDiagnostics, DEFAULT_DRAW_PCT_ACTIVE } from './parser'

/**
 * Builds an in-memory .xlsx buffer from rows of cell values, so these tests
 * exercise the real SheetJS read path rather than a stubbed sheet.
 */
function workbook(rows: unknown[][], sheetName = 'Current Report'): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const HEADERS = [
  'Borrower', 'Loan Number', 'Loan Program', 'Original Loan Amount',
  'Loan Funded Date', 'Current Loan Due Date', 'Current Loan Amount',
  'Loan Amount Disbursed', 'Loan Amount Remaining', 'Interest Reserve Balance',
  'Current Interest Rate', 'Interest Accrued Month-To-Date',
  'Collateral Name Associated', 'Unit Name', 'Development Name', 'Subdivision Name',
]

const row = (over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    'Borrower': 'Arive Homes', 'Loan Number': '1001',
    'Loan Program': 'Single Family Construction', 'Original Loan Amount': 500_000,
    'Loan Funded Date': '2026-01-15', 'Current Loan Due Date': '2027-01-15',
    'Current Loan Amount': 400_000, 'Loan Amount Disbursed': 300_000,
    'Loan Amount Remaining': 100_000, 'Interest Reserve Balance': 0,
    'Current Interest Rate': 0.0625, 'Interest Accrued Month-To-Date': 0,
    'Collateral Name Associated': 'Lot 12', 'Unit Name': 'A',
    'Development Name': 'Broadhollow', 'Subdivision Name': 'Phase 1',
    ...over,
  }
  return HEADERS.map(h => base[h] ?? '')
}

describe('header row detection', () => {
  it('finds a header row far below row 1, past decoy strings', () => {
    // The canonical SNCC export puts headers on row 31 and fills the block
    // above with things like "Borrower first name" that a naive substring
    // search would lock onto.
    const rows: unknown[][] = []
    for (let i = 0; i < 30; i++) {
      rows.push(['Borrower first name', 'Co-Borrower 1 name', 'Report generated'])
    }
    rows.push(HEADERS)
    rows.push(row())

    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(workbook(rows))
    expect(diagnostics.header_row_index).toBe(30)
    expect(loans).toHaveLength(1)
  })

  it('picks the sheet that has a recognisable header row', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['notes'], ['nothing here']]), 'Cover')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, row()]), 'Data')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(buf)
    expect(diagnostics.chosen_sheet).toBe('Data')
    expect(loans).toHaveLength(1)
  })
})

describe('borrower column detection', () => {
  it('prefers the exact "Borrower" column over an earlier Co-Borrower column', () => {
    // Regression: idx('borrower') returned the FIRST header merely *containing*
    // "borrower", so a leading "Co-Borrower 1 Name" column silently became the
    // borrower for every loan — which then breaks parent-company mapping.
    const headers = ['Co-Borrower 1 Name', ...HEADERS]
    const dataRow = ['SPOUSE NAME', ...row()]

    const { loans } = parseCurrentReportWithDiagnostics(workbook([headers, dataRow]))
    expect(loans[0].borrower).toBe('Arive Homes')
  })
})

describe('projected balance', () => {
  it('uses the supplied draw percentage rather than a hardcoded 0.92', () => {
    // disbursed 300k vs 400k × 0.80 = 320k → the draw side wins.
    const { loans } = parseCurrentReportWithDiagnostics(
      workbook([HEADERS, row()]), 0.80,
    )
    expect(loans[0].projected_balance).toBeCloseTo(320_000, 2)
  })

  it('takes the disbursed amount when it exceeds the draw calculation', () => {
    const { loans } = parseCurrentReportWithDiagnostics(
      workbook([HEADERS, row({ 'Loan Amount Disbursed': 390_000 })]), 0.80,
    )
    expect(loans[0].projected_balance).toBeCloseTo(390_000, 2)
  })

  it('falls back to the default for a nonsense draw percentage', () => {
    // A 0 / negative / NaN assumption would otherwise zero every projected
    // balance across the whole portfolio.
    for (const bad of [0, -1, Number.NaN]) {
      const { loans } = parseCurrentReportWithDiagnostics(workbook([HEADERS, row()]), bad)
      expect(loans[0].projected_balance).toBeCloseTo(400_000 * DEFAULT_DRAW_PCT_ACTIVE, 2)
    }
  })
})

describe('loan classification', () => {
  const classify = (program: string, borrower = 'Someone', dev = '') =>
    parseCurrentReportWithDiagnostics(workbook([
      HEADERS,
      row({ 'Loan Program': program, 'Borrower': borrower, 'Development Name': dev }),
    ])).loans[0].loan_type

  it('classifies the standard programs', () => {
    expect(classify('Single Family Construction')).toBe('SFR')
    expect(classify('Multifamily Construction')).toBe('MFR')
    expect(classify('Raw Land')).toBe('RAW_LAND')
    expect(classify('Acquisition & Development')).toBe('A&D')
    expect(classify('Finished Lot Loan')).toBe('FINISHED_LOTS')
  })

  it('classifies on Loan Program only, ignoring borrower and development', () => {
    // The earlier "borrower contains Holmes -> HHH" shortcut was deliberately
    // removed: parent-company attribution owns borrower mapping now, and the
    // HHH/JV segment is sourced from the manual /hhh-jv tab.
    expect(classify('Single Family Construction', 'Holmes Homes')).toBe('SFR')
    expect(classify('Single Family Construction', 'Someone', 'Oquirrh Ridge')).toBe('SFR')
  })

  it('handles the known program special cases', () => {
    expect(classify('Land Acquisition')).toBe('RAW_LAND')
    expect(classify('Land Aquisition')).toBe('RAW_LAND')   // known misspelling
    expect(classify('Memorial Investments')).toBe('A&D')
    expect(classify('OTC Construction')).toBe('OTC')
  })

  it('marks an unrecognised program UNKNOWN so the import can warn', () => {
    // UNKNOWN loans are folded into the HHH/JV segment by the engine, so a
    // renamed Loan Program in the export inflates HHH with no other signal.
    expect(classify('Bridge Facility 2026')).toBe('UNKNOWN')
  })
})

describe('row handling', () => {
  it('skips rows with no loan number', () => {
    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(workbook([
      HEADERS,
      row({ 'Loan Number': '1001' }),
      row({ 'Loan Number': '' }),
      row({ 'Loan Number': '1002' }),
    ]))
    expect(loans).toHaveLength(2)
    expect(diagnostics.rows_with_loan_number).toBe(2)
  })

  it('parses Excel serial dates and ISO strings alike', () => {
    const { loans } = parseCurrentReportWithDiagnostics(workbook([
      HEADERS,
      // 45678 is 2025-01-21 in Excel's 1900 date system.
      row({ 'Loan Funded Date': 45678, 'Current Loan Due Date': '2027-03-01' }),
    ]))
    expect(loans[0].loan_funded_date).toBe('2025-01-21')
    expect(loans[0].current_loan_due_date).toBe('2027-03-01')
  })

  it('reports an empty result with diagnostics instead of throwing', () => {
    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(
      workbook([['totally', 'unrelated'], ['a', 'b']]),
    )
    expect(loans).toHaveLength(0)
    expect(diagnostics.sheet_names.length).toBeGreaterThan(0)
  })
})
