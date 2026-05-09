import Anthropic from '@anthropic-ai/sdk'

// Taxonomy mirrored from src/lib/time-store.ts (server-side duplicate so
// API routes don't import client-only code).
export const TIME_CATEGORY_META: Record<string, { label: string; emoji: string; group: string; hint?: string }> = {
  'cold-outreach':    { label: 'Cold Outreach',         emoji: '📞', group: 'work',     hint: 'prospecting, cold calls, reaching new leads' },
  'follow-ups':       { label: 'Follow-Ups',            emoji: '🔄', group: 'work',     hint: 'replying to warm leads, checking in' },
  'client-work':      { label: 'Client Work',           emoji: '💻', group: 'work',     hint: 'billable delivery for existing clients' },
  'proposals':        { label: 'Proposal / Quoting',    emoji: '📝', group: 'work',     hint: 'writing quotes, estimates, SOWs' },
  'admin':            { label: 'Admin & Invoicing',     emoji: '🧾', group: 'work',     hint: 'invoicing, bookkeeping, email triage' },
  'deep-work':        { label: 'Deep Work / Building',  emoji: '🔨', group: 'work',     hint: 'Adam\'s own products / AI automations / any self-directed building (Saltarelli Hub, Genius portal, agents)' },
  'gym':              { label: 'Gym / Training',        emoji: '💪', group: 'health',   hint: 'lifting, MMA, jiu-jitsu, running workouts' },
  'bathroom':         { label: 'Bathroom',              emoji: '🚽', group: 'health' },
  'grooming':         { label: 'Showering / Grooming',  emoji: '🚿', group: 'health' },
  'cooking':          { label: 'Cooking / Meal Prep',   emoji: '🍳', group: 'health' },
  'eating':           { label: 'Eating',                emoji: '🍽️', group: 'health' },
  'naps':             { label: 'Naps',                  emoji: '💤', group: 'health' },
  'stretching':       { label: 'Stretching / Mobility', emoji: '🤸', group: 'health' },
  'dog-walking':      { label: 'Walking the Dog',       emoji: '🐕', group: 'home' },
  'pet-care':         { label: 'Pet Care',              emoji: '🐾', group: 'home' },
  'cleaning':         { label: 'Cleaning',              emoji: '🧹', group: 'home' },
  'laundry':          { label: 'Laundry',               emoji: '👕', group: 'home' },
  'yard-work':        { label: 'Yard Work',             emoji: '🌿', group: 'home' },
  'home-maintenance': { label: 'Home Maintenance',      emoji: '🔧', group: 'home' },
  'learning':         { label: 'Learning / Research',   emoji: '📚', group: 'growth',   hint: 'tutorials, courses, reading technical docs' },
  'school':           { label: 'School / Homework',     emoji: '🎓', group: 'growth',   hint: 'classes, assignments, studying for school, math problems' },
  'socializing':      { label: 'Socializing',           emoji: '🍻', group: 'growth' },
  'meetings':         { label: 'Meetings / Calls',      emoji: '📱', group: 'growth' },
  'errands':          { label: 'Personal Errands',      emoji: '🏃', group: 'downtime' },
  'sleep':            { label: 'Sleep / Rest',          emoji: '😴', group: 'downtime' },
  'commuting':        { label: 'Commuting / Driving',   emoji: '🚗', group: 'downtime' },
  'scrolling':        { label: 'Scrolling / Social Media', emoji: '📱', group: 'downtime' },
  'tv':               { label: 'TV / Entertainment',    emoji: '📺', group: 'downtime' },
  'gaming':           { label: 'Gaming',                emoji: '🎮', group: 'downtime' },
  'reading-fun':      { label: 'Reading for Fun',       emoji: '📖', group: 'downtime' },
}

const VALID_KEYS = new Set(Object.keys(TIME_CATEGORY_META))

const PRIORITIES_PROMPT = `Adam's stated priorities (use these to break ties when categorizing):
- Saltarelli Web Studio (AI automation agency for trades businesses) → "deep-work"
- School / homework (he's a student) → "school"
- Ultra training (PC100 100-miler Jun, Niagara Marathon Oct) → "gym" for workouts, "stretching" for mobility
- Genius Fitness MMA → "deep-work" if he's building the app, "gym" if he's training there
- Client work for Cassar, Bell Marine, G&D Landscaping, Aborigen → "client-work"
- Cold outreach to trades businesses → "cold-outreach"`

