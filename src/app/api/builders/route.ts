import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('builders').select('*').order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Builder name is required' }, { status: 400 })
    }

    const sb = createServiceClient()
    const payload: Record<string, unknown> = { name }
    if (body.default_absorption_rate != null && body.default_absorption_rate !== '') {
      payload.default_absorption_rate = Number(body.default_absorption_rate)
    }
    if (body.default_loan_program_id) {
      payload.default_loan_program_id = body.default_loan_program_id
    }
    if (body.parent_company_id !== undefined) {
      payload.parent_company_id = body.parent_company_id || null
    }

    const { data, error } = await sb.from('builders').insert(payload).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
