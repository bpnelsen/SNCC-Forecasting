import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runForecast } from '@/lib/calculator'
import { Loan, Assumptions } from '@/lib/types'

export async function GET() {
  try {
    const sb = createServiceClient()

    // Get active version
    const { data: version, error: ve } = await sb
      .from('current_report_versions')
      .select('*')
      .eq('is_active', true)
      .single()

    if (ve || !version) {
      return NextResponse.json({
        error: 'No active version found. Please import a Current Report first.',
      }, { status: 404 })
    }

    // Get loans for active version
    const { data: loans, error: le } = await sb
      .from('loans')
      .select('*')
      .eq('version_id', version.id)

    if (le) throw le

    // Get active assumptions
    const { data: assumptions, error: ae } = await sb
      .from('assumptions')
      .select('*')
      .eq('is_active', true)
      .single()

    if (ae || !assumptions) throw new Error('No assumptions found')

    const result = runForecast(
      (loans || []) as Loan[],
      assumptions as unknown as Assumptions,
      version.label,
      version.as_of_date || new Date().toISOString().split('T')[0]
    )

    return NextResponse.json(result)
  } catch (e) {
    console.error('/api/calculate error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
