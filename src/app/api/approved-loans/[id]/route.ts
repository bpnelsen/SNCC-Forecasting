import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

// POST = partial update. Only fields present in the body are written, so the
// /approved page can autosave one cell at a time without clobbering siblings.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const sb   = createServiceClient()

    const out: Record<string, unknown> = {}
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
    const str = (v: unknown) => v == null ? null : String(v)
    const date = (v: unknown) => (v === '' || v == null) ? null : String(v)
    const num = (v: unknown) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    if (has('loan_type'))              out.loan_type              = str(body.loan_type) || 'Vertical'
    if (has('date_approved'))          out.date_approved          = date(body.date_approved)
    if (has('borrower_project_name'))  out.borrower_project_name  = str(body.borrower_project_name) ?? ''
    if (has('lc_approval_expiration')) out.lc_approval_expiration = date(body.lc_approval_expiration)
    if (has('status'))                 out.status                 = str(body.status) || 'Open'
    if (has('date_completed'))         out.date_completed         = date(body.date_completed)
    if (has('disposition_notes'))      out.disposition_notes      = str(body.disposition_notes)
    if (has('next_steps_notes'))       out.next_steps_notes       = str(body.next_steps_notes)
    if (has('loan_amount'))            out.loan_amount            = num(body.loan_amount)
    if (has('sort_order'))             out.sort_order             = num(body.sort_order)

    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
    }
    out.updated_at = new Date().toISOString()

    const { data, error } = await sb
      .from('approved_loans')
      .update(out)
      .eq('id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb.from('approved_loans').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
