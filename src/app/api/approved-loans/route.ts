import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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

// Whitelist + normalize a write payload. Used by both create and update so
// the rules stay in one place. Returns only the keys provided (so PATCH-style
// partials work) — except on create, where the caller passes `requireDefaults`
// to coerce missing fields to their column defaults.
type WritePayload = Partial<{
  loan_type: string
  date_approved: string | null
  borrower_project_name: string
  lc_approval_expiration: string | null
  status: string
  date_completed: string | null
  disposition_notes: string | null
  next_steps_notes: string | null
  loan_amount: number
  sort_order: number
}>

function buildPayload(body: Record<string, unknown>, requireDefaults: boolean): WritePayload {
  const out: WritePayload = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const str = (v: unknown) => v == null ? null : String(v)
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const date = (v: unknown) => (v === '' || v == null) ? null : String(v)

  if (has('loan_type'))              out.loan_type = str(body.loan_type) || 'Vertical'
  else if (requireDefaults)          out.loan_type = 'Vertical'
  if (has('date_approved'))          out.date_approved = date(body.date_approved)
  else if (requireDefaults)          out.date_approved = null
  if (has('borrower_project_name'))  out.borrower_project_name = str(body.borrower_project_name) ?? ''
  else if (requireDefaults)          out.borrower_project_name = ''
  if (has('lc_approval_expiration')) out.lc_approval_expiration = date(body.lc_approval_expiration)
  else if (requireDefaults)          out.lc_approval_expiration = null
  if (has('status'))                 out.status = str(body.status) || 'Open'
  else if (requireDefaults)          out.status = 'Open'
  if (has('date_completed'))         out.date_completed = date(body.date_completed)
  else if (requireDefaults)          out.date_completed = null
  if (has('disposition_notes'))      out.disposition_notes = str(body.disposition_notes)
  else if (requireDefaults)          out.disposition_notes = null
  if (has('next_steps_notes'))       out.next_steps_notes = str(body.next_steps_notes)
  else if (requireDefaults)          out.next_steps_notes = null
  if (has('loan_amount'))            out.loan_amount = num(body.loan_amount)
  else if (requireDefaults)          out.loan_amount = 0
  if (has('sort_order'))             out.sort_order = num(body.sort_order)

  return out
}

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('approved_loans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    // Default sort_order = max + 1 so new rows append to the end of the
    // existing pipeline. Avoids the user having to set it manually.
    let payload = buildPayload(body, true)
    if (payload.sort_order == null) {
      const { data: maxRow } = await sb
        .from('approved_loans')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      payload = { ...payload, sort_order: (maxRow?.sort_order ?? 0) + 1 }
    }

    const { data, error } = await sb
      .from('approved_loans')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
