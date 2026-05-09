import Anthropic from '@anthropic-ai/sdk'
import * as api from '../lib/planner-api.js'
import { getNewInboxItems, markInboxProcessed, isNotionConfigured } from '../lib/notion.js'
import { extractLeadsFromInbox, formatLeadSummary } from './brain-processor.js'

const claude = new Anthropic()

interface PlannedItem {
  title: string
  startTime: string
  endTime: string
  emoji: string
  category: string
  priority: string
  source: string // 'inbox' | 'overdue' | 'suggestion'
}

function escMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

const PREFERENCES = `
Adam's schedule:
- Sleep: 10:30 PM – 6:30 AM
- Morning: Walk or run
- School: M–F 8:00–11:00 AM
- Free blocks: 11 AM – evening (deep work preferred)
- Evenings: Genius Fitness & MMA (varies by day)
- Before bed: Stretching routine
- Monday: 8:30–10:30 PM Ariana time
- Sunday: Podcast recording + week planning

Priority: Follow up leads > Cold outreach > Client work > Build systems > Content > Learn
Categories: business, client, school, personal, health
Break big tasks into 10-minute first steps.
Deep work in afternoon. No stimulating work before bed.
`

export async function handlePlanDay(isIncremental: boolean = false): Promise<string> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

  // Gather all inputs in parallel
  const [schedule, calendar, rawInboxItems] = await Promise.all([
    api.getSchedule(),
    api.getCalendarEvents().catch(() => ({ events: [] })),
    getNewInboxItems(),
  ])

  // Extract lead-shaped Inbox items → Hub admin_leads + Brain. Remaining items go to the planner.
  const leadExtraction = await extractLeadsFromInbox(rawInboxItems)
  const inboxItems = rawInboxItems.filter((i) => !leadExtraction.leadItemIds.has(i.id))

  const hasAdhocBlocks = schedule.schedule?.some((b: any) => b.isOverride && !b.blockId)

  // If incremental and no new non-lead inbox items, just say so (but still surface any leads)
  if (isIncremental && inboxItems.length === 0) {
    const leadLine = formatLeadSummary(leadExtraction.summary)
    return leadLine
      ? `✅ Already planned today — no new tasks to add.\n\n${leadLine}`
      : '✅ Already planned today — no new inbox items to add.'
  }

  // Determine mode
  const mode = (hasAdhocBlocks && isIncremental) ? 'incremental' : 'fresh'

  // Find free windows between fixed blocks
  const fixedBlocks = schedule.schedule?.filter((b: any) => b.locked) || []
  const existingAdhoc = schedule.schedule?.filter((b: any) => b.isOverride) || []
  const calEvents = calendar.events || []

  // Build context for Claude
  const planContext = {
    date: today,
    dayOfWeek: schedule.dayOfWeek,
    currentTime: schedule.currentTime,
    mode,
    fixedBlocks: fixedBlocks.map((b: any) => `${b.time} — ${b.emoji} ${b.label} (locked)`),
    existingAdhoc: mode === 'incremental' ? existingAdhoc.map((b: any) => `${b.time} — ${b.emoji} ${b.label}`) : [],
    calendarEvents: calEvents.map((e: any) => {
      const start = e.start?.includes('T')
        ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
        : 'All day'
      return `${start} — ${e.summary}`
    }),
    inboxItems: inboxItems.map(i => i.title),
    existingTasks: schedule.tasks?.todo?.map((t: any) => `${t.title} (${t.priority})`) || [],
    overdueTasks: schedule.tasks?.overdue?.map((t: any) => `${t.title} (since ${t.since})`) || [],
  }

  // Ask Claude to build the plan
  const systemPrompt = `You are Adam's daily planner AI. Build a concrete, time-blocked schedule for his free time today.

${PREFERENCES}

RULES:
1. NEVER move or modify locked/fixed blocks or calendar events — they are anchors
2. Only fill FREE windows between anchors
3. Break big/vague items into 10-minute first steps with specific actions
4. Include a lunch block (🍽️) if there's a gap longer than 3 hours
5. Leave 15-30min buffer blocks (🧘) — don't over-schedule
6. Use the priority framework to order tasks
7. ${mode === 'incremental' ? 'This is an INCREMENTAL update — only schedule NEW inbox items around existing blocks. Do NOT repeat already-scheduled items.' : 'This is a FRESH plan — schedule everything from scratch in free windows.'}

Respond ONLY with valid JSON:
{
  "items": [
    {
      "title": "Call dentist (just look up number + dial — 10 min)",
      "startTime": "11:00",
      "endTime": "11:10",
      "emoji": "📞",
      "category": "personal",
      "priority": "medium",
      "source": "inbox"
    }
  ],
  "inboxDispositions": [
    { "title": "original inbox text", "action": "task", "planned_title": "Call dentist..." },
    { "title": "random thought", "action": "skip", "reason": "not actionable" }
  ]
}`

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Today's context:\n${JSON.stringify(planContext, null, 2)}\n\nBuild my ${mode} plan.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let plan: { items: PlannedItem[], inboxDispositions?: any[] }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] }
  } catch {
    return '❌ Couldn\'t build plan — AI returned invalid response. Try again.'
  }

  if (plan.items.length === 0 && inboxItems.length === 0) {
    return '✅ No new items to plan. Your schedule looks set!'
  }

  // Execute the plan: add tasks and time blocks
  const results: string[] = []

  for (const item of plan.items) {
    try {
      // Add task
      await api.addTask(item.title, today, item.priority, item.category)
      // Add time block
      await api.addAdhocBlock(today, item.title, item.startTime, item.endTime, item.emoji)
      results.push(`  ${item.emoji} ${item.startTime}–${item.endTime} — ${item.title}`)
    } catch (err) {
      console.error(`Failed to add ${item.title}:`, err)
    }
  }

  // Mark Notion inbox items as processed
  const processedInbox: string[] = []
  for (const inboxItem of inboxItems) {
    const disposition = plan.inboxDispositions?.find(
      d => d.title?.toLowerCase() === inboxItem.title.toLowerCase()
    )
    try {
      await markInboxProcessed(inboxItem.id)
      if (disposition?.action === 'skip') {
        processedInbox.push(`  ⏭ "${inboxItem.title}" — ${disposition.reason || 'skipped'}`)
      } else {
        processedInbox.push(`  ✅ "${inboxItem.title}" → scheduled`)
      }
    } catch (err) {
      console.error(`Failed to process inbox item ${inboxItem.title}:`, err)
    }
  }

  // Format the reply
  const lines: string[] = []

  if (mode === 'fresh') {
    lines.push(`📋 *${schedule.dayOfWeek} Plan — ${today}*`)
  } else {
    lines.push(`🔄 *Updated Plan — ${today}*`)
  }
  lines.push('')

  // Fixed blocks
  if (fixedBlocks.length > 0 && mode === 'fresh') {
    lines.push('🔒 *Fixed:*')
    for (const b of fixedBlocks) {
      lines.push(`  ${b.emoji} ${b.time} — ${b.label}`)
    }
    lines.push('')
  }

  // Calendar events
  if (calEvents.length > 0 && mode === 'fresh') {
    lines.push('📅 *Calendar:*')
    for (const e of calEvents) {
      const start = e.start?.includes('T')
        ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
        : 'All day'
      lines.push(`  • ${start} — ${e.summary}`)
    }
    lines.push('')
  }

  // Planned items
  if (results.length > 0) {
    lines.push(mode === 'fresh' ? '📌 *Planned:*' : '📌 *Added:*')
    lines.push(...results)
    lines.push('')
  }

  // Inbox dispositions
  if (processedInbox.length > 0) {
    lines.push('📥 *From Inbox:*')
    lines.push(...processedInbox)
    lines.push('')
  }

  // Overdue warning
  const overdue = schedule.tasks?.overdue || []
  if (overdue.length > 0 && mode === 'fresh') {
    lines.push(`⚠️ *Overdue (${overdue.length}):*`)
    for (const t of overdue.slice(0, 5)) {
      lines.push(`  🔴 ${t.title} (since ${t.since})`)
    }
    lines.push('')
  }

  const leadLine = formatLeadSummary(leadExtraction.summary)
  if (leadLine) {
    lines.push('🎯 *Leads → CRM:*')
    lines.push(leadLine)
    lines.push('')
  }

  if (!isNotionConfigured()) {
    lines.push('(Notion Inbox not connected — set NOTION API KEY to enable)')
  }
  lines.push('')
  lines.push('✅ All synced to Adam Planner.')

  return lines.join('\n')
}
