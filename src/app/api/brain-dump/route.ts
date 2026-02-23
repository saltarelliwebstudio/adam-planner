import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const { transcript, today, next7days, existingTasks, schedule } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ items: [], conflicts: ['API key not configured'], summary: '' })
    }

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are a schedule organizer for Adam Saltarelli, a 17-year-old who runs Saltarelli Web Studio (AI automation & web dev for small businesses).

TODAY: ${today}
Day: ${new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
Timezone: America/Toronto (Eastern Time)
Next 7 days: ${next7days || 'not provided'}

ADAM'S FIXED SCHEDULE FOR TODAY:
${schedule.map((b: { start: string; end: string; label: string; locked: boolean }) => `${b.start}-${b.end}: ${b.label}${b.locked ? ' (LOCKED - cannot move)' : ' (free block)'}`).join('\n')}

EXISTING TASKS (not yet done):
${existingTasks.length > 0 ? existingTasks.map((t: { title: string; scheduledDate: string; scheduledTime?: string; category: string }) => `- ${t.title} (${t.scheduledDate}${t.scheduledTime ? ' at ' + t.scheduledTime : ''}, ${t.category})`).join('\n') : 'None'}

Adam's weekly pattern:
- Mon/Wed/Fri: School 8-11, Genius Fitness 7-8:30/9 PM
- Tuesday: School 8-11, Mike Minter 4-5PM, Genius 5-9PM
- Thursday: School 8-11, Genius 5-9PM
- Saturday: Genius 11:30AM-1PM
- Sunday: Morning routine + review, then free
- Monday evenings: Ariana time 8:30-10:30 PM
- Sleep: 10:30 PM. Wake: 6:30 AM
- Active clients: Melnyk Concrete, Genius Fitness & MMA

BRAIN DUMP TRANSCRIPT:
"""
${transcript}
"""

Parse this brain dump into organized tasks. For each item:
1. Figure out what the task actually is (clean up rambling/verbal filler)
2. Assign a priority (high/medium/low) based on urgency and importance
3. Categorize it (business/client/school/personal/health)
4. Schedule it on the right date in a FREE block (never overlap locked blocks)
5. If there's a time conflict with existing tasks or locked schedule, flag it

IMPORTANT DATE RULES:
- "today" = ${today}
- "tomorrow" = the day after ${today}
- "Monday" = the NEXT Monday from today's date. Use the next 7 days list to find the exact date.
- "this week" = remaining days this week
- "next week" = the following week
- Always output dates as YYYY-MM-DD. NEVER get the date wrong.

If something is ambiguous (unclear time, unclear date, unclear what Adam means), add it to the "questions" array so he can clarify.

Return ONLY valid JSON (no markdown, no code fences):
{
  "items": [
    {
      "title": "Clean, actionable task title",
      "priority": "high" | "medium" | "low",
      "category": "business" | "client" | "school" | "personal" | "health",
      "scheduledDate": "YYYY-MM-DD",
      "scheduledTime": "HH:MM" or null,
      "deadline": "YYYY-MM-DD" or null,
      "conflict": "Description of conflict" or null
    }
  ],
  "conflicts": ["Global scheduling conflict descriptions"],
  "questions": ["Things that were unclear — ask Adam to clarify"],
  "summary": "Brief summary: 'Got it — X tasks organized. [any key notes]'"
}`
      }]
    })

    let text = response.content[0].type === 'text' ? response.content[0].text : ''
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ items: [], conflicts: ['Could not parse response. Try again.'], summary: text })
    }
  } catch (error) {
    console.error('Brain dump error:', error)
    return NextResponse.json({ items: [], conflicts: ['Server error. Try again.'], summary: '' })
  }
}
