import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TIME_CATEGORY_META } from '@/lib/time-log-parser'

export const runtime = 'nodejs'

const VALID_KEYS = new Set(Object.keys(TIME_CATEGORY_META))

const PRIORITIES = `Adam's stated priorities:
- Saltarelli Web Studio (AI automation agency for trades businesses). Revenue comes from cold outreach + follow-ups + client-work + shipping his own products (deep-work).
- School / homework — he's a student, can't neglect it.
- Ultra training: PC100 100-miler (Jun 13), then Niagara Marathon sub-4:00 (Oct 26). Running + stretching/mobility are non-negotiable.
- Genius Fitness MMA client app (active build) + training there (jiu-jitsu / lifting).
- Existing clients: Cassar Electrical, Bell Marine, G&D Landscaping, Aborigen Hats.
- Pomodoro + guitar breaks are his work pattern.
- Downtime (scrolling, tv, gaming) is NOT a priority — flag when it crowds out the above.`

interface CategorySnapshot {
  key: string
  label: string
  minutes: number
  deltaMinutes: number
  trend4w: number[]
}

interface Commitment {
  label: string                   // human-readable, e.g. "2× cold-outreach blocks, Mon/Wed 9–10am"
  category: string                // category key
  targetMinutes: number           // aggregate target for the week
  rationale: string               // one short sentence
}

function buildPrompt(
  thisWeek: CategorySnapshot[],
  prevWeek: CategorySnapshot[],
  thisTotalMin: number,
  prevTotalMin: number,
) {
  const fmtRow = (c: CategorySnapshot) =>
    `  ${c.label} (${c.key}): ${c.minutes} min this week (Δ ${c.deltaMinutes >= 0 ? '+' : ''}${c.deltaMinutes}), 4-week trend ${c.trend4w.join(' → ')}`

  const thisBlock = thisWeek.length > 0
    ? thisWeek.map(fmtRow).join('\n')
    : '  (no tracked time this week)'
  const prevBlock = prevWeek.length > 0
    ? prevWeek.map(fmtRow).join('\n')
    : '  (no tracked time last week)'

  const catList = Object.entries(TIME_CATEGORY_META)
    .map(([key, m]) => `- ${key} (${m.label})`)
    .join('\n')

  return `You are Adam's weekly accountability coach. Based on where his time actually went this week versus last week, propose 3 to 5 specific commitments for NEXT WEEK.

${PRIORITIES}

This week total tracked: ${thisTotalMin} min
Last week total tracked: ${prevTotalMin} min

This week by category:
${thisBlock}

Last week by category:
${prevBlock}

Valid categories (use the key field exactly):
${catList}

Rules for your proposals:
- Each commitment should be SPECIFIC and scheduleable ("2× 45-min cold-outreach blocks, Mon & Wed mornings" beats "do more outreach").
- Favor categories where Adam under-invested this week relative to his priorities (especially deep-work, cold-outreach, school, gym, stretching).
- Flag it when a downtime category (scrolling, tv, gaming) is crowding out priority work — but propose the positive commitment, not the restriction.
- targetMinutes = realistic weekly total for that commitment (e.g. 120 for 2× 60-min blocks). Keep it achievable.
- rationale = one short sentence tied to THIS WEEK's data ("scrolling doubled while cold-outreach dropped 60%").
- Order proposals by impact on his stated priorities — highest leverage first.
- 3 to 5 commitments total. No more.

Respond with ONLY a JSON object, no markdown:
{"commitments":[{"label":"...","category":"...","targetMinutes":120,"rationale":"..."}]}`
}

function extractJson(text: string): { commitments?: Commitment[] } | null {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fallthrough */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) { try { return JSON.parse(fenced[1]) } catch { /* fallthrough */ } }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)) } catch { /* fallthrough */ }
  }
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const thisWeek: CategorySnapshot[] = body.thisWeek || []
  const prevWeek: CategorySnapshot[] = body.prevWeek || []
  const thisTotalMin: number = body.thisTotalMin || 0
  const prevTotalMin: number = body.prevTotalMin || 0

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: buildPrompt(thisWeek, prevWeek, thisTotalMin, prevTotalMin),
      }],
    })
    const block = res.content.find(b => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const parsed = extractJson(raw)
    const rawCommitments: Commitment[] = parsed?.commitments || []

    // Sanitize
    const commitments = rawCommitments
      .map(c => ({
        label: String(c.label || '').slice(0, 140),
        category: VALID_KEYS.has(c.category) ? c.category : 'deep-work',
        targetMinutes: typeof c.targetMinutes === 'number' && c.targetMinutes > 0
          ? Math.round(c.targetMinutes)
          : 60,
        rationale: String(c.rationale || '').slice(0, 200),
      }))
      .filter(c => c.label.length > 0)
      .slice(0, 5)

    return NextResponse.json({ commitments })
  } catch (err) {
    return NextResponse.json({ error: 'commitments failed', detail: String(err) }, { status: 500 })
  }
}
