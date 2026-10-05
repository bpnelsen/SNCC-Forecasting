import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  MIGRATION_022_MESSAGE, cleanIncreaseSchedule, isMissingIncreaseColumn,
} from '@/lib/land-bucket-save'

// Supabase / PostgREST errors are plain objects; String(e) collapses them to
// "[object Object]". Pull out the useful fields.
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

function buildPayload(body: Record<string, unknown>): Record<string, unknown> {
  return {
    name:                     body.name,
    builder_id:               body.builder_id ?? null,
    total_lots:               Number(body.total_lots) || 0,
    lot_price:                Number(body.lot_price) || 0,
    absorption_rate:          body.absorption_rate === '' || body.absorption_rate == null
                                ? null : Number(body.absorption_rate),
    balance_outstanding:      Number(body.balance_outstanding) || 0,
    interest_rate:            Number(body.interest_rate) || 0,
    dev_start_date:           body.dev_start_date || null,
    dev_end_date:             body.dev_end_date || null,
    lot_sales_start_date:     body.lot_sales_start_date || null,
    vertical_loan_program_id: body.vertical_loan_program_id || null,
    vertical_loan_amount:     body.vertical_loan_amount === '' || body.vertical_loan_amount == null
                                ? null : Number(body.vertical_loan_amount),
    lot_release_schedule:     body.lot_release_schedule ?? {},
    notes:                    body.notes || null,
    updated_at:               new Date().toISOString(),
  }
}

// Update with the pre-migration fallback described in lib/land-bucket-save.
async function updateProject(id: string, body: Record<string, unknown>) {
  const sb = createServiceClient()
  const payload = buildPayload(body)
  const increases = cleanIncreaseSchedule(body.balance_increase_schedule)
  const run = (row: Record<string, unknown>) =>
    sb.from('land_bucket_projects').update(row).eq('id', id).select().single()

  let { data, error } = await run({ ...payload, balance_increase_schedule: increases })
  if (error && isMissingIncreaseColumn(error)) {
    if (Object.keys(increases).length > 0) {
      return NextResponse.json({ error: MIGRATION_022_MESSAGE }, { status: 409 })
    }
    ;({ data, error } = await run(payload))
  }
  if (error) throw error
  return NextResponse.json(data)
}

// POST = update by id (PUT-405-safe — Vercel rejects PUT on some setups).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return await updateProject(id, await req.json())
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// PUT kept for backwards compatibility but not relied on; the page now POSTs.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return await updateProject(id, await req.json())
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const sb = createServiceClient()
    const { error } = await sb.from('land_bucket_projects').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
