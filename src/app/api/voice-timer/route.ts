import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseTimeLog, TIME_CATEGORY_META } from '@/lib/time-log-parser'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function auth(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

function enrich(key: string, activity: string) {
  const meta = TIME_CATEGORY_META[key] || { label: key, emoji: '' }
  return {
    activity,
    category: key,
    categoryLabel: meta.label,
    emoji: meta.emoji,
  }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const text: string = (body.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  // Pull the active timer so the parser can reason about start/switch/stop
  const { data: active } = await supabase
    .from('time_entries')
    .select('*')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()
  const parsed = await parseTimeLog(
    text,
    active ? { category: active.category, task: active.task || '', startedAt: active.started_at } : null,
    { apiKey, now },
  )

  async function stopEntry(entry: { id: string; started_at: string }) {
    const duration = Math.round((new Date(now).getTime() - new Date(entry.started_at).getTime()) / 60000)
    await supabase
      .from('time_entries')
      .update({ stopped_at: now, duration_minutes: duration })
      .eq('id', entry.id)
    return duration
  }

  // ── Stop ──
  if (parsed.mode === 'stop') {
    if (!active) {
      return NextResponse.json({ status: 'noop', note: 'no timer running' })
    }
    const duration = await stopEntry(active)
    return NextResponse.json({
      status: 'stopped',
      ...enrich(active.category, active.task || ''),
      duration,
    })
  }

  // ── Backfill (batch of completed entries, walking back from now) ──
  if (parsed.mode === 'backfill') {
    const segs = parsed.segments.filter(s => (s.durationMinutes || 0) > 0)
    if (segs.length === 0) {
      return NextResponse.json({
        status: 'unknown',
        note: 'need durations for backfill (e.g. "25 min homework")',
      })
    }
    const totalMin = segs.reduce((a, b) => a + (b.durationMinutes || 0), 0)
    let cursor = new Date(now).getTime() - totalMin * 60_000
    const rows = segs.map(s => {
      const startedAt = new Date(cursor).toISOString()
      cursor += (s.durationMinutes as number) * 60_000
      const stoppedAt = new Date(cursor).toISOString()
      return {
        id: crypto.randomUUID(),
        task: s.task || null,
        category: s.category,
        started_at: startedAt,
        stopped_at: stoppedAt,
        duration_minutes: s.durationMinutes,
        created_at: now,
      }
    })
    await supabase.from('time_entries').insert(rows)
    return NextResponse.json({
      status: 'logged',
      count: rows.length,
      segments: parsed.segments,
    })
  }

  // ── Start / Switch ──
  if (parsed.mode === 'start' || parsed.mode === 'switch') {
    if (parsed.segments.length === 0) {
      return NextResponse.json({ status: 'unknown', note: 'no activity detected' })
    }
    const seg = parsed.segments[0]

    // Switch: stop any active timer first
    let stopped: { activity: string; category: string; duration: number } | null = null
    if (active) {
      const duration = await stopEntry(active)
      stopped = {
        activity: active.task || '',
        category: active.category,
        duration,
      }
    }

    const id = crypto.randomUUID()
    await supabase.from('time_entries').insert({
      id,
      task: seg.task || text,
      category: seg.category,
      started_at: now,
      created_at: now,
    })

    if (stopped) {
      return NextResponse.json({
        status: 'switched',
        stopped,
        started: enrich(seg.category, seg.task || text),
      })
    }
    return NextResponse.json({ status: 'started', ...enrich(seg.category, seg.task || text) })
  }

  // ── Unknown ──
  return NextResponse.json({ status: 'unknown', note: parsed.note || 'could not understand' })
}
