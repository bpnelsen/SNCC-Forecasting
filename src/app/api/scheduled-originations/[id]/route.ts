import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { pickScheduledOriginationPayload } from '@/lib/scheduled-origination-payload'

interface Ctx { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Ctx) {
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
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const sb = createServiceClient()
    const { error } = await sb
      .from('scheduled_originations')
      .delete()
      .eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
