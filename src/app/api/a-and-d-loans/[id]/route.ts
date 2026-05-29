import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Supabase / PostgREST errors are plain objects; String(e) collapses them to
// "[object Object]". Surface message / details / hint / code instead.
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

    // Chaining .select().single() forces Supabase to return the updated row.
    // If params.id didn't match anything we get a real error instead of a
    // silent 0-row update that looks like a success.
    const { data, error } = await sb
      .from('a_and_d_loans')
      .update(payload)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb.from('a_and_d_loans').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
