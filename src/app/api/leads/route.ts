import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ACTIVE_STATUSES = ['cold', 'warm', 'hot', 'followed_up', 'replied', 'demo_booked']

function getHubClient() {
  const url = process.env.HUB_SUPABASE_URL
  const key = process.env.HUB_SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Hub Supabase credentials not configured')
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  // Allow same-origin requests (from the app itself) or secret-authenticated requests
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes('adam-planner.vercel.app') || referer.includes('localhost')
  if (!isSameOrigin && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hubSupabase = getHubClient()
  const { data, error } = await hubSupabase
    .from('admin_leads')
    .select('id, name, business_name, phone, email, status, drip_active, drip_step, last_contacted_date, next_followup_date, notes, created_at')
    .in('status', ACTIVE_STATUSES)
    .order('next_followup_date', { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data || [] })
}

export async function PATCH(req: NextRequest) {
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes('adam-planner.vercel.app') || referer.includes('localhost')
  if (!isSameOrigin && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, status, last_contacted_date, next_followup_date } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (status) updates.status = status
  if (last_contacted_date) updates.last_contacted_date = last_contacted_date
  if (next_followup_date !== undefined) updates.next_followup_date = next_followup_date

  const hubSupabase = getHubClient()
  const { error } = await hubSupabase
    .from('admin_leads')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
