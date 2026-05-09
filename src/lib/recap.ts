import { getTimeEntries, getCategoryByKey, formatDuration } from './time-store'
import { getTasks, today, getWeekStart } from './store'

export interface CategoryRecap {
  key: string
  label: string
  emoji: string
  color: string
  minutes: number
  formatted: string
  pct: number
  deltaMinutes: number      // this week − previous week
  deltaPct: number | null   // percent change vs previous week, null if previous was 0
  trend4w: number[]         // minutes per week, oldest → newest (length 4, this week is last)
}

export interface RecapData {
  weekStart: string
  weekEnd: string
  totalMinutes: number
  totalFormatted: string
  prevTotalMinutes: number
  timeByCategory: CategoryRecap[]
  timeByDay: { date: string; minutes: number }[]
  tasksCompleted: number
  tasksTotal: number
  tasksOverdue: number
  streaks: { morningRoutine: number; outreach: number; training: number }
  topInsight: string
}

export function getWeekRange(weekStart?: string): { start: string; end: string } {
  const ws = weekStart || getWeekStart(today())
  const startDate = new Date(ws + 'T12:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  return {
    start: ws,
    end: endDate.toISOString().split('T')[0],
  }
}

function shiftWeek(ws: string, weeks: number): string {
  const d = new Date(ws + 'T12:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

/** Aggregate minutes per category over a single week range. */
function minutesByCategoryForWeek(weekStart: string): Map<string, number> {
  const { start, end } = getWeekRange(weekStart)
  const entries = getTimeEntries(start, end).filter(e => e.stoppedAt !== null)
  const catMap = new Map<string, number>()
  for (const e of entries) {
    const mins = e.durationMinutes || 0
    catMap.set(e.category, (catMap.get(e.category) || 0) + mins)
  }
  return catMap
}

export function computeRecap(weekStart?: string): RecapData {
  const { start, end } = getWeekRange(weekStart)

  // Current week entries
  const entries = getTimeEntries(start, end).filter(e => e.stoppedAt !== null)

  const catMap = new Map<string, number>()
  const dayMap = new Map<string, number>()
  let totalMinutes = 0

  for (const e of entries) {
    const mins = e.durationMinutes || 0
    catMap.set(e.category, (catMap.get(e.category) || 0) + mins)
    const day = new Date(e.startedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
    dayMap.set(day, (dayMap.get(day) || 0) + mins)
    totalMinutes += mins
  }

  // Previous 3 weeks (for 4-week trend sparkline, this week is last)
  const prevWeeks = [3, 2, 1].map(n => minutesByCategoryForWeek(shiftWeek(start, -n)))
  const prevWeek = prevWeeks[2]  // 1 week back
  const prevTotalMinutes = Array.from(prevWeek.values()).reduce((a, b) => a + b, 0)

  // Union of categories seen in this week OR any of the previous 3
  const allKeys = new Set<string>(catMap.keys())
  for (const m of prevWeeks) for (const k of m.keys()) allKeys.add(k)

  const timeByCategory: CategoryRecap[] = Array.from(allKeys)
    .map(key => {
      const cat = getCategoryByKey(key)
      const minutes = catMap.get(key) || 0
      const prev = prevWeek.get(key) || 0
      const deltaMinutes = minutes - prev
      const deltaPct = prev === 0
        ? (minutes > 0 ? null : 0)
        : Math.round((deltaMinutes / prev) * 100)
      const trend4w = [
        prevWeeks[0].get(key) || 0,
        prevWeeks[1].get(key) || 0,
        prevWeeks[2].get(key) || 0,
        minutes,
      ]
      return {
        key,
        label: cat?.label || key,
        emoji: cat?.emoji || '',
        color: cat?.color || 'hsl(0,0%,50%)',
        minutes,
        formatted: formatDuration(minutes),
        pct: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
        deltaMinutes,
        deltaPct,
        trend4w,
      }
    })
    // Keep categories with activity in this or previous week; drop empty historical noise
    .filter(c => c.minutes > 0 || (c.trend4w[2] || 0) > 0)
    .sort((a, b) => b.minutes - a.minutes)

  // Generate all 7 days
  const timeByDay: { date: string; minutes: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    timeByDay.push({ date: dateStr, minutes: dayMap.get(dateStr) || 0 })
  }

  // Tasks
  const allTasks = getTasks()
  const weekTasks = allTasks.filter(t => t.scheduledDate >= start && t.scheduledDate <= end)
  const tasksCompleted = weekTasks.filter(t => t.status === 'done').length
  const tasksTotal = weekTasks.length
  const tasksOverdue = weekTasks.filter(t => t.status !== 'done').length

  // Top insight
  let topInsight = ''
  if (timeByCategory.length > 0) {
    const top = timeByCategory[0]
    topInsight = `You spent the most time on ${top.emoji} ${top.label} (${top.formatted}, ${top.pct}%)`
  }

  return {
    weekStart: start,
    weekEnd: end,
    totalMinutes,
    totalFormatted: formatDuration(totalMinutes),
    prevTotalMinutes,
    timeByCategory,
    timeByDay,
    tasksCompleted,
    tasksTotal,
    tasksOverdue,
    streaks: { morningRoutine: 0, outreach: 0, training: 0 },
    topInsight,
  }
}
