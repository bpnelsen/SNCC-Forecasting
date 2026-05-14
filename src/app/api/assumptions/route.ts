import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('assumptions')
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
    const sb   = createServiceClient()

    // Get active assumptions id
    const { data: existing } = await sb
      .from('assumptions')
      .select('id')
      .eq('is_active', true)
      .single()

    const payload = {
      draw_pct_sf:          body.draw_pct_sf,
      draw_pct_mf:          body.draw_pct_mf,
      draw_pct_active:      body.draw_pct_active,
      rate_projected_loans: body.rate_projected_loans,
      rate_land_bucket:     body.rate_land_bucket,
      ps_holmes_sfr:        body.ps_holmes_sfr,
      ps_holmes_mfr:        body.ps_holmes_mfr,
      ps_arive_sfr:         body.ps_arive_sfr,
      ps_arive_mfr:         body.ps_arive_mfr,
      nhcf_loan_counts:     body.nhcf_loan_counts,
      nhcf_payoff_counts:   body.nhcf_payoff_counts,
      nhcf_loan_sizes:      body.nhcf_loan_sizes,
      land_bucket:          body.land_bucket,
      ps_unit_counts:       body.ps_unit_counts,
      updated_at:           new Date().toISOString(),
    }

    if (existing?.id) {
      const { error } = await sb.from('assumptions').update(payload).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await sb.from('assumptions').insert({ ...payload, is_active: true })
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
