import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('parent_companies').select('*').order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return apiError(e)
  }
}

// POST creates a new parent company (POST, not PUT — host-friendly).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('parent_companies')
      .insert({ name: String(body.name).trim(), notes: body.notes || null })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return apiError(e)
  }
}
