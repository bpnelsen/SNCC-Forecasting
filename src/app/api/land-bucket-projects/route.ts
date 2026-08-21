import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// DB writes are reflected immediately on Vercel without a redeploy.
export const dynamic = 'force-dynamic'

// Supabase / PostgREST errors are plain objects; String(e) collapses them
// to "[object Object]". Pull out the useful fields so the client banner
// shows the real cause.
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

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('land_bucket_projects')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const payload = {
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
    }

    const { data, error } = await sb
      .from('land_bucket_projects')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
