import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Supabase / PostgREST errors are plain objects; String(e) collapses them to
// "[object Object]". Pull out the most useful fields.
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

// POST = update by id (PUT-405-safe). Used to set parent_company_id on a
// builder; also handles renames + default rate / program edits.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const sb = createServiceClient()
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) {
      const trimmed = String(body.name).trim()
      if (!trimmed) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      payload.name = trimmed
    }
    if (body.default_absorption_rate !== undefined) {
      payload.default_absorption_rate = body.default_absorption_rate === '' || body.default_absorption_rate == null
        ? 0 : Number(body.default_absorption_rate)
    }
    if (body.default_loan_program_id !== undefined) {
      payload.default_loan_program_id = body.default_loan_program_id || null
    }
    if (body.parent_company_id !== undefined) {
      payload.parent_company_id = body.parent_company_id || null
    }
    if (body.notes !== undefined) {
      payload.notes = body.notes || null
    }

    const { data, error } = await sb
      .from('builders')
      .update(payload)
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
    const { error } = await sb.from('builders').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
