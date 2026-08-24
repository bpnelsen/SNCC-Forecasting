import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

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

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('parent_company_patterns').select('*').order('pattern')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// POST creates a pattern for a parent_company_id.
export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json()
    if (!body.parent_company_id) {
      return NextResponse.json({ error: 'parent_company_id is required' }, { status: 400 })
    }
    if (!body.pattern || !String(body.pattern).trim()) {
      return NextResponse.json({ error: 'pattern is required' }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('parent_company_patterns')
      .insert({
        parent_company_id: body.parent_company_id,
        pattern: String(body.pattern).trim(),
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
