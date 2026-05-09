import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function auth(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

// Inline label → key map (mirrors TIME_CATEGORIES in time-store.ts)
const ACTIVITY_MAP: Record<string, { key: string; group: string }> = {
  'Cold Outreach':            { key: 'cold-outreach', group: 'work' },
  'Follow-Ups':               { key: 'follow-ups',    group: 'work' },
  'Client Work':              { key: 'client-work',   group: 'work' },
  'Proposal / Quoting':       { key: 'proposals',     group: 'work' },
  'Admin & Invoicing':        { key: 'admin',         group: 'work' },
  'Deep Work / Building':     { key: 'deep-work',     group: 'work' },
  'Gym / Training':           { key: 'gym',           group: 'health' },
  'Eating':                   { key: 'eating',        group: 'health' },
  'Naps':                     { key: 'naps',          group: 'health' },
  'Showering / Grooming':     { key: 'grooming',      group: 'health' },
  'Cooking / Meal Prep':      { key: 'cooking',       group: 'health' },
  'Stretching / Mobility':    { key: 'stretching',    group: 'health' },
  'Walking the Dog':          { key: 'dog-walking',   group: 'home' },
  'Cleaning':                 { key: 'cleaning',      group: 'home' },
  'Laundry':                  { key: 'laundry',       group: 'home' },
  'Yard Work':                { key: 'yard-work',     group: 'home' },
  'Home Maintenance':         { key: 'home-maintenance', group: 'home' },
  'Learning / Research':      { key: 'learning',      group: 'growth' },
  'School / Homework':        { key: 'school',        group: 'growth' },
  'Socializing':              { key: 'socializing',   group: 'growth' },
  'Meetings / Calls':         { key: 'meetings',      group: 'growth' },
  'Personal Errands':         { key: 'errands',       group: 'downtime' },
  'Sleep / Rest':             { key: 'sleep',         group: 'downtime' },
  'Commuting / Driving':      { key: 'commuting',     group: 'downtime' },
  'Scrolling / Social Media': { key: 'scrolling',     group: 'downtime' },
  'TV / Entertainment':       { key: 'tv',            group: 'downtime' },
  'Gaming':                   { key: 'gaming',        group: 'downtime' },
  'Reading for Fun':          { key: 'reading-fun',   group: 'downtime' },
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: active } = await supabase
    .from('time_entries')
    .select('*')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (!active) {
    return NextResponse.json({ status: 'idle' })
  }

  const minutes = Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000)
  return NextResponse.json({
    status: 'tracking',
    activity: active.task,
    category: active.category,
    startedAt: active.started_at,
    minutes,
  })
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { activity } = body as { activity: string }

  if (!activity) {
    return NextResponse.json({ error: 'activity is required' }, { status: 400 })
  }

  const mapped = ACTIVITY_MAP[activity]
  if (!mapped) {
    return NextResponse.json(
      { error: 'Unknown activity', available: Object.keys(ACTIVITY_MAP) },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()

  // Find any active timer
  const { data: active } = await supabase
    .from('time_entries')
    .select('*')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  // Stop helper
  async function stopEntry(entry: { id: string; started_at: string }) {
    const duration = Math.round((new Date(now).getTime() - new Date(entry.started_at).getTime()) / 60000)
    await supabase
      .from('time_entries')
      .update({ stopped_at: now, duration_minutes: duration })
      .eq('id', entry.id)
    return duration
  }

  // Same activity → stop it
  if (active && active.category === mapped.key) {
    const duration = await stopEntry(active)
    return NextResponse.json({
      status: 'stopped',
      activity,
      category: mapped.key,
      duration,
    })
  }

  // Different activity → stop old, start new
  if (active) {
    const stoppedDuration = await stopEntry(active)
    const id = crypto.randomUUID()
    await supabase.from('time_entries').insert({
      id,
      task: activity,
      category: mapped.key,
      started_at: now,
      created_at: now,
    })
    return NextResponse.json({
      status: 'switched',
      stopped: { activity: active.task, category: active.category, duration: stoppedDuration },
      started: { activity, category: mapped.key },
    })
  }

  // Nothing running → start new
  const id = crypto.randomUUID()
  await supabase.from('time_entries').insert({
    id,
    task: activity,
    category: mapped.key,
    started_at: now,
    created_at: now,
  })
  return NextResponse.json({
    status: 'started',
    activity,
    category: mapped.key,
  })
}
