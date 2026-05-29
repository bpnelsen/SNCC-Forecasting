import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// DB writes are reflected immediately on Vercel without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('land_bucket_projects')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
