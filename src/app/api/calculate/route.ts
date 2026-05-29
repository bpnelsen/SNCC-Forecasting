import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runForecast } from '@/lib/calculator'
import {
  Loan,
  LoanProgram,
  Builder,
  LandBucketProject,
  ForecastSettings,
  NewOriginationEntry,
  HHHJVProject,
  AAndDLoan,
  ParentCompany,
  ParentCompanyPattern,
  BorrowerParentMapping,
} from '@/lib/types'

// Next 14 statically caches GET route handlers by default. Force-dynamic so
// the forecast always reflects the current active version, originations, etc.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createServiceClient()

    // Don't use .single() here — it returns an error when the row count is 0
    // or >1, which masks the underlying cause. Fetch the list, then disambiguate.
    const { data: activeVersions, error: ve } = await sb
      .from('current_report_versions')
      .select('*')
      .eq('is_active', true)

    if (ve) {
      return NextResponse.json({
        error: `Failed to query current_report_versions: ${ve.message}`,
        details: ve,
      }, { status: 500 })
    }

    if (!activeVersions || activeVersions.length === 0) {
      // Surface total row count so the user can tell "no imports yet" apart from
      // "imports exist but none are flagged active".
      const { count: totalVersions } = await sb
        .from('current_report_versions')
        .select('*', { count: 'exact', head: true })
      return NextResponse.json({
        error: `No active version found (current_report_versions rows total = ${
          totalVersions ?? 'unknown'
        }, with is_active=true = 0). ${
          totalVersions && totalVersions > 0
            ? 'Versions exist but none are marked active — go to /versions and click Restore on the row you want.'
            : 'Please import a Current Report first.'
        }`,
        total_versions: totalVersions ?? 0,
      }, { status: 404 })
    }

    if (activeVersions.length > 1) {
      return NextResponse.json({
        error: `Multiple active versions found (${activeVersions.length}). The is_active unique index should prevent this — please archive duplicates.`,
        active_version_ids: activeVersions.map(v => v.id),
      }, { status: 500 })
    }

    const version = activeVersions[0]

    const { data: settings, error: se } = await sb
      .from('forecast_settings')
      .select('*')
      .eq('is_active', true)
      .single()

    if (se || !settings) {
      return NextResponse.json({
        error: `No active forecast settings. Run supabase/migrations/002_modular_assumptions.sql and ensure one row in forecast_settings has is_active=true. Underlying error: ${se?.message ?? '(none)'}`,
        details: se,
      }, { status: 500 })
    }

    const [loansRes, buildersRes, programsRes, projectsRes, origsRes, hhhJvRes, aAndDRes, parentsRes, patternsRes, mappingsRes] = await Promise.all([
      sb.from('loans').select('*').eq('version_id', version.id),
      sb.from('builders').select('*'),
      sb.from('loan_programs').select('*'),
      sb.from('land_bucket_projects').select('*'),
      sb.from('new_origination_schedule').select('*'),
      sb.from('hhh_jv_projects').select('*'),
      sb.from('a_and_d_loans').select('*'),
      sb.from('parent_companies').select('*'),
      sb.from('parent_company_patterns').select('*'),
      sb.from('borrower_parent_mapping').select('*'),
    ])

    if (loansRes.error)    throw loansRes.error
    if (buildersRes.error) throw buildersRes.error
    if (programsRes.error) throw programsRes.error
    if (projectsRes.error) throw projectsRes.error
    // Don't fail the whole forecast if new_origination_schedule isn't
    // migrated yet — just treat it as an empty schedule.
    const newOriginations: NewOriginationEntry[] = origsRes.error
      ? []
      : ((origsRes.data ?? []) as NewOriginationEntry[])
    // Same graceful fallback if hhh_jv_projects (migration 008) isn't applied.
    const hhhJvProjects: HHHJVProject[] = hhhJvRes.error
      ? []
      : ((hhhJvRes.data ?? []) as HHHJVProject[])
    // Same graceful fallback for a_and_d_loans (migration 011).
    const aAndDLoans: AAndDLoan[] = aAndDRes.error
      ? []
      : ((aAndDRes.data ?? []) as AAndDLoan[])
    // Parent-company tables (migration 012) — same graceful empty fallback.
    const parentCompanies: ParentCompany[] = parentsRes.error
      ? []
      : ((parentsRes.data ?? []) as ParentCompany[])
    const parentCompanyPatterns: ParentCompanyPattern[] = patternsRes.error
      ? []
      : ((patternsRes.data ?? []) as ParentCompanyPattern[])
    const borrowerParentMappings: BorrowerParentMapping[] = mappingsRes.error
      ? []
      : ((mappingsRes.data ?? []) as BorrowerParentMapping[])

    const result = runForecast({
      loans:               (loansRes.data    ?? []) as Loan[],
      builders:            (buildersRes.data ?? []) as Builder[],
      loanPrograms:        (programsRes.data ?? []) as LoanProgram[],
      landBucketProjects:  (projectsRes.data ?? []) as LandBucketProject[],
      newOriginations,
      hhhJvProjects,
      aAndDLoans,
      parentCompanies,
      parentCompanyPatterns,
      borrowerParentMappings,
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
