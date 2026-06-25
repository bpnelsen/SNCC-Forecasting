import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('parent_company_patterns').select('*').order('pattern')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return apiError(e)
  }
}

// POST creates a pattern for a parent_company_id.
export async function POST(req: NextRequest) {
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
    return apiError(e)
  }
}
