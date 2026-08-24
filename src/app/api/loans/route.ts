import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { UNASSIGNED_PARENT_KEY } from '@/lib/calculator'
import { requireUser } from '@/lib/auth'
import { fetchAll } from '@/lib/fetch-all'
import type { Loan } from '@/lib/types'

// Kept explicit: Next 15 no longer caches GET route handlers by default, but
// stating it means a future default change can't silently start serving a
// build-time snapshot instead of current DB state.
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied

  try {
    const sb = createServiceClient()

    const { data: versions, error: ve } = await sb
      .from('current_report_versions')
      .select('*')
      .eq('is_active', true)

    if (ve) {
      return NextResponse.json({
        error: `Failed to query current_report_versions: ${ve.message}`,
      }, { status: 500 })
    }
    if (!versions || versions.length === 0) {
      return NextResponse.json({
        error: 'No active version found. Import a Current Report first.',
      }, { status: 404 })
    }
    const version = versions[0]

    // forecast_settings is optional here — we fall back to sensible defaults so
    // the loans tab still renders even if migration 002 hasn't been applied.
    const { data: settings } = await sb
      .from('forecast_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // Loans + parent attribution tables in parallel. Parent resolution
    // mirrors calculator.ts:638-651 — explicit borrower→parent overrides
    // win, then patterns, then UNASSIGNED.
    const [
      { data: loans, error: le },
      { data: parents },
      { data: patterns },
      { data: mappings },
    ] = await Promise.all([
      fetchAll<Loan>(sb.from('loans').select('*').eq('version_id', version.id)),
      sb.from('parent_companies').select('id, name'),
      sb.from('parent_company_patterns').select('parent_company_id, pattern'),
      sb.from('borrower_parent_mapping').select('borrower, parent_company_id'),
    ])
    if (le) throw le

    const parentsList = parents ?? []
    const overrides = new Map(
      (mappings ?? []).map(m => [m.borrower as string, m.parent_company_id as string]),
    )
    const patternList = (patterns ?? []).map(p => ({
      parentId: p.parent_company_id as string,
      pattern: (p.pattern as string).toLowerCase(),
    }))
    const nameById = new Map(parentsList.map(p => [p.id as string, p.name as string]))

    // Memoize per-borrower so the resolution loop is O(distinct borrowers),
    // not O(loans × patterns).
    const parentByBorrower = new Map<string, string>()
    const resolve = (borrower: string | null | undefined): string => {
      if (!borrower) return UNASSIGNED_PARENT_KEY
      const cached = parentByBorrower.get(borrower)
      if (cached) return cached
      const explicit = overrides.get(borrower)
      if (explicit) { parentByBorrower.set(borrower, explicit); return explicit }
      const hay = borrower.toLowerCase()
      const match = patternList.find(p => p.pattern.length > 0 && hay.includes(p.pattern))
      const id = match ? match.parentId : UNASSIGNED_PARENT_KEY
      parentByBorrower.set(borrower, id)
      return id
    }

    const parentLoanCounts: Record<string, number> = {}
    const enrichedLoans = (loans ?? []).map(l => {
      const pid = resolve(l.borrower as string | null)
      parentLoanCounts[pid] = (parentLoanCounts[pid] ?? 0) + 1
      return {
        ...l,
        parent_id: pid,
        parent_name: pid === UNASSIGNED_PARENT_KEY ? null : (nameById.get(pid) ?? null),
      }
    })

    return NextResponse.json({
      loans: enrichedLoans,
      versionLabel: version.label,
      asOfDate: version.as_of_date,
      startDate: settings?.start_date ?? new Date().toISOString().split('T')[0],
      horizonMonths: settings?.horizon_months ?? 17,
      parent_companies: parentsList,
      parent_loan_counts: parentLoanCounts,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
