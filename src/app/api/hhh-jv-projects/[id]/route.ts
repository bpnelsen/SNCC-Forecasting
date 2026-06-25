import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

// POST (not PUT) updates an existing project — some hosts reject PUT with 405.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const payload: Record<string, unknown> = {
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
      updated_at:               new Date().toISOString(),
    }

    const { error } = await sb
      .from('hhh_jv_projects')
      .update(payload)
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb.from('hhh_jv_projects').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
