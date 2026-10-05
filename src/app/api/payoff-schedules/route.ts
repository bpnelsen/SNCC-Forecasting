import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { PAYOFF_LOAN_TYPES } from '@/lib/calculator'
import type { PayoffLoanType, PayoffSchedule } from '@/lib/types'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

const MIGRATION_HINT = 'Run supabase/migrations/023_payoff_schedules.sql in the Supabase SQL editor.'

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

const keyOf = (r: Pick<PayoffSchedule, 'parent_company_id' | 'loan_type'>) =>
  `${r.parent_company_id ?? ''}|${r.loan_type}`

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('payoff_schedules').select('*')
    if (error) throw new Error(`${errMessage(error)} — ${MIGRATION_HINT}`)
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}

// POST replaces the whole grid: rows in the body are inserted or updated,
// rows missing from it are deleted (a blank cell = "use maturity").
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected an array of payoff schedule rows' }, { status: 400 })
    }

    const wanted = new Map<string, PayoffSchedule>()
    for (const raw of body) {
      const loanType = raw?.loan_type as PayoffLoanType
      if (!PAYOFF_LOAN_TYPES.includes(loanType)) {
        return NextResponse.json({ error: `Unknown loan_type: ${String(raw?.loan_type)}` }, { status: 400 })
      }
      const months = Number(raw?.payoff_months)
      if (!Number.isInteger(months) || months < 1 || months > 600) {
        return NextResponse.json({
          error: `payoff_months must be a whole number of months from 1 to 600 (got ${String(raw?.payoff_months)})`,
        }, { status: 400 })
      }
      const row: PayoffSchedule = {
        parent_company_id: raw?.parent_company_id ? String(raw.parent_company_id) : null,
        loan_type: loanType,
        payoff_months: months,
      }
      wanted.set(keyOf(row), row)
    }

    const sb = createServiceClient()
    const { data: existing, error: le } = await sb.from('payoff_schedules').select('*')
    if (le) throw new Error(`${errMessage(le)} — ${MIGRATION_HINT}`)
    const existingByKey = new Map((existing ?? []).map(r => [keyOf(r as PayoffSchedule), r as PayoffSchedule]))

    const toDelete = (existing ?? []).filter(r => !wanted.has(keyOf(r as PayoffSchedule))).map(r => r.id as string)
    const toInsert: PayoffSchedule[] = []
    const toUpdate: PayoffSchedule[] = []
    for (const [key, row] of wanted) {
      const prev = existingByKey.get(key)
      if (!prev) toInsert.push(row)
      else if (Number(prev.payoff_months) !== row.payoff_months) toUpdate.push({ ...row, id: prev.id })
    }

    if (toDelete.length > 0) {
      const { error } = await sb.from('payoff_schedules').delete().in('id', toDelete)
      if (error) throw error
    }
    for (const row of toUpdate) {
      const { error } = await sb.from('payoff_schedules')
        .update({ payoff_months: row.payoff_months, updated_at: new Date().toISOString() })
        .eq('id', row.id!)
      if (error) throw error
    }
    if (toInsert.length > 0) {
      const { error } = await sb.from('payoff_schedules').insert(toInsert)
      if (error) throw error
    }

    const { data, error } = await sb.from('payoff_schedules').select('*')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
