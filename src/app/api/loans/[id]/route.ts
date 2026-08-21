import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { LoanType } from '@/lib/types'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_LOAN_TYPES: LoanType[] = [
  'SFR', 'MFR', 'RAW_LAND', 'A&D', 'FINISHED_LOTS', 'HHH', 'OTC', 'UNKNOWN',
]

// PATCH /api/loans/[id] — edits the Finished Lots release-rule fields
// (number_of_lots, release_period_months) and manual loan_type overrides.
// Other columns are not editable here; importing a new Current Report
// version is the source of truth for the rest of the loan record.
export async function PATCH(
  req: Request,
  ctx: { params: { id: string } },
) {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const body = await req.json().catch(() => ({}))
    const patch: Record<string, number | string> = {}

    if (body.number_of_lots != null) {
      const n = Number(body.number_of_lots)
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: 'number_of_lots must be ≥ 1' }, { status: 400 })
      }
      patch.number_of_lots = Math.floor(n)
    }
    if (body.release_period_months != null) {
      const n = Number(body.release_period_months)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'release_period_months must be ≥ 0' }, { status: 400 })
      }
      patch.release_period_months = Math.floor(n)
    }
    if (body.loan_type != null) {
      const t = String(body.loan_type)
      if (!ALLOWED_LOAN_TYPES.includes(t as LoanType)) {
        return NextResponse.json({
          error: `loan_type must be one of: ${ALLOWED_LOAN_TYPES.join(', ')}`,
        }, { status: 400 })
      }
      patch.loan_type = t
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
    }

    const sb = createServiceClient()
    const { data, error } = await sb
      .from('loans')
      .update(patch)
      .eq('id', ctx.params.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ loan: data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
