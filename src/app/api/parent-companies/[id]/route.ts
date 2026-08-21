import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

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

// POST = update by id (PUT-405-safe).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json()
    const sb   = createServiceClient()
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined)  payload.name = String(body.name).trim()
    if (body.notes !== undefined) payload.notes = body.notes || null
    const { data, error } = await sb
      .from('parent_companies')
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
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { error } = await sb.from('parent_companies').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
