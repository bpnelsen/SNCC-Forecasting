import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  computePayoffAverages, parentResolver, parseReportDate, readPayoffRecords, termMonths, type PayoffRecord,
} from './payoff-import'

const TODAY = '2026-10-06'

const rec = (over: Partial<PayoffRecord> = {}): PayoffRecord => ({
  loan_number: 'L', borrower: 'Arive Homes, LLC', loan_program: 'Single Family Residential Construction',
  status: 'Completed', funded: '2025-01-01', completed: '2025-07-01', ...over,
})

// Five completed SFR loans for Arive, 6.0 / 6.5 / 7.0 / 7.5 / 8.0 months.
const ariveFive = [0, 15, 30, 46, 61].map((extraDays, i) => {
  const d = new Date(Date.UTC(2025, 6, 1 + extraDays))
  return rec({ loan_number: `A${i}`, completed: d.toISOString().slice(0, 10) })
})

const resolve = parentResolver(
  [{ borrower: 'Odd Name LLC', parent_company_id: 'p-holmes' }],
  [{ parent_company_id: 'p-arive', pattern: 'Arive' }, { parent_company_id: 'p-holmes', pattern: 'holmes' }],
)

describe('parseReportDate', () => {
  it('reads the report formats', () => {
    expect(parseReportDate('08/27/2026 07:52:18')).toBe('2026-08-27')
    expect(parseReportDate('7/5/2025')).toBe('2025-07-05')
    expect(parseReportDate('2025-07-05T10:00:00Z')).toBe('2025-07-05')
    expect(parseReportDate(45658)).toBe('2025-01-01')   // Excel serial
    expect(parseReportDate('')).toBeNull()
    expect(parseReportDate('n/a')).toBeNull()
  })
})

describe('termMonths', () => {
  it('measures funded → completed in months to the tenth', () => {
    expect(termMonths('2025-01-01', '2025-07-01')).toBe(5.9)   // 181 days
    expect(termMonths('2025-01-01', '2025-07-17')).toBe(6.5)
    expect(termMonths('2025-03-25', '2025-04-02')).toBe(0.3)
  })
})

describe('parentResolver', () => {
  it('uses explicit mappings, then case-insensitive patterns', () => {
    expect(resolve('Odd Name LLC')).toBe('p-holmes')
    expect(resolve('ARIVE HOMES, LLC')).toBe('p-arive')
    expect(resolve('Holmes Desert Color, LLC')).toBe('p-holmes')
    expect(resolve('Someone Else')).toBe('__none__')
  })
})

describe('computePayoffAverages', () => {
  it('averages a parent × type with 5+ payoffs, and fills the Default row', () => {
    const r = computePayoffAverages(ariveFive, resolve, TODAY)
    const arive = r.rows.find(x => x.parent_company_id === 'p-arive' && x.loan_type === 'SFR')
    const def = r.rows.find(x => x.parent_company_id === null && x.loan_type === 'SFR')
    const expected = Math.round(ariveFive.reduce((s, x) => s + termMonths(x.funded!, x.completed!), 0) / 5 * 10) / 10
    expect(arive).toMatchObject({ payoff_months: expected, loan_count: 5, source: 'import' })
    expect(def).toMatchObject({ payoff_months: expected, loan_count: 5 })
  })

  it('leaves a parent × type with under 5 payoffs blank', () => {
    const r = computePayoffAverages(ariveFive.slice(0, 4), resolve, TODAY)
    expect(r.rows).toHaveLength(0)
    expect(r.summary.cells_below_min).toBe(2)   // Arive SFR and Default SFR
  })

  it('counts only Completed loans completed within the last 2 years', () => {
    const r = computePayoffAverages([
      ...ariveFive,
      rec({ status: 'Active', completed: null }),
      rec({ completed: '2024-10-05' }),   // a day before the window
      rec({ completed: '2024-10-06', funded: '2024-01-01' }),
    ], resolve, TODAY)
    expect(r.summary.completed).toBe(7)
    expect(r.summary.completed_in_window).toBe(6)
    expect(r.rows.find(x => x.parent_company_id === 'p-arive')?.loan_count).toBe(6)
  })

  it('classifies by loan program, like the importer', () => {
    const mfr = ariveFive.map(x => ({ ...x, loan_program: 'Multifamily Residential Construction' }))
    const land = ariveFive.map(x => ({ ...x, loan_program: 'Land Aquisition and Development Loan' }))
    const r = computePayoffAverages([...mfr, ...land], resolve, TODAY)
    expect(r.rows.filter(x => x.parent_company_id === null).map(x => x.loan_type).sort()).toEqual(['MFR', 'RAW_LAND'])
  })

  it('counts unmatched borrowers toward the Default row only, and reports them', () => {
    const r = computePayoffAverages(ariveFive.map(x => ({ ...x, borrower: 'Unknown Builder' })), resolve, TODAY)
    expect(r.rows.map(x => x.parent_company_id)).toEqual([null])
    expect(r.summary.unassigned_loans).toBe(5)
    expect(r.summary.unassigned_borrowers).toEqual([{ borrower: 'Unknown Builder', loans: 5 }])
  })

  it('skips loans with missing or reversed dates, and types with no schedule', () => {
    const r = computePayoffAverages([
      rec({ funded: null }),
      rec({ funded: '2025-08-01', completed: '2025-07-01' }),
      rec({ loan_program: 'WAB Builder Finance' }),
    ], resolve, TODAY)
    expect(r.summary.missing_dates).toBe(2)
    expect(r.summary.unclassified).toBe(1)
    expect(r.summary.used).toBe(0)
  })
})

describe('readPayoffRecords', () => {
  const workbook = (rows: unknown[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Current Report')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
  const header = ['Loan Number', 'Borrower', 'Loan Program', 'Loan Funded Date', 'Current Loan Status',
    'Loan Status Completed Date (Most Recent Change)']

  it('finds the header row below the report preamble and reads columns by name', () => {
    const buf = workbook([
      ['REPORT DATE', '10/06/2026'], ['Borrower first name'], [],
      header,
      ['SN1', 'Arive Homes, LLC', 'Single Family Residential Construction', '01/02/2025', 'Completed', '07/15/2025 08:00:00'],
      ['', 'blank loan number is skipped'],
      ['SN2', 'Holmes Homes, Inc.', 'OTC', '02/01/2025', 'Active', ''],
    ])
    expect(readPayoffRecords(buf)).toEqual([
      { loan_number: 'SN1', borrower: 'Arive Homes, LLC', loan_program: 'Single Family Residential Construction',
        status: 'Completed', funded: '2025-01-02', completed: '2025-07-15' },
      { loan_number: 'SN2', borrower: 'Holmes Homes, Inc.', loan_program: 'OTC',
        status: 'Active', funded: '2025-02-01', completed: null },
    ])
  })

  it('names the columns it needs when the report lacks them', () => {
    const buf = workbook([['Loan Number', 'Borrower', 'Loan Program', 'Loan Funded Date'], ['SN1', 'x', 'y', 'z']])
    expect(() => readPayoffRecords(buf)).toThrow(/Current Loan Status|status/)
  })
})