export interface ParsedSegment {
  task: string
  category: string
  durationMinutes: number | null
  confidence: number
}

export interface ParsedPayload {
  mode: 'backfill' | 'start' | 'stop' | 'switch' | 'unknown'
  segments: ParsedSegment[]
  note?: string
}

export interface TimerContext {
  category: string
  task: string
  startedAt: string
}

function buildPrompt(text: string, activeTimer: TimerContext | null, now: string) {
  const catList = Object.entries(TIME_CATEGORY_META)
    .map(([key, m]) => `- ${key} (${m.label}${m.hint ? ` — ${m.hint}` : ''})`)
    .join('\n')

  const timerContext = activeTimer
    ? `\nA timer is currently running: category="${activeTimer.category}", task="${activeTimer.task}", started at ${activeTimer.startedAt}.`
    : '\nNo timer is currently running.'

  return `You are Adam's time tracker parser. Read his message and return structured time log data.

Current time: ${now} (America/Toronto).${timerContext}

${PRIORITIES_PROMPT}

Categories (pick "key" from this list, never invent new ones):
${catList}

USER MESSAGE:
"""
${text}
"""

Decide mode:
- "backfill" → user is logging something he already did (past tense, or includes durations like "25 min", "for an hour"). Create one or more segments.
- "start" → user wants to begin a new timer now ("starting deep work", "working on math now", "about to do gym").
- "stop" → user wants to stop the current timer ("done", "stopping", "finished").
- "switch" → a timer is already running and he names a new activity with present-tense/"now"/"switching". Stop the old and start the new.
- "unknown" → message is too vague to act on.

Rules:
- For backfill, estimate durationMinutes from phrases ("25 min"=25, "an hour"=60, "half hour"=30, "a bit"=10 as a guess → lower confidence).
- For start/switch, leave durationMinutes null (timer hasn't stopped yet).
- For stop, segments should be empty.
- task = short human label (max 6 words) derived from what he said. Don't invent details.
- category = one key from the list above. Use your semantic judgment — "homework" → school, "working on Genius" → deep-work, "scrolled TikTok" → scrolling.
- confidence = 0.0–1.0. Set < 0.6 if the activity is genuinely ambiguous.
- note (optional) = one short sentence if you want to flag something.

Respond with ONLY a single JSON object, no markdown fences, no prose:
{"mode":"...","segments":[{"task":"...","category":"...","durationMinutes":25,"confidence":0.9}],"note":"optional"}`
}

function extractJson(text: string): ParsedPayload | null {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) as ParsedPayload } catch { /* fallthrough */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1]) as ParsedPayload } catch { /* fallthrough */ }
  }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)) as ParsedPayload } catch { /* fallthrough */ }
  }
  return null
}

function sanitize(p: ParsedPayload): ParsedPayload {
  const validModes = new Set(['backfill', 'start', 'stop', 'switch', 'unknown'])
  const mode = (validModes.has(p.mode) ? p.mode : 'unknown') as ParsedPayload['mode']
  const segments = (Array.isArray(p.segments) ? p.segments : [])
    .map(s => ({
      task: String(s.task || '').slice(0, 80),
      category: VALID_KEYS.has(s.category) ? s.category : 'errands',
      durationMinutes: typeof s.durationMinutes === 'number' && s.durationMinutes > 0
        ? Math.round(s.durationMinutes)
        : null,
      confidence: typeof s.confidence === 'number'
        ? Math.max(0, Math.min(1, s.confidence))
        : 0.5,
    }))
    .filter(s => s.task.length > 0 || mode === 'stop' || mode === 'unknown')
  return { mode, segments, note: p.note }
}

export async function parseTimeLog(
  text: string,
  activeTimer: TimerContext | null,
  opts: { apiKey: string; now?: string } = { apiKey: '' }
): Promise<ParsedPayload> {
  const now = opts.now || new Date().toISOString()
  const client = new Anthropic({ apiKey: opts.apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: buildPrompt(text, activeTimer, now) }],
  })

  const block = response.content.find(b => b.type === 'text')
  const responseText = block && block.type === 'text' ? block.text : ''
  const parsed = extractJson(responseText)
  if (!parsed) {
    return { mode: 'unknown', segments: [], note: 'parser returned unstructured output' }
  }
  return sanitize(parsed)
}
