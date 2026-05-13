import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { pickLandBucketPayload } from '@/lib/land-bucket-payload'

export async function GET() {
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('land_bucket_projects')
      .select('*')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = pickLandBucketPayload(body)
    if (!payload.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('land_bucket_projects')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
