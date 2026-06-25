import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('borrower_parent_mapping').select('*').order('borrower')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return apiError(e)
  }
}

// POST upserts a borrower → parent_company_id mapping (borrower is the PK,
// so a repeated POST replaces the existing parent).
export async function POST(req: NextRequest) {
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
    return apiError(e)
  }
}
