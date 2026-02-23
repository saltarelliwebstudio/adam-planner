import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const { today, currentTime, currentBlock, todayTasks, overdueTasks, priorityFramework } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        task: priorityFramework?.[0] || 'Follow up open leads',
        reason: 'API not configured — defaulting to priority #1',
        priority: 'high',
        category: 'business',
      })
    }

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are Adam Saltarelli's productivity advisor. He's 17, runs Saltarelli Web Studio (AI automation & web dev for small businesses).

Right now: ${today} at ${currentTime}
${currentBlock ? `Current block: ${currentBlock.label} (${currentBlock.locked ? 'locked' : 'free'}, ends at ${currentBlock.end})` : 'No specific block right now'}

Today's remaining tasks:
${todayTasks.length > 0 ? todayTasks.map((t: { title: string; priority: string; category: string }) => `- [${t.priority}] ${t.title} (${t.category})`).join('\n') : 'None'}

Overdue tasks:
${overdueTasks.length > 0 ? overdueTasks.map((t: { title: string; priority: string; scheduledDate: string }) => `- ${t.title} (since ${t.scheduledDate})`).join('\n') : 'None'}

Priority framework (in order):
${priorityFramework.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}

What ONE thing should Adam do RIGHT NOW to move the needle? Consider:
- Time of day (is he in a free block or locked?)
- Overdue items (these should get addressed)
- What would generate revenue fastest
- His energy level (late = lighter tasks)

Return ONLY JSON (no markdown):
{
  "task": "The specific thing to do",
  "reason": "Why this, why now (1-2 sentences, direct, motivating)",
  "priority": "high" | "medium" | "low",
  "category": "business" | "client" | "school" | "personal" | "health",
  "timeEstimate": "15 min" | "30 min" | "1 hour" etc
}`
      }]
    })

    let text = response.content[0].type === 'text' ? response.content[0].text : ''
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      return NextResponse.json(JSON.parse(jsonMatch ? jsonMatch[0] : text))
    } catch {
      return NextResponse.json({ task: text, reason: '', priority: 'medium', category: 'business' })
    }
  } catch (error) {
    console.error('What next error:', error)
    return NextResponse.json({
      task: 'Follow up with your most recent lead',
      reason: 'When in doubt, follow the money.',
      priority: 'high',
      category: 'business',
    })
  }
}
