import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
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

    const { data: loans, error: le } = await sb
      .from('loans')
      .select('*')
      .eq('version_id', version.id)

    if (le) throw le

    return NextResponse.json({
      loans: loans ?? [],
      versionLabel: version.label,
      asOfDate: version.as_of_date,
      startDate: settings?.start_date ?? new Date().toISOString().split('T')[0],
      horizonMonths: settings?.horizon_months ?? 17,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
