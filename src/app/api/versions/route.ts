import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Opt out of Next 14's default static caching for GET route handlers — without
// this, Vercel serves a build-time snapshot and DB writes (new imports, edits)
// don't appear until the next deploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('current_report_versions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
