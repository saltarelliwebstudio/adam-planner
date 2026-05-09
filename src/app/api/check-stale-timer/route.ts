import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIME_CATEGORY_META } from '@/lib/time-log-parser'

export const runtime = 'nodejs'

const BOT_TOKEN = process.env.WHITE_COLLARED_BOT_TOKEN || ''
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const ADAM_CHAT_ID = '6842515203'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Thresholds (minutes)
const MIN_RUN_BEFORE_NUDGE = 3 * 60     // don't nudge before 3h
const NUDGE_COOLDOWN_MIN = 2 * 60       // then at most once every 2h

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

async function send(text: string) {
  if (!BOT_TOKEN) return
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  })
}

async function handle(req: NextRequest) {
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const cronAuth = req.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && cronAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { data: running } = await supabase
    .from('time_entries')
    .select('id, task, category, started_at, nudged_at')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!running) {
    return NextResponse.json({ status: 'no-active-timer' })
  }

  const startedAt = new Date(running.started_at)
  const runMinutes = Math.floor((now.getTime() - startedAt.getTime()) / 60000)
  if (runMinutes < MIN_RUN_BEFORE_NUDGE) {
    return NextResponse.json({ status: 'too-fresh', runMinutes })
  }

  if (running.nudged_at) {
    const mSinceLast = Math.floor((now.getTime() - new Date(running.nudged_at).getTime()) / 60000)
    if (mSinceLast < NUDGE_COOLDOWN_MIN) {
      return NextResponse.json({ status: 'cooldown', runMinutes, minutesSinceLastNudge: mSinceLast })
    }
  }

  const meta = TIME_CATEGORY_META[running.category] || { label: running.category, emoji: '⏱' }
  const label = running.task ? `${meta.emoji} *${meta.label}* — ${running.task}` : `${meta.emoji} *${meta.label}*`
  const text = [
    `⏰ Timer check-in`,
    ``,
    `${label}`,
    `Running for *${fmtDur(runMinutes)}*.`,
    ``,
    `Still going? Triple-tap to switch or say "done".`,
  ].join('\n')

  await send(text)
  await supabase.from('time_entries').update({ nudged_at: now.toISOString() }).eq('id', running.id)

  return NextResponse.json({
    status: 'nudged',
    id: running.id,
    category: running.category,
    runMinutes,
  })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
