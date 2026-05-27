import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// POST (not PUT) updates an existing loan — some hosts reject PUT with 405.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const payload: Record<string, unknown> = {
      name:                    body.name,
      builder_id:              body.builder_id ?? null,
      initial_balance:         Number(body.initial_balance) || 0,
      total_loan_amount:       Number(body.total_loan_amount) || 0,
      total_lots:              Number(body.total_lots) || 0,
      lot_release_premium_pct: body.lot_release_premium_pct === '' || body.lot_release_premium_pct == null
                                 ? 110 : Number(body.lot_release_premium_pct),
      interest_rate:           Number(body.interest_rate) || 0,
      origination_date:        body.origination_date || null,
      draw_period_months:      Number(body.draw_period_months) || 0,
      release_start_date:      body.release_start_date || null,
      release_period_months:   Number(body.release_period_months) || 0,
      draw_schedule:           body.draw_schedule ?? {},
      release_schedule:        body.release_schedule ?? {},
      notes:                   body.notes || null,
      updated_at:              new Date().toISOString(),
    }

    const { error } = await sb
      .from('a_and_d_loans')
      .update(payload)
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb.from('a_and_d_loans').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
