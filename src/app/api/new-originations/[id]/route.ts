import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.builder_id !== undefined)             payload.builder_id = body.builder_id
    if (body.land_bucket_project_id !== undefined) payload.land_bucket_project_id = body.land_bucket_project_id || null
    if (body.month !== undefined)                  payload.month = body.month
    if (body.loan_count !== undefined)             payload.loan_count = Number(body.loan_count) || 0
    if (body.avg_loan_amount !== undefined)        payload.avg_loan_amount = Number(body.avg_loan_amount) || 0
    if (body.loan_program_id !== undefined)        payload.loan_program_id = body.loan_program_id || null
    if (body.notes !== undefined)                  payload.notes = body.notes || null

    const { error } = await sb
      .from('new_origination_schedule')
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
    const { error } = await sb.from('new_origination_schedule').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
