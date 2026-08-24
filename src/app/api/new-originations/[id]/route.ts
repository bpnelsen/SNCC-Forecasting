import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Supabase / PostgREST errors are plain objects; String(e) collapses them
// to "[object Object]". Surface message / details / hint / code.
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

// Shared payload builder so PUT and POST stay in lockstep.
function buildPayload(body: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.builder_id !== undefined)             payload.builder_id = body.builder_id
  if (body.land_bucket_project_id !== undefined) payload.land_bucket_project_id = body.land_bucket_project_id || null
  if (body.development_name !== undefined)       payload.development_name = (String(body.development_name ?? '')).trim() || null
  if (body.month !== undefined)                  payload.month = body.month
  if (body.loan_count !== undefined)             payload.loan_count = Number(body.loan_count) || 0
  if (body.avg_loan_amount !== undefined)        payload.avg_loan_amount = Number(body.avg_loan_amount) || 0
  if (body.loan_program_id !== undefined)        payload.loan_program_id = body.loan_program_id || null
  if (body.interest_rate !== undefined)
    payload.interest_rate = body.interest_rate === '' || body.interest_rate == null ? null : Number(body.interest_rate)
  if (body.total_lots !== undefined)
    payload.total_lots = body.total_lots === '' || body.total_lots == null ? null : Number(body.total_lots)
  if (body.end_month !== undefined)
    payload.end_month = body.end_month && /^\d{4}-\d{2}$/.test(String(body.end_month)) ? String(body.end_month) : null
  if (body.monthly_mode !== undefined)
    payload.monthly_mode = body.monthly_mode === 'schedule' ? 'schedule' : 'fixed'
  if (body.monthly_schedule !== undefined)
    payload.monthly_schedule = body.monthly_schedule ?? {}
  if (body.notes !== undefined)                  payload.notes = body.notes || null
  return payload
}

// POST = update by id (PUT-405-safe — Vercel rejects PUT on some setups).
// Chains .select().single() so a 0-row update surfaces as an explicit error
// rather than a silent success.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser()
  if (denied) return denied
  const { id } = await params

  try {
    const body = await req.json()
    const sb   = createServiceClient()
    const { data, error } = await sb
      .from('new_origination_schedule')
      .update(buildPayload(body))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// PUT kept for backwards compatibility but the page now POSTs.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser()
  if (denied) return denied
  const { id } = await params

  try {
    const body = await req.json()
    const sb   = createServiceClient()
    const { data, error } = await sb
      .from('new_origination_schedule')
      .update(buildPayload(body))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser()
  if (denied) return denied
  const { id } = await params

  try {
    const sb = createServiceClient()
    const { error } = await sb.from('new_origination_schedule').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
