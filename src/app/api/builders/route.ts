import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// DB writes are reflected immediately on Vercel without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('builders').select('*').order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: NextRequest) {
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
    return apiError(e)
  }
}
