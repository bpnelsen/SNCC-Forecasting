import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// DB writes are reflected immediately on Vercel without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('new_origination_schedule')
      .select('*')
      .order('month')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.builder_id) {
      return NextResponse.json({ error: 'builder_id is required' }, { status: 400 })
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(String(body.month))) {
      return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
    }

    const mode = body.monthly_mode === 'schedule' ? 'schedule' : 'fixed'
    const sb = createServiceClient()
    const payload = {
      builder_id:             body.builder_id,
      land_bucket_project_id: body.land_bucket_project_id || null,
      development_name:       (body.development_name ?? '').trim() || null,
      month:                  body.month,
      loan_count:             Number(body.loan_count) || 0,
      avg_loan_amount:        Number(body.avg_loan_amount) || 0,
      loan_program_id:        body.loan_program_id || null,
      interest_rate:          body.interest_rate === '' || body.interest_rate == null
                                ? null : Number(body.interest_rate),
      total_lots:             body.total_lots === '' || body.total_lots == null
                                ? null : Number(body.total_lots),
      end_month:              body.end_month && /^\d{4}-\d{2}$/.test(String(body.end_month))
                                ? body.end_month : null,
      monthly_mode:           mode,
      monthly_schedule:       mode === 'schedule' ? (body.monthly_schedule ?? {}) : {},
      notes:                  body.notes || null,
    }

    const { data, error } = await sb
      .from('new_origination_schedule')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
