import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

interface WeekEntry {
  date: string        // YYYY-MM-DD in Toronto tz
  dayOfWeek: string   // Mon, Tue, …
  category: string
  task: string
  durationMinutes: number
  startedAt: string
  stoppedAt: string
}

interface CategoryTotal {
  key: string
  label: string
  minutes: number
  deltaMinutes: number
}

const PRIORITIES = `Adam's stated priorities: Saltarelli Web Studio (AI automation agency for trades businesses), school/homework, ultra training (PC100 100-miler Jun + Niagara Marathon Oct), Genius Fitness MMA client + training, client work (Cassar, Bell Marine, G&D Landscaping, Aborigen). Downtime (scrolling/tv/gaming) is NOT a priority.`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const question: string = (body.question || '').trim()
  const entries: WeekEntry[] = body.entries || []
  const totals: CategoryTotal[] = body.totals || []
  const weekLabel: string = body.weekLabel || ''

  if (!question) {
    return new Response('data: {"error":"question is required"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('data: {"error":"API key not configured"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const client = new Anthropic({ apiKey })

  const totalsBlock = totals.length > 0
    ? totals.map(t => `  ${t.label} (${t.key}): ${t.minutes} min (Δ ${t.deltaMinutes >= 0 ? '+' : ''}${t.deltaMinutes} vs last week)`).join('\n')
    : '  (no tracked time)'

  // Cap entries to keep prompt bounded — prioritize longest & most recent
  const trimmedEntries = [...entries]
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, 120)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  const entriesBlock = trimmedEntries.length > 0
    ? trimmedEntries.map(e =>
        `  ${e.date} ${e.dayOfWeek} ${e.startedAt.slice(11, 16)}–${e.stoppedAt.slice(11, 16)} · ${e.category} · ${e.durationMinutes}min · ${e.task || '—'}`
      ).join('\n')
    : '  (no entries)'

  const prompt = `You are Adam's weekly review analyst. Answer his question using only the tracked time data below.

${PRIORITIES}

Week: ${weekLabel}

Category totals:
${totalsBlock}

Time entries (chronological):
${entriesBlock}

QUESTION:
${question}

Be concise — 1 to 3 short paragraphs. Reference specific days/times/numbers from the data when they support your answer. If the data doesn't cover it, say so plainly. Don't pad with generic advice.`

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const chunk = event.delta.text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'stream failed' })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
