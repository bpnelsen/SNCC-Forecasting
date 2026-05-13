import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { pickScheduledOriginationPayload } from '@/lib/scheduled-origination-payload'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('scheduled_originations')
      .select('*')
      .order('forecast_month')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = pickScheduledOriginationPayload(body)
    if (!payload.loan_program_id) {
      return NextResponse.json({ error: 'loan_program_id is required' }, { status: 400 })
    }
    if (!payload.forecast_month) {
      return NextResponse.json({ error: 'forecast_month is required' }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('scheduled_originations')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
