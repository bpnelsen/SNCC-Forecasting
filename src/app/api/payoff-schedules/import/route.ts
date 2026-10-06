import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { createServiceClient } from '@/lib/supabase'
import { computePayoffAverages, parentResolver, readPayoffRecords } from '@/lib/payoff-import'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Same Vercel body limit as /api/import.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// POST a loan report (multipart, field "file"). Returns the averaged payoff
// months per parent company × loan type for the Payoff Schedules grid. Saves
// nothing: the page fills the grid, the analyst reviews or edits it, and Save
// writes it through /api/payoff-schedules as usual.
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({
        error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the 4 MB upload limit.`,
      }, { status: 413 })
    }

    const records = readPayoffRecords(Buffer.from(await file.arrayBuffer()))

    // Parent attribution uses the same tables the forecast does, so each
    // average lands on the parent the engine will apply it to.
    const sb = createServiceClient()
    const [{ data: mappings }, { data: patterns }] = await Promise.all([
      sb.from('borrower_parent_mapping').select('borrower, parent_company_id'),
      sb.from('parent_company_patterns').select('parent_company_id, pattern'),
    ])
    const result = computePayoffAverages(
      records,
      parentResolver(mappings ?? [], patterns ?? []),
      format(new Date(), 'yyyy-MM-dd'),
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
