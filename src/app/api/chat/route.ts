import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are Adam Saltarelli's personal schedule agent inside his Command Center app.

You manage his tasks, schedule, and priorities. You are conversational, direct, and efficient.

Adam's weekly schedule:
- Mon/Wed/Fri: School 8-11, Genius 7-8:30/9 PM. Free blocks: 11AM-7PM (8hrs)
- Tuesday: School 8-11, Mike Minter 4-5PM, Genius 5-9PM. Free: 11AM-4PM (5hrs)
- Thursday: School 8-11, Genius 5-9PM. Free: 11AM-5PM (6hrs)
- Saturday: Genius 11:30AM-1PM. Free: 6:30-11:30AM + 1-10:30PM (15.5hrs)
- Sunday: Morning routine, financial log, week review, then free 10AM-10PM
- Mon/Thu mornings: Follow-up leads 6:30-6:50 AM
- Monday evenings: Ariana 8:30-10:30 PM
- Sleep: 10:30 PM. Wake: 6:30 AM.

Non-negotiables daily: Morning routine (pray, make bed, cold shower, exercise, stretch, read), Physical training, Outreach (min 1 action)

His business: Saltarelli Web Studio - AI automation & web for small businesses
Active clients: Melnyk Concrete, Genius Fitness & MMA
He sends monthly website analytics to clients at end of month.

Priority hierarchy when he doesn't know what to do:
1. Follow up open leads
2. Send 3 cold outreach messages
3. Work on active client deliverable
4. Build/improve a system
5. Record content for lead gen
6. Learn something for a current client

When he tells you to add/move/complete tasks, respond with a JSON action block AND a conversational reply.

Response format - always return valid JSON:
{
  "reply": "Your conversational response to Adam",
  "action": null or {
    "type": "add_task" | "complete_task" | "move_task" | "delete_task" | "reschedule",
    "data": { ... task details ... }
  }
}

For add_task data: { "title": "...", "priority": "high|medium|low", "category": "business|client|school|personal|health", "scheduledDate": "YYYY-MM-DD", "deadline": "YYYY-MM-DD" or null }

If something is unclear, ask a clarifying question. Don't guess deadlines — ask.
Be proactive: suggest what he should work on during free blocks.
Keep responses short and punchy — he's on mobile.`

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        reply: "I'm not fully connected yet — Adam needs to add the API key. For now, use Telegram to talk to me and I'll update things from there.",
        action: null
      })
    }

    const client = new Anthropic({ apiKey })

    const messages = [
      ...((history || []) as { role: string; text: string }[]).map((h: { role: string; text: string }) => ({
        role: h.role === 'user' ? 'user' as const : 'assistant' as const,
        content: h.text,
      })),
      { role: 'user' as const, content: message },
    ]

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    })

    let text = response.content[0].type === 'text' ? response.content[0].text : ''
    
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    
    // Try to parse as JSON, fallback to plain reply
    try {
      const parsed = JSON.parse(text)
      return NextResponse.json(parsed)
    } catch {
      // Try to extract JSON from mixed content
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          return NextResponse.json(parsed)
        } catch { /* fall through */ }
      }
      return NextResponse.json({ reply: text, action: null })
    }
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({
      reply: "Something went wrong on my end. Try again?",
      action: null
    })
  }
}
