import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'
import { parseCurrentReportWithDiagnostics } from '@/lib/parser'

export async function POST(req: NextRequest) {
  try {
    const fd    = await req.formData()
    const file  = fd.get('file') as File | null
    const label = (fd.get('label') as string) || `Import ${new Date().toLocaleDateString()}`
    const notes = (fd.get('notes') as string) || null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Reject anything that isn't a reasonably-sized .xlsx before reading it.
    const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx files are accepted.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 15 MB limit.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(buffer)

    if (loans.length === 0) {
      const lines: string[] = [
        'No loans found. Diagnostics:',
        `- Sheets in workbook: ${diagnostics.sheet_names.join(', ') || '(none)'}`,
        `- Sheet chosen: ${diagnostics.chosen_sheet ?? '(none)'}`,
        `- Header row found at spreadsheet row: ${
          diagnostics.header_row_index === null ? '(not found)' : diagnostics.header_row_index + 1
        }`,
        `- Total rows in chosen sheet: ${diagnostics.total_rows}`,
        `- Rows with a non-empty Loan Number: ${diagnostics.rows_with_loan_number}`,
        `- Header row preview: ${
          diagnostics.header_row_preview
            ? JSON.stringify(diagnostics.header_row_preview)
            : '(none)'
        }`,
        `- Loan Number column index (-1 = not detected): ${diagnostics.detected_columns.loan_number ?? -1}`,
        `- Borrower column index (-1 = not detected): ${diagnostics.detected_columns.borrower ?? -1}`,
      ]
      return NextResponse.json({ error: lines.join('\n'), diagnostics }, { status: 422 })
    }

    const sb = createServiceClient()

    // Deactivate current active version
    await sb.from('current_report_versions').update({ is_active: false }).eq('is_active', true)

    // Create new version
    const { data: version, error: ve } = await sb
      .from('current_report_versions')
      .insert({
        label,
        filename:   file.name,
        is_active:  true,
        loan_count: loans.length,
        as_of_date: new Date().toISOString().split('T')[0],
        notes,
      })
      .select()
      .single()

    if (ve) throw ve

    // Insert loans in batches of 500
    const withVersion = loans.map(l => ({ ...l, version_id: version.id }))
    for (let i = 0; i < withVersion.length; i += 500) {
      const { error } = await sb.from('loans').insert(withVersion.slice(i, i + 500))
      if (error) throw error
    }

    return NextResponse.json({ version_id: version.id, loan_count: loans.length, label })
  } catch (e) {
    console.error('/api/import error:', e)
    return apiError(e)
  }
}
