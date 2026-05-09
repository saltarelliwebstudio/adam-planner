import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const PLANNER_SECRET = process.env.CRON_SECRET || ''

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const anthropic = new Anthropic()

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

async function sendMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

async function getScheduleData(date?: string) {
  const d = date || todayToronto()
  const dow = new Date(d + 'T12:00:00').getDay()

  // schedule_blocks may not exist yet (migration pending) — handle gracefully
  let blocks: any[] = []
  let overrides: any[] = []
  try {
    const { data: b, error: bErr } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('day_of_week', dow)
      .order('sort_order', { ascending: true })
    if (!bErr) blocks = b || []

    const { data: o, error: oErr } = await supabase
      .from('schedule_overrides')
      .select('*')
      .eq('date', d)
    if (!oErr) overrides = o || []
  } catch {
    // Tables don't exist yet — continue with empty arrays
  }

  const { data: tasks } = await supabase
    .from('planner_tasks')
    .select('*')
    .eq('scheduled_date', d)
    .order('priority', { ascending: true })

  const { data: overdue } = await supabase
    .from('planner_tasks')
    .select('*')
    .lt('scheduled_date', d)
    .neq('status', 'done')

  const { data: timer } = await supabase
    .from('time_entries')
    .select('task, category, started_at')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)

  return { date: d, dow, blocks, overrides, tasks: tasks || [], overdue: overdue || [], timer: timer?.[0] || null }
}

function resolveBlocks(blocks: any[], overrides: any[]) {
  const skipped = new Set(overrides.filter(o => o.override_type === 'skip').map(o => o.block_id))
  const result: any[] = []

  for (const b of blocks) {
    if (skipped.has(b.id)) continue
    result.push({ time: `${b.start_time}–${b.end_time}`, label: b.label, emoji: b.emoji, locked: b.locked, id: b.id, skippable: b.skippable })
  }

  for (const o of overrides.filter(o => o.override_type === 'adhoc')) {
    if (o.start_time && o.end_time) {
      result.push({ time: `${o.start_time}–${o.end_time}`, label: o.label || 'Ad-hoc', emoji: o.emoji || '📌', locked: o.locked, id: o.id })
    }
  }

  return result.sort((a, b) => a.time.localeCompare(b.time))
}

async function handleMessage(chatId: number, text: string) {
  const lower = text.toLowerCase().trim()

  // Quick commands
  if (/^(my day|what.?s my day|schedule|today)$/i.test(lower)) {
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const todoTasks = data.tasks.filter(t => t.status !== 'done')
    const doneTasks = data.tasks.filter(t => t.status === 'done')

    const lines = [
      `📅 *${dayNames[data.dow]}, ${data.date}*`,
      '',
      '📋 *Schedule:*',
      ...resolved.map(b => `  ${b.locked ? '🔒' : '⬜'} ${b.time} — ${b.emoji} ${b.label}`),
    ]

    if (todoTasks.length > 0) {
      lines.push('', `✅ *Tasks (${todoTasks.length}):*`)
      todoTasks.forEach(t => {
        const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'
        lines.push(`  ${p} ${t.title}`)
      })
    }

    if (data.overdue.length > 0) {
      lines.push('', `⚠️ *Overdue (${data.overdue.length}):*`)
      data.overdue.slice(0, 5).forEach(t => lines.push(`  🔴 ${t.title}`))
    }

    if (doneTasks.length > 0) {
      lines.push('', `✅ *Done: ${doneTasks.length}*`)
    }

    await sendMessage(chatId, lines.join('\n'))
    return
  }

  if (/^recap|weekly recap$/i.test(lower)) {
    // Fetch recap from our own API
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://adam-planner.vercel.app' : 'http://localhost:3000'}/api/recap`, {
      headers: { 'x-api-secret': PLANNER_SECRET },
    })
    if (res.ok) {
      const data = await res.json()
      await sendMessage(chatId, data.telegramMessage || '📊 No recap data yet.')
    } else {
      await sendMessage(chatId, '❌ Could not fetch recap.')
    }
    return
  }

  // AI-powered intent parsing for natural language
  try {
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)

    const context = JSON.stringify({
      date: data.date,
      dayOfWeek: new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      schedule: resolved,
      tasks: data.tasks.filter(t => t.status !== 'done').map(t => ({ id: t.id, title: t.title, priority: t.priority })),
      overdue: data.overdue.slice(0, 5).map(t => ({ id: t.id, title: t.title, priority: t.priority })),
    }, null, 2)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are Adam's personal scheduling assistant. Parse his message and respond with JSON.

Current schedule context:
${context}

