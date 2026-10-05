import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { PayoffMode } from '@/lib/types'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

// The Maturity / Historical switch lives on the active forecast_settings row
// (migration 023), so flipping it changes the forecast app-wide — every page,
// every viewer, and the /ask assistant — not just this browser.

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('forecast_settings').select('*').eq('is_active', true).maybeSingle()
    if (error) throw error
    const mode: PayoffMode = data?.payoff_mode === 'historical' ? 'historical' : 'maturity'
    // `supported` is false until migration 023 adds the column, so the switch
    // can say why it won't save instead of silently snapping back.
    return NextResponse.json({ mode, supported: !!data && 'payoff_mode' in data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const mode = body?.mode
    if (mode !== 'maturity' && mode !== 'historical') {
      return NextResponse.json({ error: "mode must be 'maturity' or 'historical'" }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('forecast_settings')
      .update({ payoff_mode: mode, updated_at: new Date().toISOString() })
      .eq('is_active', true)
      .select('id')
    if (error) {
      return NextResponse.json({
        error: `${error.message} — run supabase/migrations/023_payoff_schedules.sql in the Supabase SQL editor.`,
      }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No active forecast_settings row to update.' }, { status: 500 })
    }
    return NextResponse.json({ mode })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
