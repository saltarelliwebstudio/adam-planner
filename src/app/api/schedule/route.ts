import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRunWorkout, getWeekInfo } from '@/lib/running-plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

interface BlockRow {
  id: string
  label: string
  emoji: string
  day_of_week: number
  start_time: string
  end_time: string
  locked: boolean
  skippable: boolean
}

interface OverrideRow {
  id: string
  block_id: string | null
  override_type: 'skip' | 'move' | 'adhoc'
  label: string | null
  emoji: string | null
  start_time: string | null
  end_time: string | null
  locked: boolean
}

function resolveSchedule(blocks: BlockRow[], overrides: OverrideRow[]) {
  const skippedIds = new Set(
    overrides.filter(o => o.override_type === 'skip').map(o => o.block_id)
  )
  const movedMap = new Map<string, OverrideRow>()
  for (const o of overrides.filter(o => o.override_type === 'move')) {
    if (o.block_id) movedMap.set(o.block_id, o)
  }

  const resolved: { id: string; time: string; label: string; emoji: string; locked: boolean; skippable: boolean; isOverride: boolean; blockId?: string }[] = []

  for (const b of blocks) {
    if (skippedIds.has(b.id)) continue
    const move = movedMap.get(b.id)
    if (move) {
      resolved.push({
        id: move.id,
        time: `${move.start_time || b.start_time}–${move.end_time || b.end_time}`,
        label: move.label || b.label,
        emoji: move.emoji || b.emoji,
        locked: b.locked,
        skippable: b.skippable,
        isOverride: true,
        blockId: b.id,
      })
    } else {
      resolved.push({
        id: b.id,
        time: `${b.start_time}–${b.end_time}`,
        label: b.label,
        emoji: b.emoji,
        locked: b.locked,
        skippable: b.skippable,
        isOverride: false,
        blockId: b.id,
      })
    }
  }

  for (const o of overrides.filter(o => o.override_type === 'adhoc')) {
    if (o.start_time && o.end_time) {
      resolved.push({
        id: o.id,
        time: `${o.start_time}–${o.end_time}`,
        label: o.label || 'Ad-hoc',
        emoji: o.emoji || '📌',
        locked: o.locked,
        skippable: true,
        isOverride: true,
      })
    }
  }

  return resolved.sort((a, b) => a.time.localeCompare(b.time))
}

export async function GET(req: NextRequest) {
  // CORS for Saltarelli Hub widget
  const origin = req.headers.get('origin') || ''
  const corsHeaders: Record<string, string> = {}
  if (origin.includes('saltarelli') || origin.includes('vercel.app') || origin.includes('localhost')) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
    corsHeaders['Access-Control-Allow-Headers'] = 'x-api-secret, content-type'
  }

  const secret = req.headers.get('x-api-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  const date = dateParam || todayToronto()
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay()

  // Get schedule blocks for the day from DB
  const { data: blockRows } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('day_of_week', dow)
    .order('sort_order', { ascending: true })

  // Get overrides for this specific date
  const { data: overrideRows } = await supabase
    .from('schedule_overrides')
    .select('*')
    .eq('date', date)

  const blocks = resolveSchedule(
    (blockRows || []) as BlockRow[],
    (overrideRows || []) as OverrideRow[]
  )

  // Get tasks for the day
  const sourceFilter = req.nextUrl.searchParams.get('source')
  let tasksQuery = supabase
    .from('planner_tasks')
    .select('id, title, status, priority, category, scheduled_time, notes, source')
    .eq('scheduled_date', date)
    .order('priority', { ascending: true })
  if (sourceFilter === 'user') {
    tasksQuery = tasksQuery.neq('source', 'recurring')
  }
  const { data: tasks } = await tasksQuery

  // Get overdue tasks
  const { data: overdue } = await supabase
    .from('planner_tasks')
    .select('id, title, priority, category, scheduled_date')
    .lt('scheduled_date', date)
    .neq('status', 'done')

  // Get active timer
  const { data: activeTimer } = await supabase
    .from('time_entries')
    .select('task, category, started_at')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)

  // Get today's non-negotiable status
  const { data: log } = await supabase
    .from('planner_daily_logs')
    .select('morning_routine_done, outreach_done, training_done, completed')
    .eq('date', date)
    .single()

  // Get today's time entries for summary
  const startOfDay = `${date}T00:00:00`
  const endOfDay = `${date}T23:59:59`
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('category, duration_minutes')
    .gte('started_at', startOfDay)
    .lte('started_at', endOfDay)
    .not('stopped_at', 'is', null)

  const timeByCategory: Record<string, number> = {}
  let totalMinutes = 0
  for (const e of timeEntries || []) {
    const mins = e.duration_minutes || 0
    timeByCategory[e.category] = (timeByCategory[e.category] || 0) + mins
    totalMinutes += mins
  }

  const todoTasks = (tasks || []).filter(t => t.status !== 'done')
  const doneTasks = (tasks || []).filter(t => t.status === 'done')

  // Current time block
  const now = new Date()
  const currentMin = now.getHours() * 60 + now.getMinutes()
  const currentBlock = blocks.find(b => {
    const [sh, sm] = b.time.split('–')[0].split(':').map(Number)
    const [eh, em] = b.time.split('–')[1].split(':').map(Number)
    return currentMin >= sh * 60 + sm && currentMin < eh * 60 + em
  })

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return NextResponse.json({
    date,
    dayOfWeek: dayNames[dow],
    currentTime: now.toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit' }),
    currentBlock: currentBlock || null,
    schedule: blocks,
    tasks: {
      todo: todoTasks.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        category: t.category,
        time: t.scheduled_time || null,
        notes: t.notes || null,
        source: t.source || 'user',
      })),
      done: doneTasks.map(t => ({ id: t.id, title: t.title, category: t.category, source: t.source || 'user' })),
      overdue: (overdue || []).map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        since: t.scheduled_date,
      })),
    },
    nonNegotiables: {
      morningRoutine: log?.morning_routine_done || false,
      outreach: log?.outreach_done || false,
      reading: (log?.completed as Record<string, boolean>)?.reading_done || false,
      stretching: (log?.completed as Record<string, boolean>)?.stretching_done || false,
    },
    activeTimer: activeTimer?.[0] ? {
      task: activeTimer[0].task,
      category: activeTimer[0].category,
      startedAt: activeTimer[0].started_at,
    } : null,
    timeTracked: {
      totalMinutes,
      byCategory: timeByCategory,
    },
    runWorkout: getRunWorkout(date),
    trainingWeek: getWeekInfo(date),
    summary: `${dayNames[dow]} ${date} — ${todoTasks.length} tasks remaining, ${doneTasks.length} done, ${(overdue || []).length} overdue`,
  }, { headers: corsHeaders })
}

// Handle CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-api-secret, content-type',
  }
  if (origin.includes('saltarelli') || origin.includes('vercel.app') || origin.includes('localhost')) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return new Response(null, { status: 204, headers })
}
