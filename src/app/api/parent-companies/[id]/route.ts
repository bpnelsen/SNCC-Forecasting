import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

// POST = update by id (PUT-405-safe).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    return apiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb.from('parent_companies').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
