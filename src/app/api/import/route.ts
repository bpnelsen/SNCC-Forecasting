import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseCurrentReport } from '@/lib/parser'

export async function POST(req: NextRequest) {
  try {
    const fd    = await req.formData()
    const file  = fd.get('file') as File | null
    const label = (fd.get('label') as string) || `Import ${new Date().toLocaleDateString()}`
    const notes = (fd.get('notes') as string) || null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const loans  = parseCurrentReport(buffer)

    if (loans.length === 0) {
      return NextResponse.json({ error: 'No loans found. Check that the file has a "Current Report" sheet.' }, { status: 422 })
    }

    const sb = createServiceClient()

    // Deactivate current active version
    await sb.from('current_report_versions').update({ is_active: false }).eq('is_active', true)

    // Create new version
    const { data: version, error: ve } = await sb
      .from('current_report_versions')
      .insert({
        label,
        filename:   file.name,
        is_active:  true,
        loan_count: loans.length,
        as_of_date: new Date().toISOString().split('T')[0],
        notes,
      })
      .select()
      .single()

    if (ve) throw ve

    // Insert loans in batches of 500
    const withVersion = loans.map(l => ({ ...l, version_id: version.id }))
    for (let i = 0; i < withVersion.length; i += 500) {
      const { error } = await sb.from('loans').insert(withVersion.slice(i, i + 500))
      if (error) throw error
    }

    return NextResponse.json({ version_id: version.id, loan_count: loans.length, label })
  } catch (e) {
    console.error('/api/import error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
