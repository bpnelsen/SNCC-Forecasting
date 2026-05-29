import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

// Distinct borrowers from the ACTIVE version's loans, with a per-borrower
// loan count. Used by the Assumptions Parent Companies UI to populate the
// borrower assignment list without re-deriving from the full loans payload.
export async function GET() {
  try {
    const sb = createServiceClient()

    const { data: version, error: ve } = await sb
      .from('current_report_versions')
      .select('id')
      .eq('is_active', true)
      .single()
    if (ve || !version) return NextResponse.json([])

    const { data, error } = await sb
      .from('loans')
      .select('borrower')
      .eq('version_id', version.id)
    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const b = (row as { borrower: string | null }).borrower
      if (!b) continue
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
    const result = Array.from(counts.entries())
      .map(([borrower, loan_count]) => ({ borrower, loan_count }))
      .sort((a, b) => a.borrower.localeCompare(b.borrower))
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 })
  }
}
