import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('loan_programs')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const programs = await req.json() as Array<{
      id: string
      name?: string
      product_type?: string
      draw_curve?: number[]
      default_rate?: number
      default_term_months?: number
      notes?: string | null
    }>
    if (!Array.isArray(programs)) {
      return NextResponse.json({ error: 'Expected an array of programs' }, { status: 400 })
    }

    const sb  = createServiceClient()
    const now = new Date().toISOString()

    for (const p of programs) {
      const payload: Record<string, unknown> = { updated_at: now }
      if (p.name !== undefined)                payload.name = p.name
      if (p.product_type !== undefined)        payload.product_type = p.product_type
      if (p.draw_curve !== undefined)          payload.draw_curve = p.draw_curve
      if (p.default_rate !== undefined)        payload.default_rate = Number(p.default_rate)
      if (p.default_term_months !== undefined) payload.default_term_months = Number(p.default_term_months)
      if (p.notes !== undefined)               payload.notes = p.notes

      const { error } = await sb.from('loan_programs').update(payload).eq('id', p.id)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
