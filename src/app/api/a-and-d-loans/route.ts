import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

// Supabase / PostgREST errors are plain objects; String(e) collapses them to
// "[object Object]". Pull out the most useful fields so the client can show
// the real cause (e.g. "relation a_and_d_loans does not exist").
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
      .from('a_and_d_loans')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// POST creates a new A&D loan. POST (not PUT) so the route works on hosts
// that reject PUT at the proxy layer with a 405.
export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

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
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
