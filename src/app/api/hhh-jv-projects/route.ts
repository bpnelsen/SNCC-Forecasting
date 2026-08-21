import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('hhh_jv_projects')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST creates a new HHH/JV project. (POST, not PUT — some hosts reject PUT
// at the proxy layer with a 405.)
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
      notes:                    body.notes || null,
    }

    const { data, error } = await sb
      .from('hhh_jv_projects')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
