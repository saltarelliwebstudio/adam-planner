import * as api from '../lib/planner-api.js'
import { getLeadCounts, getRecentDripFailures, getRecentReplies, getFollowupsDue } from '../lib/hub-supabase.js'

export async function morningDebrief(): Promise<string> {
  const data = await api.getSchedule()
  const todoCount = data.tasks.todo.length
  const overdueCount = data.tasks.overdue.length

  const lines = [
    `☀️ *Good morning, Adam!*`,
    `📅 ${data.dayOfWeek}, ${data.date}`,
    '',
  ]

  // Schedule overview
  const lockedBlocks = data.schedule.filter((b: any) => b.locked)
  if (lockedBlocks.length > 0) {
    lines.push('🔒 *Fixed blocks today:*')
    for (const b of lockedBlocks) {
      lines.push(`  ${b.emoji} ${b.time} — ${b.label}`)
    }
    lines.push('')
  }

  // Tasks
  if (todoCount > 0) {
    lines.push(`📋 *${todoCount} tasks on deck:*`)
    const highPriority = data.tasks.todo.filter((t: any) => t.priority === 'high')
    if (highPriority.length > 0) {
      lines.push('  🔴 *High priority:*')
      highPriority.forEach((t: any) => lines.push(`    • ${t.title}`))
    }
    const rest = data.tasks.todo.filter((t: any) => t.priority !== 'high')
    if (rest.length > 0) {
      rest.slice(0, 5).forEach((t: any) => {
        const p = t.priority === 'medium' ? '🟡' : '🟢'
        lines.push(`  ${p} ${t.title}`)
      })
    }
    lines.push('')
  }

  // Overdue warning
  if (overdueCount > 0) {
    lines.push(`⚠️ *${overdueCount} overdue tasks — let's knock some out today!*`)
    data.tasks.overdue.slice(0, 3).forEach((t: any) => {
      lines.push(`  🔴 ${t.title} (since ${t.since})`)
    })
    lines.push('')
  }

  // Calendar section
  try {
    const cal = await api.getCalendarEvents()
    if (cal.events && cal.events.length > 0) {
      lines.push('📅 *Meetings today:*')
      for (const e of cal.events) {
        const start = e.start?.includes('T')
          ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
          : 'All day'
        lines.push(`  • ${start} — ${e.summary}`)
      }
      lines.push('')
    }
  } catch {
    // Calendar not configured — skip silently
  }

  // CRM section
  try {
    const { counts, activeDrips } = await getLeadCounts()
    const failures = await getRecentDripFailures()
    const followups = await getFollowupsDue()
    const replies = await getRecentReplies()

    lines.push('📊 *CRM:*')
    const hot = counts['hot'] || 0
    const warm = counts['warm'] || 0
    const replied = counts['replied'] || 0
    lines.push(`  🔥 ${hot} hot | 🟡 ${warm} warm | 💬 ${replied} replied | 📱 ${activeDrips} active drips`)

    if (failures.length > 0) {
      lines.push(`  ⚠️ ${failures.length} SMS failure(s) in last 24h`)
    }

    if (followups.length > 0) {
      lines.push(`  📞 ${followups.length} lead(s) need follow-up`)
    }

    if (replies.length > 0) {
      lines.push(`  💬 Replies from: ${replies.map(r => r.name).join(', ')}`)
    }

    lines.push('')
  } catch {
    // CRM unavailable — skip silently
  }

  lines.push('💪 Let\'s get after it!')
  return lines.join('\n')
}

export async function eveningDebrief(): Promise<string> {
  const data = await api.getSchedule()
  const doneCount = data.tasks.done.length
  const totalTasks = data.tasks.todo.length + doneCount
  const pct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0

  const lines = [
    `🌙 *Evening debrief — ${data.date}*`,
    '',
    `✅ *${doneCount}/${totalTasks} tasks completed (${pct}%)*`,
  ]

  if (data.tasks.done.length > 0) {
    lines.push('')
    lines.push('*Completed:*')
    data.tasks.done.forEach((t: any) => lines.push(`  ✅ ${t.title}`))
  }

  if (data.tasks.todo.length > 0) {
    lines.push('')
    lines.push(`⏳ *Still pending (${data.tasks.todo.length}):*`)
    data.tasks.todo.slice(0, 5).forEach((t: any) => {
      const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'
      lines.push(`  ${p} ${t.title}`)
    })
  }

  if (data.timeTracked && data.timeTracked.totalMinutes > 0) {
    const mins = data.timeTracked.totalMinutes
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    lines.push('')
    lines.push(`📊 *Time tracked:* ${h}h ${m}m`)

    const top = Object.entries(data.timeTracked.byCategory as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    if (top.length > 0) {
      for (const [cat, catMins] of top) {
        const ch = Math.floor(catMins / 60)
        const cm = Math.round(catMins % 60)
        lines.push(`  • ${cat}: ${ch}h ${cm}m`)
      }
    }
  }

  // CRM section
  try {
    const { activeDrips } = await getLeadCounts()
    const failures = await getRecentDripFailures()
    const replies = await getRecentReplies()

    lines.push('')
    lines.push('📊 *CRM today:*')
    lines.push(`  📱 ${activeDrips} active drips`)
    if (failures.length > 0) lines.push(`  ⚠️ ${failures.length} SMS failure(s)`)
    if (replies.length > 0) lines.push(`  💬 Replies: ${replies.map(r => r.name).join(', ')}`)
  } catch {
    // CRM unavailable — skip silently
  }

  lines.push('')
  lines.push(data.nonNegotiables?.morningRoutine ? '🙏 Morning routine ✅' : '🙏 Morning routine ❌')
  lines.push(data.nonNegotiables?.outreach ? '📞 Outreach ✅' : '📞 Outreach ❌')

  lines.push('')
  lines.push('🛌 Rest up — tomorrow is a new day.')
  return lines.join('\n')
}
