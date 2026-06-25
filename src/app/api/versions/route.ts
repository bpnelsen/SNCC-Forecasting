import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

// Opt out of Next 14's default static caching for GET route handlers — without
// this, Vercel serves a build-time snapshot and DB writes (new imports, edits)
// don't appear until the next deploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('current_report_versions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e) {
    return apiError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const sb = createServiceClient()

    // Deactivate all
    await sb.from('current_report_versions').update({ is_active: false }).eq('is_active', true)

    // Activate target
    const { error } = await sb
      .from('current_report_versions')
      .update({ is_active: true })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
