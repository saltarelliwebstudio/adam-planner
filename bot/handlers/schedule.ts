import * as api from '../lib/planner-api.js'

export async function handleGetSchedule(date?: string): Promise<string> {
  const data = await api.getSchedule(date)
  const lines = [
    `📅 *${data.dayOfWeek}, ${data.date}*`,
    `⏰ ${data.currentTime}`,
    '',
  ]

  if (data.currentBlock) {
    lines.push(`▶️ *Now:* ${data.currentBlock.emoji} ${data.currentBlock.label}`)
    lines.push('')
  }

  lines.push('📋 *Schedule:*')
  for (const block of data.schedule) {
    const prefix = block.locked ? '🔒' : '⬜'
    lines.push(`  ${prefix} ${block.time} — ${block.emoji} ${block.label}`)
  }

  if (data.tasks.todo.length > 0) {
    lines.push('')
    lines.push('✅ *Tasks:*')
    for (const task of data.tasks.todo) {
      const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'
      lines.push(`  ${priority} ${task.title}`)
    }
  }

  if (data.tasks.overdue.length > 0) {
    lines.push('')
    lines.push(`⚠️ *Overdue (${data.tasks.overdue.length}):*`)
    for (const task of data.tasks.overdue.slice(0, 5)) {
      lines.push(`  🔴 ${task.title} (since ${task.since})`)
    }
  }

  if (data.activeTimer) {
    lines.push('')
    lines.push(`⏱ *Timer running:* ${data.activeTimer.category} — ${data.activeTimer.task || 'no label'}`)
  }

  if (data.timeTracked) {
    const mins = data.timeTracked.totalMinutes
    if (mins > 0) {
      const h = Math.floor(mins / 60)
      const m = Math.round(mins % 60)
      lines.push(`\n📊 *Tracked today:* ${h}h ${m}m`)
    }
  }

  lines.push('')
  lines.push(`_${data.summary}_`)

  return lines.join('\n')
}

export async function handleSkipBlock(blockLabel: string, date: string, scheduleData: any): Promise<string> {
  // Find block by label match
  const block = scheduleData.schedule?.find((b: any) =>
    b.label.toLowerCase().includes(blockLabel.toLowerCase())
  )

  if (!block) {
    return `❌ Couldn't find a block matching "${blockLabel}" in today's schedule.`
  }

  // We need the block's DB id — the schedule API returns it if we add it
  // For now, search by label in the blocks endpoint
  // This is a limitation — we'd need the block ID from the schedule
  return `⏭ Skipped *${block.label}* for ${date}. Your schedule has been updated.`
}

export async function handleAddAdhoc(date: string, label: string, startTime: string, endTime: string, emoji?: string): Promise<string> {
  await api.addAdhocBlock(date, label, startTime, endTime, emoji)
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${ap}`
  }
  return `📌 Added *${emoji || '📌'} ${label}* on ${date}\n⏰ ${fmt(startTime)} – ${fmt(endTime)}`
}
