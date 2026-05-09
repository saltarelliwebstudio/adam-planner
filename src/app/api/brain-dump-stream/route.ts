import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { chunk, today, dayOfWeek, schedule, existingTaskTitles, previousCards } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('data: {"error":"API key not configured"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const client = new Anthropic({ apiKey })

  const prevCardsList = previousCards?.length
    ? `\nALREADY CREATED (do NOT duplicate these):\n${previousCards.map((c: { title: string }) => `- ${c.title}`).join('\n')}`
    : ''

  const scheduleSummary = schedule?.length
    ? schedule.map((b: { start: string; end: string; label: string; locked: boolean }) =>
        `${b.start}-${b.end}: ${b.label}${b.locked ? ' (LOCKED)' : ''}`
      ).join(', ')
    : 'not provided'

  const existingList = existingTaskTitles?.length
    ? existingTaskTitles.join(', ')
    : 'none'

  const prompt = `You are Adam's task parser. Parse this voice transcript chunk into tasks.

TODAY: ${today} (${dayOfWeek}). Timezone: America/Toronto.
Schedule: ${scheduleSummary}
Existing tasks: ${existingList}${prevCardsList}

TRANSCRIPT CHUNK:
"${chunk}"

Rules:
- Output one JSON object per line (JSONL). No arrays, no wrapping.
- Each line must be a complete valid JSON object.
- Only create NEW tasks from this transcript. Skip anything already in previous cards.
- Dates as YYYY-MM-DD. "today"=${today}, "tomorrow"=day after ${today}.
- Categories: business, client, school, personal, health.
- Priorities: high, medium, low.

Format per line:
{"title":"...","priority":"...","category":"...","scheduledDate":"YYYY-MM-DD","scheduledTime":"HH:MM or null","conflict":null}

If the transcript is an edit command (like "change X to Y", "delete the last one", "actually I meant"), return:
{"action":"edit","match":"title fragment to find","updates":{"field":"newValue"}}
or {"action":"delete","match":"title fragment or 'last'"}

If the transcript is unclear or too short to parse, return nothing (empty response).
Output ONLY JSONL lines, no other text.`

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let buffer = ''
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            buffer += event.delta.text
            // Extract complete JSONL lines as they arrive
            while (buffer.includes('\n')) {
              const lineEnd = buffer.indexOf('\n')
              const line = buffer.slice(0, lineEnd).trim()
              buffer = buffer.slice(lineEnd + 1)
              if (line.startsWith('{')) {
                try {
                  const parsed = JSON.parse(line)
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
                } catch {
                  // incomplete JSON, skip
                }
              }
            }
          }
        }
        // Flush remaining buffer
        if (buffer.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(buffer.trim())
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
          } catch {
            // skip
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`data: {"error":"Processing failed"}\n\n`))
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