Today: ${data.date}

Respond with JSON:
{
  "intent": "add_adhoc" | "skip_block" | "add_task" | "complete_task" | "move_task" | "chat",
  "params": { ... },
  "reply": "Friendly confirmation message with emojis"
}

For "add_adhoc": params = { "date": "YYYY-MM-DD", "label": "...", "startTime": "HH:MM", "endTime": "HH:MM", "emoji": "..." }
For "skip_block": params = { "blockId": "uuid from schedule", "date": "YYYY-MM-DD" }
For "add_task": params = { "title": "...", "scheduledDate": "YYYY-MM-DD", "priority": "high|medium|low", "category": "business|client|school|personal|health" }
For "complete_task": params = { "taskId": "uuid from tasks" }
For "move_task": params = { "taskId": "uuid", "scheduledDate": "YYYY-MM-DD" }
For "chat": just a helpful reply

Parse dates: "tonight"/"today" = ${data.date}, "tomorrow" = next day, "Saturday" = upcoming Saturday, etc.
Parse times: "5:30" in context of evening = "17:30", "8-4" = startTime "08:00" endTime "16:00"
For personal hangouts/activities, use "add_adhoc" with locked=true and appropriate emoji.`,
      messages: [{ role: 'user', content: text }],
    })

    const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      await sendMessage(chatId, aiText || "I didn't quite get that. Try 'my day' or 'add Sobeys Saturday 8-4'")
      return
    }

    const parsed = JSON.parse(jsonMatch[0])

    switch (parsed.intent) {
      case 'add_adhoc': {
        const p = parsed.params
        const { error } = await supabase.from('schedule_overrides').insert({
          id: crypto.randomUUID(),
          date: p.date,
          block_id: null,
          override_type: 'adhoc',
          label: p.label,
          emoji: p.emoji || '📌',
          start_time: p.startTime,
          end_time: p.endTime,
          locked: true,
        })
        if (error) {
          if (error.code === 'PGRST205' || error.message?.includes('not found')) {
            await sendMessage(chatId, `⚠️ Database migration needed! The schedule tables haven't been created yet. Please run the migration SQL in Supabase Dashboard.`)
          } else {
            await sendMessage(chatId, `❌ Failed to add block: ${error.message}`)
          }
        } else {
          await sendMessage(chatId, parsed.reply || `📌 Added *${p.label}* on ${p.date} (${p.startTime}–${p.endTime})`)
        }
        break
      }

      case 'skip_block': {
        const p = parsed.params
        const { error } = await supabase.from('schedule_overrides').insert({
          id: crypto.randomUUID(),
          date: p.date,
          block_id: p.blockId,
          override_type: 'skip',
          locked: false,
        })
        if (error) {
          await sendMessage(chatId, `❌ Failed to skip: ${error.message}`)
        } else {
          await sendMessage(chatId, parsed.reply || `⏭ Skipped block for ${p.date}`)
        }
        break
      }

      case 'add_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').insert({
          id: crypto.randomUUID(),
          title: p.title,
          priority: p.priority || 'medium',
          category: p.category || 'personal',
          scheduled_date: p.scheduledDate,
          status: 'todo',
        })
        if (error) {
          await sendMessage(chatId, `❌ Failed to add task: ${error.message}`)
        } else {
          await sendMessage(chatId, parsed.reply || `✅ Added: *${p.title}*`)
        }
        break
      }

      case 'complete_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', p.taskId)
        if (error) {
          await sendMessage(chatId, `❌ Failed: ${error.message}`)
        } else {
          await sendMessage(chatId, parsed.reply || '✅ Done!')
        }
        break
      }

      case 'move_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').update({
          scheduled_date: p.scheduledDate,
        }).eq('id', p.taskId)
        if (error) {
          await sendMessage(chatId, `❌ Failed: ${error.message}`)
        } else {
          await sendMessage(chatId, parsed.reply || `📅 Moved to ${p.scheduledDate}`)
        }
        break
      }

      case 'chat':
      default:
        await sendMessage(chatId, parsed.reply || "I'm here to help! Try 'my day' or 'add Sobeys Saturday 8-4'")
    }
  } catch (error) {
    console.error('AI parsing error:', error)
    await sendMessage(chatId, '❌ Something went wrong processing that. Try again or use a simpler command like "my day".')
  }
}

// Webhook handler — must await handleMessage so Vercel doesn't kill the function early
export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    const message = update.message || update.edited_message
    if (message?.text && message?.chat?.id) {
      await handleMessage(message.chat.id, message.text)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', bot: 'adam-planner-telegram-webhook' })
}
