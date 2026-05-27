import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// DB writes are reflected immediately on Vercel without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('a_and_d_loans')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST creates a new A&D loan. POST (not PUT) so the route works on hosts
// that reject PUT at the proxy layer with a 405.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const payload = {
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
    }

    const { data, error } = await sb
      .from('a_and_d_loans')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
