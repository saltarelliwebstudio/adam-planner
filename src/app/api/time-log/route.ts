import { NextRequest, NextResponse } from 'next/server'
import { parseTimeLog, TimerContext } from '@/lib/time-log-parser'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const text: string = (body.text || '').trim()
  const activeTimer: TimerContext | null = body.activeTimer || null

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const now = new Date().toISOString()
  try {
    const result = await parseTimeLog(text, activeTimer, { apiKey, now })
    return NextResponse.json({ ...result, now })
  } catch (err) {
    return NextResponse.json({ error: 'parser failed', detail: String(err) }, { status: 500 })
  }
}
