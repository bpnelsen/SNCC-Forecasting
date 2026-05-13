import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runForecast } from '@/lib/calculator'
import {
  Loan,
  LoanProgram,
  Builder,
  LandBucketProject,
  ForecastSettings,
} from '@/lib/types'

export async function GET() {
  try {
    const sb = createServiceClient()

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

    const { data: settings, error: se } = await sb
      .from('forecast_settings')
      .select('*')
      .eq('is_active', true)
      .single()

    if (se || !settings) {
      return NextResponse.json({
        error: 'No active forecast settings. Run migration 002 and ensure one row has is_active=true.',
      }, { status: 500 })
    }

    const [loansRes, buildersRes, programsRes, projectsRes] = await Promise.all([
      sb.from('loans').select('*').eq('version_id', version.id),
      sb.from('builders').select('*'),
      sb.from('loan_programs').select('*'),
      sb.from('land_bucket_projects').select('*'),
    ])

    if (loansRes.error)    throw loansRes.error
    if (buildersRes.error) throw buildersRes.error
    if (programsRes.error) throw programsRes.error
    if (projectsRes.error) throw projectsRes.error

    const result = runForecast({
      loans:               (loansRes.data    ?? []) as Loan[],
      builders:            (buildersRes.data ?? []) as Builder[],
      loanPrograms:        (programsRes.data ?? []) as LoanProgram[],
      landBucketProjects:  (projectsRes.data ?? []) as LandBucketProject[],
      settings:            settings as ForecastSettings,
      versionLabel:        version.label,
      asOfDate:            version.as_of_date || new Date().toISOString().split('T')[0],
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('/api/calculate error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
