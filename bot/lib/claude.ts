import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const BRAIN_DOMAINS = ['SWS', 'Content', 'School', 'Personal', 'Life', 'Training'] as const
const BRAIN_TYPES = ['Lesson', 'Framework', 'Decision', 'Insight', 'Idea', 'Reference', 'Client Note'] as const
const SERVICE_INTERESTS = ['voice_agent', 'automation', 'website', 'chatbot', 'sms', 'unspecified'] as const

export interface BrainClassification {
  brain: {
    name: string
    domain: (typeof BRAIN_DOMAINS)[number]
    type: (typeof BRAIN_TYPES)[number]
    source: string
    tags: string[]
    full_note: string
  }
  is_lead: boolean
  lead: {
    name: string
    business_name: string | null
    phone: string | null
    email: string | null
    service_interest: (typeof SERVICE_INTERESTS)[number]
    notes: string
    website_status: 'none' | 'outdated' | 'decent' | 'modern' | 'unknown'
  } | null
}

function pickEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value : fallback) as T[number]
}

function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function coerceNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').slice(0, 10)
}

export async function classifyInboxItem(captureText: string): Promise<BrainClassification> {
  const systemPrompt = `You are classifying a single raw capture from Adam's Notion Inbox into structured Brain metadata, and detecting whether it's a business lead for his agency (Saltarelli Web Studio — voice agents, automations, SMS drips for trades businesses).

Respond ONLY with valid JSON matching this shape:
{
  "brain": {
    "name": "short clean title (max 80 chars)",
    "domain": "SWS | Content | School | Personal | Life | Training",
    "type": "Lesson | Framework | Decision | Insight | Idea | Reference | Client Note",
    "source": "Inbox Capture",
    "tags": ["..."],
    "full_note": "3-5 sentence expansion of the capture"
  },
  "is_lead": true|false,
  "lead": {
    "name": "owner name if mentioned, else business name",
    "business_name": "e.g. Mike's Electric",
    "phone": null,
    "email": null,
    "service_interest": "voice_agent | automation | website | chatbot | sms | unspecified",
    "notes": "original capture verbatim + any extracted context",
    "website_status": "none | outdated | decent | modern | unknown"
  }
}

LEAD DETECTION (be CONSERVATIVE — false negatives beat false positives):
Mark is_lead=true ONLY when the capture clearly describes a local/trades BUSINESS as a sales prospect. Strong positive signals:
- explicit keywords: "lead", "cold call", "prospect", "saw their truck", "no website", "outdated site", "saw them at"
- a business name + a trade noun (electrical, HVAC, plumbing, landscaping, roofing, contracting, concrete, flooring, painting, masonry, auto, etc.)
- Adam describing seeing/meeting a business owner in person

Mark is_lead=false for:
- personal thoughts, feelings, running / training notes
- content ideas, scripts, video concepts
- technical notes about his own projects
- scheduling, planning, tasks
- ambiguous mentions of a business that aren't sales-oriented

If is_lead=false, set "lead" to null.

SERVICE_INTEREST rule:
Extract a specific service ONLY if Adam explicitly mentions one (voice agent, automation, website, chatbot, SMS/drip). If no service is mentioned, use "unspecified".

BRAIN FIELDS:
- For leads: domain="SWS", type="Client Note", tags should include "lead-gen"
- For non-leads: pick the best-fitting domain/type
- tags: short lowercase-hyphenated keywords, prefer common ones (productivity, framework, mindset, lead-gen, voice-agents, sales-process, content, short-form, training, school, family)
- source: always "Inbox Capture" for this handler

Respond with JSON only, no preamble.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: captureText }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Classifier returned no JSON')

  const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  const rawBrain = (raw.brain ?? {}) as Record<string, unknown>
  const rawLead = (raw.lead ?? null) as Record<string, unknown> | null

  const isLead = raw.is_lead === true
  const brain: BrainClassification['brain'] = {
    name: coerceString(rawBrain.name, captureText.slice(0, 80)),
    domain: pickEnum(rawBrain.domain, BRAIN_DOMAINS, 'Personal'),
    type: pickEnum(rawBrain.type, BRAIN_TYPES, 'Idea'),
    source: 'Inbox Capture',
    tags: coerceStringArray(rawBrain.tags),
    full_note: coerceString(rawBrain.full_note, captureText),
  }

  if (!isLead || !rawLead) {
    return { brain, is_lead: false, lead: null }
  }

  const lead: NonNullable<BrainClassification['lead']> = {
    name: coerceString(rawLead.name, coerceString(rawLead.business_name, 'Unknown')),
    business_name: coerceNullableString(rawLead.business_name),
    phone: coerceNullableString(rawLead.phone),
    email: coerceNullableString(rawLead.email),
    service_interest: pickEnum(rawLead.service_interest, SERVICE_INTERESTS, 'unspecified'),
    notes: coerceString(rawLead.notes, captureText),
    website_status: pickEnum(rawLead.website_status, ['none', 'outdated', 'decent', 'modern', 'unknown'] as const, 'unknown'),
  }

  return { brain, is_lead: true, lead }
}

export interface ParsedIntent {
  intent: 'get_schedule' | 'skip_block' | 'add_adhoc' | 'move_block' | 'add_task' | 'complete_task' | 'move_task' | 'rebuild_day' | 'get_recap' | 'crm_status' | 'crm_lead_detail' | 'crm_followups' | 'crm_pause_drip' | 'crm_add_lead' | 'dev_queue_add' | 'dev_queue_status' | 'scout_digest' | 'scout_content_ideas' | 'scout_research' | 'get_calendar' | 'chat'
  params: Record<string, string>
  reply: string
}

export async function parseUserMessage(message: string, scheduleContext: string): Promise<ParsedIntent> {
  const systemPrompt = `You are Adam's personal AI assistant for Saltarelli Web Studio. Parse his message into a structured action.

Current schedule context:
${scheduleContext}

Today's date: ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}

Respond ONLY with valid JSON in this format:
{
  "intent": "<intent>",
  "params": { ... },
  "reply": "Human-friendly confirmation message"
}

SCHEDULE INTENTS:
- "get_schedule": params { "date" }
- "skip_block": params { "blockLabel", "date" }
- "add_adhoc": params { "date", "label", "startTime" (HH:MM), "endTime" (HH:MM), "emoji" }
- "move_block": params { "blockLabel", "date", "startTime", "endTime" }
- "add_task": params { "title", "scheduledDate", "priority" (high/medium/low), "category" (business/client/school/personal/health) }
- "complete_task": params { "taskTitle" }
- "move_task": params { "taskTitle", "scheduledDate" }
- "rebuild_day": params { "date", "constraints" }
- "get_recap": no params

CRM INTENTS (leads, pipeline, drip campaigns):
- "crm_status": no params — overview of lead pipeline
- "crm_lead_detail": params { "name" } — look up a specific lead
- "crm_followups": no params — who needs follow-up
- "crm_pause_drip": params { "name" } — pause SMS drip for a lead
- "crm_add_lead": params { "name", "phone" } — add a new lead

DEV INTENTS (queue dev tasks for laptop processing):
- "dev_queue_add": params { "description", "project" } — queue a dev task
- "dev_queue_status": no params — list pending dev tasks

SCOUT INTENTS (research & content):
- "scout_digest": no params — get latest AI tools/trends digest
- "scout_content_ideas": params { "topic" } — content ideas for podcast/reels
- "scout_research": params { "topic" } — queue deep research for laptop

CALENDAR INTENTS:
- "get_calendar": params { "date" } — what meetings today

- "chat": just respond conversationally in "reply"

Trigger words: "crm", "leads", "pipeline", "drip", "follow up" → CRM intents.
Trigger words: "dev:", "build", "fix", "deploy" → dev intents.
Trigger words: "what's new", "research", "content ideas", "trending" → scout intents.
Trigger words: "meetings", "calendar", "calls" → calendar intents.

Parse dates naturally: "today", "tomorrow", "Saturday", "next Monday" etc into YYYY-MM-DD.
Parse times naturally: "8am" → "08:00", "2:30pm" → "14:30", "8-4" → startTime: "08:00", endTime: "16:00"`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ParsedIntent
    }
  } catch {
    // Fallback to chat
  }

  return {
    intent: 'chat',
    params: {},
    reply: text || "I didn't understand that. Try something like 'What's my day?' or 'Add Sobeys Saturday 8-4'",
  }
}
