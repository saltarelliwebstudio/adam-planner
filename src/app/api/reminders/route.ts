import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.WHITE_COLLARED_BOT_TOKEN || ''
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const ADAM_CHAT_ID = '6842515203'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function nowMinutesToronto(): number {
  const now = new Date()
  const toronto = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
  return toronto.getHours() * 60 + toronto.getMinutes()
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12} ${ap}` : `${h12}:${m.toString().padStart(2, '0')} ${ap}`
}

async function send(text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADAM_CHAT_ID, text }),
  })
}

export async function GET(req: NextRequest) {
  // Auth
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const cronAuth = req.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && cronAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = todayToronto()
  const nowMin = nowMinutesToronto()
  const dow = new Date(date + 'T12:00:00').getDay()

  // Get schedule
  const { data: blocks } = await supabase
    .from('schedule_blocks').select('*').eq('day_of_week', dow).order('sort_order', { ascending: true })
  const { data: overrides } = await supabase
    .from('schedule_overrides').select('*').eq('date', date)

  const skipped = new Set((overrides || []).filter(o => o.override_type === 'skip').map(o => o.block_id))

  // Collect all blocks for today
  const allBlocks: { start: string; end: string; label: string; emoji: string }[] = []

  for (const b of blocks || []) {
    if (skipped.has(b.id)) continue
    allBlocks.push({ start: b.start_time, end: b.end_time, label: b.label, emoji: b.emoji })
  }
  for (const o of (overrides || []).filter(o => o.override_type === 'adhoc' && o.start_time)) {
    allBlocks.push({ start: o.start_time, end: o.end_time, label: o.label || 'Ad-hoc', emoji: o.emoji || '📌' })
  }

  // Find blocks starting in next 25-35 minutes (sweet spot for 30-min cron)
  const upcoming = allBlocks.filter(b => {
    const startMin = timeToMinutes(b.start)
    const diff = startMin - nowMin
    return diff >= 25 && diff <= 35
  })

  // Check for already-sent reminders (avoid duplicates)
  const sent: string[] = []
  for (const block of upcoming) {
    // Check if we already sent a reminder for this block today (stored in planner_icebox)
    try {
      const { data: existing } = await supabase
        .from('planner_metadata')
        .select('id')
        .like('key', `REM|${date}|${block.label}%`)
        .limit(1)

      if (existing && existing.length > 0) continue
    } catch {}

    const msg = `⏰ Coming up in 30 min:\n${block.emoji} ${block.label} (${fmt12(block.start)} - ${fmt12(block.end)})\n\nGet ready! 🔥`
    await send(msg)
    sent.push(block.label)

    // Log the reminder to prevent duplicates
    try {
      await supabase.from('planner_metadata').insert({
        key: `REM|${date}|${block.label}`,
      })
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    date,
    nowMinutes: nowMin,
    checked: allBlocks.length,
    reminded: sent,
  })
}
