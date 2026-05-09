import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { buildScheduleContext, buildRebuildPrompt, ScheduleProposal } from '@/lib/ai-scheduler'
import { ResolvedBlock, Task } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const anthropic = new Anthropic()

function auth(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const date = body.date || todayToronto()
  const constraints = body.constraints as string | undefined

  // Fetch schedule blocks for the day
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay()

  const { data: blockRows } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('day_of_week', dow)
    .order('sort_order', { ascending: true })

  const { data: overrideRows } = await supabase
    .from('schedule_overrides')
    .select('*')
    .eq('date', date)

  // Resolve schedule (simplified server-side version)
  const skippedIds = new Set(
    (overrideRows || []).filter(o => o.override_type === 'skip').map(o => o.block_id)
  )

  const blocks: ResolvedBlock[] = []
  for (const b of blockRows || []) {
    if (skippedIds.has(b.id)) continue
    blocks.push({
      id: b.id,
      start: b.start_time,
      end: b.end_time,
      label: b.label,
      emoji: b.emoji,
      locked: b.locked,
      skippable: b.skippable,
      isOverride: false,
      blockId: b.id,
    })
  }

  // Add adhoc blocks
  for (const o of (overrideRows || []).filter(o => o.override_type === 'adhoc')) {
    if (o.start_time && o.end_time) {
      blocks.push({
        id: o.id,
        start: o.start_time,
        end: o.end_time,
        label: o.label || 'Ad-hoc',
        emoji: o.emoji || '📌',
        locked: o.locked,
        skippable: true,
        isOverride: true,
        overrideType: 'adhoc',
      })
    }
  }

  blocks.sort((a, b) => a.start.localeCompare(b.start))

  // Fetch tasks
  const { data: taskRows } = await supabase
    .from('planner_tasks')
    .select('*')
    .or(`scheduled_date.eq.${date},and(scheduled_date.lt.${date},status.neq.done)`)
    .order('priority', { ascending: true })

  const tasks: Task[] = (taskRows || []).map(r => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
    status: r.status,
    deadline: r.deadline,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    category: r.category,
    notes: r.notes,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    rolledFrom: r.rolled_from,
  }))

  // Build context and call Claude
  const context = buildScheduleContext(date, blocks, tasks, constraints)
  const prompt = buildRebuildPrompt(context)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const proposal = JSON.parse(jsonMatch[0]) as ScheduleProposal
      return NextResponse.json({
        success: true,
        date,
        proposal,
        currentSchedule: blocks.map(b => ({ time: `${b.start}-${b.end}`, label: b.label, locked: b.locked })),
      })
    }

    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 })
  } catch (error) {
    return NextResponse.json({ error: 'AI scheduling failed', message: String(error) }, { status: 500 })
  }
}
