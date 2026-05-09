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

function getWeekRange(dateStr?: string): { weekStart: string; weekEnd: string } {
  const d = dateStr
    ? new Date(dateStr + 'T12:00:00')
    : new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) + 'T12:00:00')

  const day = d.getDay()
  const start = new Date(d)
  start.setDate(d.getDate() - day)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    weekStart: start.toISOString().split('T')[0],
    weekEnd: end.toISOString().split('T')[0],
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekParam = req.nextUrl.searchParams.get('week')
  const { weekStart, weekEnd } = getWeekRange(weekParam || undefined)

  // Time entries for the week
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('category, duration_minutes, started_at')
    .gte('started_at', `${weekStart}T00:00:00`)
    .lte('started_at', `${weekEnd}T23:59:59`)
    .not('stopped_at', 'is', null)

  const timeByCategory: Record<string, number> = {}
  const timeByDay: Record<string, number> = {}
  let totalMinutes = 0

  for (const e of timeEntries || []) {
    const mins = e.duration_minutes || 0
    timeByCategory[e.category] = (timeByCategory[e.category] || 0) + mins
    const day = e.started_at.split('T')[0]
    timeByDay[day] = (timeByDay[day] || 0) + mins
    totalMinutes += mins
  }

  // Tasks for the week
  const { data: tasks } = await supabase
    .from('planner_tasks')
    .select('status, priority, scheduled_date')
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)

  const tasksCompleted = (tasks || []).filter(t => t.status === 'done').length
  const tasksTotal = (tasks || []).length
  const tasksOverdue = (tasks || []).filter(t => t.status !== 'done').length

  // Daily logs for streaks
  const { data: logs } = await supabase
    .from('planner_daily_logs')
    .select('date, morning_routine_done, outreach_done, training_done')
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date', { ascending: true })

  const streaks: Record<string, number> = {
    morningRoutine: 0,
    outreach: 0,
    training: 0,
  }
  for (const log of logs || []) {
    if (log.morning_routine_done) streaks.morningRoutine++
    if (log.outreach_done) streaks.outreach++
    if (log.training_done) streaks.training++
  }

  // Top categories sorted by time
  const topCategories = Object.entries(timeByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, minutes]) => ({
      category,
      minutes,
      formatted: formatDuration(minutes),
      percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
    }))

  // Format for Telegram
  const telegramLines = [
    `📊 *Weekly Recap* (${weekStart} → ${weekEnd})`,
    '',
    `⏱ *Total tracked:* ${formatDuration(totalMinutes)}`,
    `✅ *Tasks:* ${tasksCompleted}/${tasksTotal} completed`,
    tasksOverdue > 0 ? `⚠️ *Overdue:* ${tasksOverdue}` : '',
    '',
    '📈 *Time breakdown:*',
    ...topCategories.map(c => `  ${c.category}: ${c.formatted} (${c.percentage}%)`),
    '',
    '🔥 *Streaks (days this week):*',
    `  🙏 Morning routine: ${streaks.morningRoutine}/7`,
    `  📞 Outreach: ${streaks.outreach}/7`,
    `  💪 Training: ${streaks.training}/7`,
  ].filter(Boolean)

  return NextResponse.json({
    weekStart,
    weekEnd,
    totalMinutes,
    totalFormatted: formatDuration(totalMinutes),
    timeByCategory,
    timeByDay,
    topCategories,
    tasksCompleted,
    tasksTotal,
    tasksOverdue,
    streaks,
    telegramMessage: telegramLines.join('\n'),
  })
}
