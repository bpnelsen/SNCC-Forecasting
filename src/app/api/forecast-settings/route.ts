import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('forecast_settings')
      .select('*')
      .eq('is_active', true)
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = {
      start_date:            body.start_date,
      horizon_months:        Number(body.horizon_months ?? 17),
      default_rate_vertical: Number(body.default_rate_vertical ?? 0.0525),
      default_rate_land:     Number(body.default_rate_land ?? 0.0525),
      updated_at:            new Date().toISOString(),
    }
    const sb = createServiceClient()

    const { data: existing } = await sb
      .from('forecast_settings')
      .select('id')
      .eq('is_active', true)
      .single()

    if (existing?.id) {
      const { data, error } = await sb
        .from('forecast_settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    const { data, error } = await sb
      .from('forecast_settings')
      .insert({ ...payload, is_active: true })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
