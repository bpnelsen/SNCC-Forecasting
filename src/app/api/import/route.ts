import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseCurrentReportWithDiagnostics } from '@/lib/parser'
import { requireUser } from '@/lib/auth'

// Parsing a large workbook plus batched inserts can exceed Vercel's default
// 10s function limit, which used to abort the import midway.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Vercel caps a serverless request body at 4.5 MB. Checking here turns an
// opaque platform 413 into an actionable message.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const BATCH = 500

// Supabase / PostgREST errors are plain objects, so `String(e)` collapses
// them to "[object Object]". Surface message / details / hint / code so the
// import page tells the user something useful (missing column, FK violation,
// etc.) instead of swallowing the cause.
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean).map(String)
    if (parts.length) return parts.join(' · ')
    try { return JSON.stringify(e) } catch { /* fall through */ }
  }
  return String(e)
}

export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

  // Declared out here so the catch block can roll back a half-written version.
  let createdVersionId: string | null = null
  const sb = createServiceClient()

  try {
    const fd    = await req.formData()
    const file  = fd.get('file') as File | null
    const label = (fd.get('label') as string) || `Import ${new Date().toLocaleDateString()}`
    const notes = (fd.get('notes') as string) || null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({
        error:
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ` +
          `${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB upload limit. ` +
          'Delete unused sheets from the workbook, or save just the Current ' +
          'Report sheet to a new .xlsx and upload that.',
      }, { status: 413 })
    }

    // draw_pct_active drives the projected-balance formula and is baked into
    // each row at import time, so it has to be read before parsing. A missing
    // assumptions row just falls back to the parser's default.
    const { data: assumptions } = await sb
      .from('assumptions')
      .select('draw_pct_active')
      .eq('is_active', true)
      .maybeSingle()

    const buffer = Buffer.from(await file.arrayBuffer())
    const { loans, diagnostics } = parseCurrentReportWithDiagnostics(
      buffer,
      assumptions?.draw_pct_active ?? undefined,
    )

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

    // ── Data-quality warnings ────────────────────────────────────────────────
    // These two conditions silently distort the forecast, so they are surfaced
    // on the import screen rather than left to be found on the dashboard.
    const unknownCount = loans.filter(l => l.loan_type === 'UNKNOWN').length
    const noMaturityCount = loans.filter(l => !l.current_loan_due_date).length
    const warnings: string[] = []
    if (unknownCount > 0) {
      warnings.push(
        `${unknownCount} of ${loans.length} loans could not be classified from ` +
        'their Loan Program. Imported loans typed UNKNOWN are EXCLUDED from ' +
        'the dashboard portfolio totals entirely, so those balances are ' +
        'missing rather than misfiled. Check that the Loan Program values in ' +
        'this export still match the rules in src/lib/parser.ts (classifyLoan), ' +
        'or set the type per loan on the Loans tab.',
      )
    }
    if (noMaturityCount > 0) {
      warnings.push(
        `${noMaturityCount} of ${loans.length} loans have no maturity date. The ` +
        'forecast holds those balances flat for the whole horizon instead of ' +
        'paying them off — verify the "Current Loan Due Date" column was ' +
        `detected (column index ${diagnostics.detected_columns.due_date ?? -1}).`,
      )
    }

    // ── Write path, ordered so a failure can't destroy the good version ─────
    // Previously this deactivated the live version FIRST, so a timeout or a
    // failed batch left the app pointing at a half-imported version with the
    // known-good one already switched off. Now the new version is written
    // inactive, fully populated, verified, and only then promoted.
    const { data: version, error: ve } = await sb
      .from('current_report_versions')
      .insert({
        label,
        filename:   file.name,
        is_active:  false,
        loan_count: loans.length,
        as_of_date: new Date().toISOString().split('T')[0],
        notes,
      })
      .select()
      .single()

    if (ve) throw ve
    createdVersionId = version.id

    const withVersion = loans.map(l => ({ ...l, version_id: version.id }))
    for (let i = 0; i < withVersion.length; i += BATCH) {
      const { error } = await sb.from('loans').insert(withVersion.slice(i, i + BATCH))
      if (error) throw error
    }

    // Verify what actually landed before promoting. Catches a silently short
    // insert as well as an outright error.
    const { count, error: ce } = await sb
      .from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('version_id', version.id)
    if (ce) throw ce
    if (count !== loans.length) {
      throw new Error(
        `Only ${count ?? 0} of ${loans.length} loans were stored — ` +
        'the import was rolled back and the previous version is still active.',
      )
    }

    // Promote: deactivate whatever was live, then activate the new version.
    // The unique partial index idx_one_active_version enforces at most one.
    const { error: de } = await sb
      .from('current_report_versions')
      .update({ is_active: false })
      .eq('is_active', true)
    if (de) throw de

    const { error: ae } = await sb
      .from('current_report_versions')
      .update({ is_active: true })
      .eq('id', version.id)
    if (ae) throw ae

    return NextResponse.json({
      version_id: version.id,
      loan_count: loans.length,
      label,
      warnings,
      unknown_count: unknownCount,
      no_maturity_count: noMaturityCount,
    })
  } catch (e) {
    console.error('/api/import error:', e)

    // Roll back the partial version so the DB is left exactly as it was. The
    // loans FK is `on delete cascade`, so this clears its rows too.
    if (createdVersionId) {
      try {
        await sb.from('current_report_versions').delete().eq('id', createdVersionId)
      } catch (cleanupError) {
        console.error('/api/import rollback failed:', cleanupError)
        return NextResponse.json({
          error:
            `${errMessage(e)} — and cleaning up the partial version ` +
            `${createdVersionId} also failed. Delete it manually on the ` +
            'Versions tab.',
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      error: `${errMessage(e)}${
        createdVersionId ? ' (import rolled back; previous version still active)' : ''
      }`,
    }, { status: 500 })
  }
}
