import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-errors'
import { createServiceClient } from '@/lib/supabase'

// DELETE clears the explicit override for a given borrower. URL segment is
// URL-encoded; we just decode it before the WHERE clause.
export async function DELETE(_req: NextRequest, { params }: { params: { borrower: string } }) {
  try {
    const sb = createServiceClient()
    const { error } = await sb
      .from('borrower_parent_mapping')
      .delete()
      .eq('borrower', decodeURIComponent(params.borrower))
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
