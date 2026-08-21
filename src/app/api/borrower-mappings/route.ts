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
    const { data, error } = await sb.from('borrower_parent_mapping').select('*').order('borrower')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// POST upserts a borrower → parent_company_id mapping (borrower is the PK,
// so a repeated POST replaces the existing parent).
export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json()
    if (!body.borrower || !String(body.borrower).trim()) {
      return NextResponse.json({ error: 'borrower is required' }, { status: 400 })
    }
    if (!body.parent_company_id) {
      return NextResponse.json({ error: 'parent_company_id is required' }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('borrower_parent_mapping')
      .upsert(
        { borrower: String(body.borrower), parent_company_id: body.parent_company_id, updated_at: new Date().toISOString() },
        { onConflict: 'borrower' },
      )
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
