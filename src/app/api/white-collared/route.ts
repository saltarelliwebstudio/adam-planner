import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getRunWorkout, getWeekInfo } from '@/lib/running-plan'

const BOT_TOKEN = process.env.WHITE_COLLARED_BOT_TOKEN || ''
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Hub Supabase for CRM/leads
const hubSupabase = process.env.HUB_SUPABASE_URL && process.env.HUB_SUPABASE_SERVICE_KEY
  ? createClient(process.env.HUB_SUPABASE_URL, process.env.HUB_SUPABASE_SERVICE_KEY)
  : null

const anthropic = new Anthropic()

// ─── CRM HELPERS ───

const STATUS_EMOJI: Record<string, string> = {
  cold: '🧊', warm: '🌤', hot: '🔥', followed_up: '📞', replied: '💬', demo_booked: '📅',
  closed: '🏁', client: '✅', do_not_contact: '🚫',
}

async function getCrmStatus(): Promise<string> {
  if (!hubSupabase) return '❌ CRM not connected (missing Hub credentials)'
  const { data: leads } = await hubSupabase.from('admin_leads').select('status, drip_active')
  if (!leads) return '❌ Could not fetch leads'

  const counts: Record<string, number> = {}
  let activeDrips = 0
  for (const l of leads) {
    counts[l.status] = (counts[l.status] || 0) + 1
    if (l.drip_active) activeDrips++
  }

  const lines = [
    `📊 Pipeline Overview (${leads.length} total)`,
    '',
  ]
  for (const [status, emoji] of Object.entries(STATUS_EMOJI)) {
    if (counts[status]) lines.push(`${emoji} ${status}: ${counts[status]}`)
  }
  lines.push('', `📨 Active drips: ${activeDrips}`)

  // Recent failures
  const { data: failures } = await hubSupabase
    .from('sms_drip_log')
    .select('lead_id, error_message, created_at')
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(5)
  if (failures && failures.length > 0) {
    lines.push(``, `⚠️ ${failures.length} failure(s) in last 24h`)
  }

  return lines.join('\n')
}

async function getFollowupsDue(): Promise<string> {
  if (!hubSupabase) return '❌ CRM not connected'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  const { data: leads } = await hubSupabase
    .from('admin_leads')
    .select('name, business_name, status, phone, drip_step, next_followup_date, last_contacted_date')
    .not('status', 'in', '("closed","client","do_not_contact")')
    .or(`next_followup_date.lte.${today},next_followup_date.is.null`)
    .order('next_followup_date', { ascending: true })
    .limit(10)

  if (!leads || leads.length === 0) return '✅ No follow-ups due — you\'re caught up!'

  const lines = [`📞 Follow-ups Due (${leads.length})`, '']
  for (const l of leads) {
    const biz = l.business_name ? ` (${l.business_name})` : ''
    const emoji = STATUS_EMOJI[l.status] || '•'
    const overdue = l.next_followup_date ? ` — due ${l.next_followup_date}` : ' — never followed up'
    lines.push(`${emoji} ${l.name}${biz}${overdue}`)
    if (l.phone) lines.push(`   ${l.phone}`)
  }
  return lines.join('\n')
}

async function getLeadDetail(name: string): Promise<string> {
  if (!hubSupabase) return '❌ CRM not connected'
  const { data: leads } = await hubSupabase
    .from('admin_leads')
    .select('*')
    .ilike('name', `%${name}%`)
    .limit(3)

  if (!leads || leads.length === 0) return `🤔 No lead found matching "${name}"`

  const lines: string[] = []
  for (const l of leads) {
    const emoji = STATUS_EMOJI[l.status] || '•'
    const biz = l.business_name ? ` (${l.business_name})` : ''
    lines.push(
      `${emoji} ${l.name}${biz}`,
      `   Status: ${l.status}`,
      l.phone ? `   Phone: ${l.phone}` : '',
      l.email ? `   Email: ${l.email}` : '',
      l.source ? `   Source: ${l.source}` : '',
      `   Drip: ${l.drip_active ? `Active (step ${l.drip_step}/7)` : 'Inactive'}`,
      l.last_contacted_date ? `   Last contact: ${l.last_contacted_date}` : '   Never contacted',
      l.next_followup_date ? `   Follow-up: ${l.next_followup_date}` : '',
      l.notes ? `   Notes: ${l.notes}` : '',
      '',
    )
  }
  return lines.filter(Boolean).join('\n')
}

async function logLeadContact(name: string): Promise<string> {
  if (!hubSupabase) return '❌ CRM not connected'
  const { data: leads } = await hubSupabase
    .from('admin_leads')
    .select('id, name, business_name')
    .ilike('name', `%${name}%`)
    .limit(1)

  if (!leads || leads.length === 0) return `🤔 No lead found matching "${name}"`

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  await hubSupabase.from('admin_leads').update({ last_contacted_date: today }).eq('id', leads[0].id)
  const biz = leads[0].business_name ? ` (${leads[0].business_name})` : ''
  return `✅ Logged contact with ${leads[0].name}${biz} for today`
}

async function updateLeadStatus(name: string, status: string): Promise<string> {
  if (!hubSupabase) return '❌ CRM not connected'
  const validStatuses = ['cold', 'warm', 'hot', 'followed_up', 'replied', 'demo_booked', 'closed', 'client', 'do_not_contact']
  if (!validStatuses.includes(status)) return `❌ Invalid status. Use: ${validStatuses.join(', ')}`

  const { data: leads } = await hubSupabase
    .from('admin_leads')
    .select('id, name, business_name')
    .ilike('name', `%${name}%`)
    .limit(1)

  if (!leads || leads.length === 0) return `🤔 No lead found matching "${name}"`

  await hubSupabase.from('admin_leads').update({ status }).eq('id', leads[0].id)
  const emoji = STATUS_EMOJI[status] || '•'
  return `${emoji} Updated ${leads[0].name} to ${status}`
}

// ─── CONVERSATION MEMORY (uses planner_icebox table) ───
// Format: "CTX|{chatId}|{intent}|{targetId}|{targetLabel}"

async function getLastAction(chatId: number): Promise<{ intent: string; label?: string; id?: string } | null> {
  try {
    const { data } = await supabase
      .from('planner_metadata')
      .select('key, created_at')
      .like('key', `CTX|${chatId}|%`)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data[0]) {
      const parts = data[0].key.split('|')
      return { intent: parts[2], id: parts[3] || undefined, label: parts[4] || undefined }
    }
  } catch {}
  return null
}

async function logAction(chatId: number, intent: string, targetId?: string, targetLabel?: string) {
  try {
    // Delete old context entries for this chat (keep only last 5)
    const { data: old } = await supabase
      .from('planner_metadata')
      .select('id')
      .like('key', `CTX|${chatId}|%`)
      .order('created_at', { ascending: false })
      .range(5, 100)
    if (old && old.length > 0) {
      await supabase.from('planner_metadata').delete().in('id', old.map(r => r.id))
    }
    // Insert new context
    await supabase.from('planner_metadata').insert({
      key: `CTX|${chatId}|${intent}|${targetId || ''}|${targetLabel || ''}`,
    })
  } catch {}
}

// Fallback in-memory
const lastActionMem = new Map<number, { intent: string; label?: string; id?: string }>()

// ─── SUNDAY DEBRIEF STATE MACHINE ───

const DEBRIEF_STEPS = ['step1', 'step2', 'step3', 'step4'] as const
type DebriefStep = typeof DEBRIEF_STEPS[number]

const DEBRIEF_QUESTIONS: Record<DebriefStep, string> = {
  step1: '💭 What went well this week? What are you most proud of?',
  step2: '🔍 What could have been better? Any friction or blockers?',
  step3: '🎯 What are your top priorities for next week?',
  step4: '🏁 Any specific goals, commitments, or deadlines to lock in?',
}

async function getActiveDebrief(chatId: number): Promise<DebriefStep | null> {
  try {
    const { data } = await supabase
      .from('planner_metadata')
      .select('key, created_at')
      .like('key', `DEBRIEF|${chatId}|%`)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data[0]) {
      // Auto-expire after 4 hours
      const age = Date.now() - new Date(data[0].created_at).getTime()
      if (age > 4 * 60 * 60 * 1000) {
        await clearDebriefData(chatId)
        return null
      }
      const step = data[0].key.split('|')[2] as DebriefStep
      if (DEBRIEF_STEPS.includes(step)) return step
    }
  } catch {}
  return null
}

async function setDebriefStep(chatId: number, step: DebriefStep | 'done') {
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF|${chatId}|%`)
  if (step !== 'done') {
    await supabase.from('planner_metadata').insert({ key: `DEBRIEF|${chatId}|${step}` })
  }
}

async function storeDebriefAnswer(chatId: number, step: DebriefStep, answer: string) {
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF_ANS|${chatId}|${step}`)
  await supabase.from('planner_metadata').insert({ key: `DEBRIEF_ANS|${chatId}|${step}`, value: answer })
}

async function getDebriefAnswers(chatId: number): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('planner_metadata')
    .select('key, value')
    .like('key', `DEBRIEF_ANS|${chatId}|%`)
  const answers: Record<string, string> = {}
  for (const row of data || []) {
    const step = row.key.split('|')[2]
    answers[step] = row.value || ''
  }
  return answers
}

async function clearDebriefData(chatId: number) {
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF|${chatId}|%`)
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF_ANS|${chatId}|%`)
}

async function processDebriefReply(chatId: number, text: string, currentStep: DebriefStep) {
  await storeDebriefAnswer(chatId, currentStep, text)

  const stepIndex = DEBRIEF_STEPS.indexOf(currentStep)

  if (stepIndex < DEBRIEF_STEPS.length - 1) {
    const nextStep = DEBRIEF_STEPS[stepIndex + 1]
    await setDebriefStep(chatId, nextStep)

    const ack = currentStep === 'step1' ? '👍 Great reflection!'
      : currentStep === 'step2' ? '📝 Noted — that\'s valuable awareness.'
      : '💪 Solid priorities.'

    await send(chatId, `${ack}\n\n${DEBRIEF_QUESTIONS[nextStep]}`)
  } else {
    await send(chatId, '🧠 Got it! Let me synthesize everything into your weekly plan...')
    await synthesizeWeeklyPlan(chatId)
  }
}

async function synthesizeWeeklyPlan(chatId: number) {
  const answers = await getDebriefAnswers(chatId)

  // Get next week's schedule (Mon-Fri)
  const now = new Date()
  const toronto = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
  const currentDow = toronto.getDay()
  const daysUntilMon = currentDow === 0 ? 1 : currentDow === 1 ? 0 : 8 - currentDow
  const monday = new Date(toronto)
  monday.setDate(monday.getDate() + daysUntilMon)

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const weekSchedule: string[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
    const dayData = await getScheduleData(dateStr)
    const resolved = resolveBlocks(dayData.blocks, dayData.overrides)
    const tasks = dayData.tasks.filter((t: any) => t.status !== 'done')
    weekSchedule.push(`${dayNames[d.getDay()]} (${dateStr}): ${resolved.map(b => `${b.time} ${b.label}`).join(', ')} | Tasks: ${tasks.map((t: any) => t.title).join(', ') || 'none'}`)
  }

  // Get weekly recap
  let recapData = ''
  try {
    const res = await fetch(`https://adam-planner.vercel.app/api/recap`, {
      headers: { 'x-api-secret': process.env.CRON_SECRET || '' },
    })
    const recap = await res.json()
    recapData = recap.telegramMessage || ''
  } catch {}

  // Get CRM context
  let crmContext = ''
  if (hubSupabase) {
    try {
      const { data: leads } = await hubSupabase.from('admin_leads').select('name, status, next_followup_date')
        .not('status', 'in', '("closed","client","do_not_contact")')
        .limit(10)
      if (leads) {
        crmContext = `Active leads: ${leads.map(l => `${l.name} (${l.status}, follow-up: ${l.next_followup_date || 'none'})`).join('; ')}`
      }
    } catch {}
  }

  // Overdue tasks
  const schedData = await getScheduleData()
  const overdueContext = schedData.overdue.length > 0
    ? `Overdue tasks: ${schedData.overdue.map((t: any) => `${t.title} (since ${t.scheduled_date})`).join(', ')}`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a strategic planning assistant for Adam Saltarelli, 17-year-old solo founder of Saltarelli Web Studio (Next.js, Supabase, AI automation, Retell, Telegram bots).

Adam just completed his Sunday debrief. Synthesize his reflections into a concrete action plan for next week.

ADAM'S REFLECTIONS:
- What went well: ${answers.step1 || 'not provided'}
- What could be better: ${answers.step2 || 'not provided'}
- Top priorities: ${answers.step3 || 'not provided'}
- Goals/commitments: ${answers.step4 || 'not provided'}

THIS WEEK'S DATA:
${recapData || 'No recap data'}

NEXT WEEK'S EXISTING SCHEDULE:
${weekSchedule.join('\n')}

${overdueContext}
${crmContext}

Generate a plan with:
1. Top 3 themes/focus areas for the week (based on his priorities + data)
2. Suggested daily task assignments (Mon-Fri, 2-3 tasks per day, mapped to his schedule blocks)
3. Key metrics to track (based on what could be better)
4. One stretch goal for the week

Format for Telegram. Use emojis. No markdown bold (**). Start with "📋 Your Week Ahead" header.
Keep it actionable and concise — this is a solo dev, not a corporation.`
    }],
  })

  const plan = response.content[0].type === 'text' ? response.content[0].text : 'Could not generate plan.'

  await sendLong(chatId, plan)
  await clearDebriefData(chatId)
  await send(chatId, '\n💬 Want me to create any of these as tasks? Just tell me which ones.')
}

// ─── ACTIVE CLIENTS HELPERS ───

async function listActiveClients(): Promise<string> {
  const { data } = await supabase.from('active_clients').select('*').eq('status', 'active').order('created_at', { ascending: false })
  if (!data || data.length === 0) return '👥 No active clients. Add one with "add client [name]"'
  const lines = [`👥 Active Clients (${data.length})`, '']
  for (const c of data) {
    const biz = c.business_name ? ` (${c.business_name})` : ''
    lines.push(`• ${c.name}${biz}`)
    if (c.phone) lines.push(`  📞 ${c.phone}`)
    if (c.notes) lines.push(`  📝 ${c.notes}`)
  }
  return lines.join('\n')
}

async function addActiveClient(name: string, businessName?: string): Promise<string> {
  const { error } = await supabase.from('active_clients').insert({
    name, business_name: businessName || null,
  })
  if (error) return `❌ Failed: ${error.message}`
  const biz = businessName ? ` (${businessName})` : ''
  return `✅ Added ${name}${biz} to active clients`
}

async function removeActiveClient(name: string): Promise<string> {
  const { data } = await supabase.from('active_clients').select('id, name, business_name').ilike('name', `%${name}%`).eq('status', 'active').limit(1)
  if (!data || data.length === 0) return `🤔 No active client matching "${name}"`
  await supabase.from('active_clients').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', data[0].id)
  return `✅ Removed ${data[0].name} from active clients`
}

async function editActiveClient(name: string, updates: Record<string, string>): Promise<string> {
  const { data } = await supabase.from('active_clients').select('id, name').ilike('name', `%${name}%`).eq('status', 'active').limit(1)
  if (!data || data.length === 0) return `🤔 No active client matching "${name}"`
  await supabase.from('active_clients').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', data[0].id)
  return `✅ Updated ${data[0].name}`
}

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function tomorrowToronto(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

async function send(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

async function sendLong(chatId: number, text: string) {
  if (text.length <= 4000) { await send(chatId, text); return }
  const lines = text.split('\n')
  let chunk = ''
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 4000) {
      await send(chatId, chunk)
      chunk = line
    } else {
      chunk = chunk ? chunk + '\n' + line : line
    }
  }
  if (chunk) await send(chatId, chunk)
}

// ─── DEV QUEUE HELPERS ───

function timeSince(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

async function devQueueAdd(description: string, project?: string): Promise<string> {
  // Auto-extract project from description if not provided
  if (!project) {
    const projMap: Record<string, string> = {
      genius: 'genius-fitness', kiosk: 'genius-fitness', anthony: 'genius-fitness',
      cassar: 'cassar-electrical', brandon: 'cassar-electrical',
      aborigen: 'aborigen', german: 'aborigen', hats: 'aborigen',
      planner: 'adam-planner', hub: 'saltarelli-hub',
    }
    const lower = description.toLowerCase()
    for (const [keyword, proj] of Object.entries(projMap)) {
      if (lower.includes(keyword)) { project = proj; break }
    }
  }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('dev_queue').insert({
    id, description, project: project || null, status: 'pending', priority: 'medium',
  })
  if (error) return `❌ Failed to queue: ${error.message}`

  const proj = project ? ` (${project})` : ''
  return `🛠 Queued for dev:${proj}\n"${description}"\n\nID: ${id.slice(0, 8)}\nI'll pick it up when you open your laptop.`
}

async function devQueueStatus(): Promise<string> {
  const { data, error } = await supabase
    .from('dev_queue')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true })

  if (error) return `❌ Failed to fetch dev queue: ${error.message}`
  if (!data || data.length === 0) return '✅ Dev queue is empty — nothing pending.'

  const lines = [`🛠 Dev Queue (${data.length} items):`, '']
  for (const task of data) {
    const proj = task.project ? ` [${task.project}]` : ''
    const age = timeSince(new Date(task.created_at))
    const icon = task.status === 'in_progress' ? '🔄' : '⏳'
    lines.push(`${icon}${proj} ${task.description}`)
    lines.push(`   ${age} ago — ${task.priority}`)
  }
  return lines.join('\n')
}

// ─── PROJECT STATUS ───

const PROJECT_MAP: Record<string, { slug: string; url: string; client: string }> = {
  genius: { slug: 'genius-fitness', url: 'geniusfitnessmma.vercel.app', client: 'Anthony' },
  cassar: { slug: 'cassar-electrical', url: 'cassar-electrical-deploy.vercel.app', client: 'Brandon' },
  aborigen: { slug: 'aborigen', url: 'aborigenhats.com', client: 'German' },
  planner: { slug: 'adam-planner', url: 'adam-planner.vercel.app', client: 'You' },
  hub: { slug: 'saltarelli-hub', url: 'saltarelli-hub.vercel.app', client: 'You' },
}

async function getProjectStatus(query: string): Promise<string> {
  const lower = query.toLowerCase()
  let match: { key: string; info: typeof PROJECT_MAP[string] } | null = null

  for (const [key, info] of Object.entries(PROJECT_MAP)) {
    if (lower.includes(key) || lower.includes(info.client.toLowerCase()) || lower.includes(info.slug)) {
      match = { key, info }; break
    }
  }

  if (!match) return `🤔 Couldn't find a project matching "${query}". Try: genius, cassar, aborigen, planner, hub`

  const { info } = match

  // Get client info
  const { data: clients } = await supabase
    .from('active_clients')
    .select('*')
    .ilike('name', `%${info.client}%`)
    .eq('status', 'active')
    .limit(1)

  // Get dev queue tasks for this project
  const { data: devTasks } = await supabase
    .from('dev_queue')
    .select('*')
    .eq('project', info.slug)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true })

  const lines = [`📊 Project: ${info.slug}`, `🌐 ${info.url}`, `👤 Client: ${info.client}`, '']

  if (clients && clients[0]) {
    const c = clients[0]
    if (c.notes) lines.push(`📝 ${c.notes}`)
    if (c.phone) lines.push(`📞 ${c.phone}`)
    lines.push('')
  }

  if (devTasks && devTasks.length > 0) {
    lines.push(`🛠 ${devTasks.length} dev task(s):`)
    for (const t of devTasks) {
      const icon = t.status === 'in_progress' ? '🔄' : '⏳'
      lines.push(`  ${icon} ${t.description}`)
    }
  } else {
    lines.push('✅ No pending dev tasks')
  }

  return lines.join('\n')
}

// ─── SCOUT / RESEARCH / CONTENT IDEAS ───

async function scoutDigest(): Promise<string> {
  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const hnUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI+tool&numericFilters=created_at_i>${weekAgo}&hitsPerPage=20`

  let stories: Array<{ title: string; url: string; points: number }> = []
  try {
    const res = await fetch(hnUrl)
    const data = await res.json()
    stories = (data.hits || []).map((h: any) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points || 0,
    }))
  } catch {}

  if (stories.length === 0) return 'No AI stories found this week. Try "research [topic]" for a specific search.'

  const storyList = stories
    .sort((a, b) => b.points - a.points)
    .slice(0, 15)
    .map((s, i) => `${i + 1}. ${s.title} (${s.points} pts) — ${s.url}`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a tech scout for a solo web dev agency (Saltarelli Web Studio) that builds with Next.js, Supabase, AI automation, voice agents (Retell), and Telegram bots.

From these stories, pick the TOP 5 most relevant. For each, give:
- Name/title
- One-line summary of what it does
- Why it matters for SWS (one sentence)
- Link

Stories:
${storyList}

Format as a clean Telegram message. Start with "🔬 Weekly AI Scout" header. No markdown bold (**), use plain text.`
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Scout couldn\'t generate a digest.'
}

async function contentIdeas(topic?: string): Promise<string> {
  const topicStr = topic || 'AI tools and automation for small businesses'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a content strategist for The Tech Frontier podcast and Instagram Reels by Adam Saltarelli (17, solo founder of Saltarelli Web Studio). His audience: small business owners interested in AI, automation, and modern web tools.

Generate 10 content ideas about: ${topicStr}

For each idea, give:
- Title (catchy, short)
- Format: Podcast / Reel / Both
- Hook (first sentence to grab attention)

Format as a numbered list for Telegram. Start with "🎙 Content Ideas: ${topicStr}" header. No markdown bold (**).`
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Couldn\'t generate content ideas.'
}

async function scoutResearch(topic: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Give a brief research overview on: ${topic}

Context: This is for Adam Saltarelli, solo web dev agency owner who builds with Next.js, Supabase, Retell AI, Modal, and Telegram bots. Focus on practical relevance.

Include:
- What it is (2-3 sentences)
- Key players/tools
- Relevance to a solo dev agency
- Quick verdict: worth exploring or skip?

Format for Telegram. Keep it under 300 words. No markdown bold (**).`
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Research unavailable.'
}

// ─── WHAT NEXT PRIORITIZATION ───

async function whatShouldIWorkOn(): Promise<string> {
  const data = await getScheduleData()
  const resolved = resolveBlocks(data.blocks, data.overrides)

  // Find current block
  const now = new Date()
  const toronto = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
  const nowMin = toronto.getHours() * 60 + toronto.getMinutes()
  const currentBlock = resolved.find(b => {
    const [sh, sm] = b.time.split('-')[0].trim().split(':').map(Number)
    const [eh, em] = (b.time.split('-')[1] || '').trim().split(':').map(Number)
    const startMin = sh * 60 + (sm || 0)
    const endMin = eh * 60 + (em || 0)
    return nowMin >= startMin && nowMin < endMin
  })

  // Get dev queue
  const { data: devTasks } = await supabase
    .from('dev_queue')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true })
    .limit(5)

  const todoTasks = data.tasks.filter((t: any) => t.status !== 'done')

  const context = JSON.stringify({
    currentTime: toronto.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    currentBlock: currentBlock ? `${currentBlock.emoji} ${currentBlock.label}` : 'Free time',
    tasks: todoTasks.map((t: any) => ({ title: t.title, priority: t.priority, category: t.category })),
    overdue: data.overdue.map((t: any) => ({ title: t.title, priority: t.priority, since: t.scheduled_date })),
    devQueue: (devTasks || []).map((t: any) => ({ description: t.description, project: t.project, status: t.status })),
  }, null, 2)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are Adam's personal productivity advisor. Based on his current context, recommend the ONE most impactful thing he should work on right now. Be specific and direct.

Context:
${context}

Rules:
- If he's in a scheduled block, acknowledge it but still recommend what to focus on within that block
- Prioritize overdue tasks and high-priority items
- Dev queue items are for when he's at his laptop
- Be brief: 2-3 sentences max
- No markdown bold (**)
- Start with a relevant emoji`
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Couldn\'t determine what to work on.'
}

async function getScheduleData(date?: string) {
  const d = date || todayToronto()
  const dow = new Date(d + 'T12:00:00').getDay()

  let blocks: any[] = []
  let overrides: any[] = []
  try {
    const { data: b, error: bErr } = await supabase
      .from('schedule_blocks').select('*').eq('day_of_week', dow).order('sort_order', { ascending: true })
    if (!bErr) blocks = b || []
    const { data: o, error: oErr } = await supabase
      .from('schedule_overrides').select('*').eq('date', d)
    if (!oErr) overrides = o || []
  } catch {}

  const { data: tasks } = await supabase
    .from('planner_tasks').select('*').eq('scheduled_date', d).order('priority', { ascending: true })
  const { data: overdue } = await supabase
    .from('planner_tasks').select('*').lt('scheduled_date', d).neq('status', 'done')

  return { date: d, dow, blocks, overrides, tasks: tasks || [], overdue: overdue || [] }
}

function resolveBlocks(blocks: any[], overrides: any[]) {
  const skipped = new Set(overrides.filter(o => o.override_type === 'skip').map(o => o.block_id))
  const result: any[] = []

  for (const b of blocks) {
    if (skipped.has(b.id)) continue
    result.push({ time: `${b.start_time}-${b.end_time}`, label: b.label, emoji: b.emoji, locked: b.locked, id: b.id, skippable: b.skippable, isOverride: false })
  }
  for (const o of overrides.filter(o => o.override_type === 'adhoc')) {
    if (o.start_time && o.end_time) {
      result.push({ time: `${o.start_time}-${o.end_time}`, label: o.label || 'Ad-hoc', emoji: o.emoji || '📌', locked: o.locked, id: o.id, isOverride: true })
    }
  }
  return result.sort((a, b) => a.time.localeCompare(b.time))
}

function formatSchedule(data: any, resolved: any[], runWorkout?: { type: string; title: string; notes?: string; event?: string; distanceMiles?: number; targetPace?: string } | null) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const todoTasks = data.tasks.filter((t: any) => t.status !== 'done')
  const doneTasks = data.tasks.filter((t: any) => t.status === 'done')
  const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit' })

  const lines = [
    `📅 ${dayNames[data.dow]}, ${data.date}`,
    `🕐 ${now}`,
    '',
    '📋 Schedule:',
    ...resolved.map(b => `  ${b.locked ? '🔒' : '⬜'} ${b.time} ${b.emoji} ${b.label}`),
  ]

  if (runWorkout) {
    const eventTag = runWorkout.event === 'pc100' ? '🏔️ PC100' : runWorkout.event === 'marathon' ? '🏃 Marathon' : '🏃'
    lines.push('', `${eventTag} Today's Run: ${runWorkout.title}`)
    if (runWorkout.distanceMiles) lines.push(`  📏 ${runWorkout.distanceMiles} mi`)
    if (runWorkout.targetPace) lines.push(`  ⏱️ Target: ${runWorkout.targetPace}`)
    if (runWorkout.notes) lines.push(`  📝 ${runWorkout.notes}`)
  }

  if (todoTasks.length > 0) {
    lines.push('', `📝 Tasks (${doneTasks.length}/${data.tasks.length} done):`)
    todoTasks.forEach((t: any) => {
      const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'
      lines.push(`  ${p} ${t.title}`)
    })
  }

  if (data.overdue.length > 0) {
    lines.push('', `⚠️ Overdue (${data.overdue.length}):`)
    data.overdue.slice(0, 5).forEach((t: any) => lines.push(`  🔴 ${t.title} (since ${t.scheduled_date})`))
  }

  if (doneTasks.length > 0) {
    lines.push('', `✅ Done today: ${doneTasks.map((t: any) => t.title).join(', ')}`)
  }

  return lines.join('\n')
}

async function handleMessage(chatId: number, text: string) {
  const lower = text.toLowerCase().trim()

  // ─── SUNDAY DEBRIEF INTERCEPTION (check before all other handlers) ───
  if (lower === 'skip debrief' || lower === 'cancel debrief') {
    await clearDebriefData(chatId)
    await send(chatId, '⏭ Debrief cancelled. Have a great week!')
    return
  }

  const activeStep = await getActiveDebrief(chatId)
  if (activeStep) {
    await processDebriefReply(chatId, text, activeStep)
    return
  }

  // CRM quick commands
  if (/^(leads|pipeline|crm|my leads|crm status|leads overview)$/i.test(lower)) {
    await send(chatId, await getCrmStatus())
    return
  }
  if (/^(follow.?ups?|who needs follow.?up|followups due|follow ups)$/i.test(lower)) {
    await send(chatId, await getFollowupsDue())
    return
  }
  const leadDetailMatch = lower.match(/^(?:check on|lead|look up|find lead)\s+(.+)$/i)
  if (leadDetailMatch) {
    await send(chatId, await getLeadDetail(leadDetailMatch[1].trim()))
    return
  }
  const logContactMatch = lower.match(/^(?:log contact|contacted|spoke to|talked to|called)\s+(.+)$/i)
  if (logContactMatch) {
    await send(chatId, await logLeadContact(logContactMatch[1].trim()))
    return
  }

  // Active clients commands
  if (/^(clients|my clients|active clients|who am i working with|working with)$/i.test(lower)) {
    await send(chatId, await listActiveClients())
    return
  }
  const addClientMatch = lower.match(/^(?:add client|new client|add working with)\s+(.+)$/i)
  if (addClientMatch) {
    const parts = addClientMatch[1].split(/\s*[-–—]\s*/)
    await send(chatId, await addActiveClient(parts[0].trim(), parts[1]?.trim()))
    return
  }
  const removeClientMatch = lower.match(/^(?:remove client|drop client|done with client|finished with)\s+(.+)$/i)
  if (removeClientMatch) {
    await send(chatId, await removeActiveClient(removeClientMatch[1].trim()))
    return
  }
  const editClientMatch = lower.match(/^(?:edit client|update client)\s+(.+?)\s+(?:notes?|phone|email|business)\s+(.+)$/i)
  if (editClientMatch) {
    const field = lower.includes('note') ? 'notes' : lower.includes('phone') ? 'phone' : lower.includes('email') ? 'email' : 'business_name'
    await send(chatId, await editActiveClient(editClientMatch[1].trim(), { [field]: editClientMatch[2].trim() }))
    return
  }

  // Quick commands
  if (/^(my day|what.?s my day|what.?s my schedule|schedule|today|show schedule)$/i.test(lower)) {
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)
    await send(chatId, formatSchedule(data, resolved, getRunWorkout(data.date)))
    return
  }

  if (/^(debrief|recap|evening debrief|morning brief)$/i.test(lower)) {
    const todayData = await getScheduleData()
    const todayResolved = resolveBlocks(todayData.blocks, todayData.overrides)
    const tomorrowData = await getScheduleData(tomorrowToronto())
    const tomorrowResolved = resolveBlocks(tomorrowData.blocks, tomorrowData.overrides)
    const doneTasks = todayData.tasks.filter((t: any) => t.status === 'done')
    const todoTasks = todayData.tasks.filter((t: any) => t.status !== 'done')
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const morningRun = tomorrowResolved.find(b => /run|morning routine/i.test(b.label))
    const tomorrowRun = getRunWorkout(tomorrowData.date)

    const lines = [
      `🌙 Evening Debrief`,
      '',
      `📊 Today's Recap:`,
      `  ✅ ${doneTasks.length}/${todayData.tasks.length} tasks completed`,
      ...doneTasks.map((t: any) => `  ✅ ${t.title}`),
      ...todoTasks.map((t: any) => `  ⬜ ${t.title}`),
      '',
      `📅 Tomorrow (${dayNames[tomorrowData.dow]}, ${tomorrowData.date}):`,
      ...tomorrowResolved.map(b => `  ${b.emoji} ${b.time} ${b.label}`),
    ]

    if (tomorrowRun) {
      lines.push('', `🏃 Tomorrow's Run: ${tomorrowRun.title}`)
      if (tomorrowRun.notes) lines.push(`  📝 ${tomorrowRun.notes}`)
    } else if (morningRun) {
      lines.push('', `🏃 Morning run at ${morningRun.time.split('-')[0]} — get your gear ready!`)
    }

    if (todayData.overdue.length > 0) {
      lines.push('', `⚠️ ${todayData.overdue.length} overdue tasks still pending`)
    }

    lines.push('', '💬 Want me to update or time-block anything for tomorrow?')
    await send(chatId, lines.join('\n'))
    return
  }

  // ─── WEEKLY PLANNING ───
  if (/^(plan my week|weekly plan|build my week|plan the week)/i.test(lower)) {
    await send(chatId, '📅 Building your week... hang tight!')
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const weekLines: string[] = ['📅 Weekly Plan\n']
    let totalTasks = 0

    // Get next Monday (or today if already Monday)
    const now = new Date()
    const toronto = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
    const currentDow = toronto.getDay()
    const daysUntilMon = currentDow === 0 ? 1 : currentDow === 1 ? 0 : 8 - currentDow
    const monday = new Date(toronto)
    monday.setDate(monday.getDate() + daysUntilMon)

    for (let i = 0; i < 5; i++) {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
      const dayData = await getScheduleData(dateStr)
      const resolved = resolveBlocks(dayData.blocks, dayData.overrides)
      const tasks = dayData.tasks.filter((t: any) => t.status !== 'done')
      totalTasks += tasks.length

      weekLines.push(`${dayNames[d.getDay()]} (${dateStr}):`)
      for (const b of resolved) {
        weekLines.push(`  ${b.emoji} ${b.time} ${b.label}`)
      }
      if (tasks.length > 0) {
        weekLines.push(`  📝 ${tasks.length} tasks: ${tasks.map((t: any) => t.title).join(', ')}`)
      }
      weekLines.push('')
    }

    weekLines.push(`📊 ${totalTasks} tasks across 5 days`)

    const overdue = (await getScheduleData()).overdue
    if (overdue.length > 0) {
      weekLines.push(`⚠️ ${overdue.length} overdue tasks need scheduling`)
    }

    weekLines.push('\n💬 Want me to time-block any of these days?')
    await send(chatId, weekLines.join('\n'))
    await logAction(chatId, 'plan_week')
    return
  }

  // ─── HARD-CODED PATTERN MATCHING (no AI needed) ───

  const last = await getLastAction(chatId) || lastActionMem.get(chatId) || null

  // Follow-ups: "yes", "so it's removed?", etc.
  if (last && /^(yes|yep|yeah|ok|do it|go ahead|lock it in)$/i.test(lower)) {
    await send(chatId, '✅ Already done!')
    return
  }
  if (last && /^(is it|so it|did it|was it|removed\?|done\?|deleted\?)/i.test(lower)) {
    await send(chatId, `✅ Yep! "${last.label}" was handled. Refresh your app to see it.`)
    return
  }

  // "remove it" / "delete it" — use last action context
  if (last && /^(remove|delete|get rid of)\s+(it|that|this)$/i.test(lower)) {
    if (last.id) {
      // Try remove_override first (for adhoc blocks)
      const { error } = await supabase.from('schedule_overrides').delete().eq('id', last.id)
      if (error) {
        // Try deleting as a task
        await supabase.from('planner_tasks').delete().eq('id', last.id)
      }
      lastActionMem.set(chatId, { intent: 'remove', label: last.label || 'item', id: last.id })
      await logAction(chatId, 'remove', last.id, last.label)
      await send(chatId, `🗑 Removed ${last.label || 'it'}!`)
      return
    }
  }

  // "remove [block name]" — find by label and remove
  const removeMatch = lower.match(/^(?:remove|delete|get rid of)\s+(?:the\s+)?(.+?)(?:\s+block)?(?:\s+please)?$/i)
  if (removeMatch) {
    const target = removeMatch[1].toLowerCase()
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)

    // Find matching override block
    const match = resolved.find(b => b.isOverride && b.label.toLowerCase().includes(target))
    if (match) {
      const { error } = await supabase.from('schedule_overrides').delete().eq('id', match.id)
      if (!error) {
        lastActionMem.set(chatId, { intent: 'remove_override', label: match.label, id: match.id })
        await logAction(chatId, 'remove_override', match.id, match.label)
        await send(chatId, `🗑 Removed ${match.emoji} ${match.label}!`)
        return
      }
    }

    // Try matching a task
    const taskMatch = data.tasks.find((t: any) => t.title.toLowerCase().includes(target) && t.status !== 'done')
    if (taskMatch) {
      await supabase.from('planner_tasks').delete().eq('id', taskMatch.id)
      lastActionMem.set(chatId, { intent: 'delete_task', label: taskMatch.title, id: taskMatch.id })
      await logAction(chatId, 'delete_task', taskMatch.id, taskMatch.title)
      await send(chatId, `🗑 Removed task: ${taskMatch.title}`)
      return
    }

    // Try matching a recurring block (skip it instead)
    const recurMatch = resolved.find(b => !b.isOverride && b.label.toLowerCase().includes(target))
    if (recurMatch) {
      const id = crypto.randomUUID()
      await supabase.from('schedule_overrides').insert({
        id, date: data.date, block_id: recurMatch.id, override_type: 'skip', locked: false,
      })
      lastActionMem.set(chatId, { intent: 'skip_block', label: recurMatch.label, id })
      await logAction(chatId, 'skip_block', id, recurMatch.label)
      await send(chatId, `⏭ Skipped ${recurMatch.emoji} ${recurMatch.label} for today (it's recurring, so I hid it for today)`)
      return
    }

    await send(chatId, `🤔 Couldn't find "${removeMatch[1]}" in your schedule or tasks.`)
    return
  }

  // "skip [block name]"
  const skipMatch = lower.match(/^skip\s+(?:the\s+)?(.+?)(?:\s+today)?(?:\s+please)?$/i)
  if (skipMatch) {
    const target = skipMatch[1].toLowerCase()
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)
    const match = resolved.find(b => b.label.toLowerCase().includes(target))
    if (match) {
      if (match.isOverride) {
        await supabase.from('schedule_overrides').delete().eq('id', match.id)
        await send(chatId, `⏭ Removed ${match.emoji} ${match.label}`)
      } else {
        const id = crypto.randomUUID()
        await supabase.from('schedule_overrides').insert({
          id, date: data.date, block_id: match.id, override_type: 'skip', locked: false,
        })
        await send(chatId, `⏭ Skipped ${match.emoji} ${match.label} for today`)
      }
      return
    }
  }

  // "remind me" / "set reminder" / "remind me at X" / "remind me twice before Y"
  const remindMatch = lower.match(/remind\s+me|set\s+(?:a\s+)?reminder|alert\s+me|notify\s+me/i)
  if (remindMatch) {
    // Extract times from the message (e.g., "8:30", "8:45", "2pm", "14:00")
    const timePatterns = text.match(/\b(\d{1,2})[:\.](\d{2})\s*(am|pm)?\b/gi) || []
    const times24: string[] = []

    for (const t of timePatterns) {
      const m = t.match(/(\d{1,2})[:\.](\d{2})\s*(am|pm)?/i)
      if (m) {
        let h = parseInt(m[1])
        const min = m[2]
        const ampm = m[3]?.toLowerCase()
        if (ampm === 'pm' && h < 12) h += 12
        if (ampm === 'am' && h === 12) h = 0
        times24.push(`${h.toString().padStart(2, '0')}:${min}`)
      }
    }

    // Also match plain times like "at 2pm", "at 9"
    const plainTimes = text.match(/(?:at\s+)(\d{1,2})\s*(am|pm)/gi) || []
    for (const t of plainTimes) {
      const m = t.match(/(\d{1,2})\s*(am|pm)/i)
      if (m) {
        let h = parseInt(m[1])
        if (m[2].toLowerCase() === 'pm' && h < 12) h += 12
        if (m[2].toLowerCase() === 'am' && h === 12) h = 0
        const time = `${h.toString().padStart(2, '0')}:00`
        if (!times24.includes(time)) times24.push(time)
      }
    }

    if (times24.length === 0) {
      // No specific times found — create a single reminder 30 min before if there's a reference to a task/block
      await send(chatId, '⏰ I can set reminders! Tell me the times, like: "remind me at 8:30 and 8:45 about the food drive"')
      return
    }

    // Extract what the reminder is about (everything after "about/for/of" or the whole message context)
    let about = 'Reminder'
    const aboutMatch = text.match(/(?:about|for|of)\s+(?:the\s+)?(.+?)(?:\s+at\s+\d|$)/i)
    if (aboutMatch) {
      about = aboutMatch[1].trim()
    } else {
      // Use last action context or generic
      const lastCtx = await getLastAction(chatId)
      if (lastCtx?.label) about = lastCtx.label
    }

    const date = todayToronto()
    const created: string[] = []

    for (const time of times24.sort()) {
      // Create a 15-min reminder block
      const [h, m] = time.split(':').map(Number)
      const endMin = m + 15
      const endH = h + Math.floor(endMin / 60)
      const endTime = `${endH.toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`

      const id = crypto.randomUUID()
      await supabase.from('schedule_overrides').insert({
        id, date, block_id: null, override_type: 'adhoc',
        label: `⏰ ${about}`, emoji: '⏰', start_time: time, end_time: endTime, locked: true,
      })

      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      created.push(`${h12}:${m.toString().padStart(2, '0')} ${ampm}`)
    }

    await send(chatId, `⏰ Set ${created.length} reminder${created.length > 1 ? 's' : ''}:\n${created.map(t => `  🔔 ${t} — ${about}`).join('\n')}\n\nYou'll get a Telegram notification 30 min before each one! 🔥`)
    await logAction(chatId, 'set_reminder', undefined, about)
    return
  }

  // ─── DEV QUEUE QUICK COMMANDS ───
  if (/^(dev queue|dev status|what'?s in the (?:dev )?queue)/i.test(lower)) {
    const status = await devQueueStatus()
    await sendLong(chatId, status)
    return
  }

  const devAddMatch = lower.match(/^(?:dev:|queue(?:\s+a)?|add to (?:dev )?queue)\s+(.+)$/i)
  if (devAddMatch) {
    const result = await devQueueAdd(devAddMatch[1])
    await send(chatId, result)
    await logAction(chatId, 'dev_queue_add', undefined, devAddMatch[1])
    return
  }

  // ─── SCOUT / RESEARCH / CONTENT QUICK COMMANDS ───
  if (/^(what'?s new|scout|ai scout|weekly scout|scout digest)/i.test(lower)) {
    await send(chatId, '🔬 Scanning this week\'s AI news...')
    const digest = await scoutDigest()
    await sendLong(chatId, digest)
    return
  }

  const researchMatch = lower.match(/^(?:research|look into|look up|investigate)\s+(.+)$/i)
  if (researchMatch) {
    await send(chatId, `🔍 Researching "${researchMatch[1]}"...`)
    const result = await scoutResearch(researchMatch[1])
    await sendLong(chatId, result)
    return
  }

  const contentMatch = lower.match(/^(?:content ideas?|give me content|ideas?\s+(?:about|for))\s*(.*)$/i)
  if (contentMatch) {
    await send(chatId, '🎙 Generating content ideas...')
    const ideas = await contentIdeas(contentMatch[1] || undefined)
    await sendLong(chatId, ideas)
    return
  }

  // ─── PROJECT STATUS QUICK COMMANDS ───
  const projectMatch = lower.match(/^(?:(?:how'?s|status of?|check on|update on)\s+(?:the\s+)?(.+?)(?:'s)?\s*(?:project|site|app)?|(?:project status)\s+(.+))$/i)
  if (projectMatch) {
    const query = projectMatch[1] || projectMatch[2]
    const status = await getProjectStatus(query)
    await sendLong(chatId, status)
    return
  }

  // ─── WHAT NEXT QUICK COMMAND ───
  if (/^(what (?:should i|do i|to) (?:work on|do|focus)|what'?s next|what next|prioriti[sz]e)/i.test(lower)) {
    await send(chatId, '🤔 Analyzing your priorities...')
    const rec = await whatShouldIWorkOn()
    await sendLong(chatId, rec)
    return
  }

  // "check off [task]" / "done with [task]" / "finished [task]"
  const doneMatch = lower.match(/^(?:check off|done with|finished|completed|mark done)\s+(?:the\s+)?(.+?)(?:\s+please)?$/i)
  if (doneMatch) {
    const target = doneMatch[1].toLowerCase()
    const data = await getScheduleData()
    const match = data.tasks.find((t: any) => t.status !== 'done' && t.title.toLowerCase().includes(target))
    if (match) {
      await supabase.from('planner_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', match.id)
      lastActionMem.set(chatId, { intent: 'complete_task', label: match.title, id: match.id })
      await logAction(chatId, 'complete_task', match.id, match.title)
      await send(chatId, `✅ Checked off: ${match.title}`)
      return
    }
    await send(chatId, `🤔 Couldn't find a task matching "${doneMatch[1]}"`)
    return
  }

  // AI-powered intent parsing
  try {
    const data = await getScheduleData()
    const resolved = resolveBlocks(data.blocks, data.overrides)

    // Build context with last action for pronoun resolution
    const lastCtx = last ? `\nLast action: ${last.intent} on "${last.label}" (id: ${last.id})` : ''

    // Mark which blocks are overrides (adhoc) vs recurring
    const scheduleWithTypes = resolved.map(b => ({
      ...b,
      type: b.isOverride ? 'adhoc_override' : 'recurring',
      note: b.isOverride ? 'USE remove_override WITH THIS id TO DELETE' : 'USE skip_block WITH THIS id TO HIDE FOR ONE DAY',
    }))

    const context = JSON.stringify({
      date: data.date,
      dayOfWeek: new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      schedule: scheduleWithTypes,
      tasks: data.tasks.filter((t: any) => t.status !== 'done').map((t: any) => ({ id: t.id, title: t.title, priority: t.priority, category: t.category })),
      overdue: data.overdue.slice(0, 5).map((t: any) => ({ id: t.id, title: t.title, priority: t.priority, scheduled_date: t.scheduled_date })),
      runWorkout: getRunWorkout(data.date),
      tomorrowRunWorkout: getRunWorkout(tomorrowToronto()),
      trainingWeek: getWeekInfo(data.date),
    }, null, 2)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a schedule bot. Parse the message into ONE JSON action. NEVER ask questions. NEVER say "I need more context". Just pick the best action and do it.
${lastCtx}

Schedule:
${context}

Today: ${data.date}

RULES:
1. "it"/"that"/"this" = the last action item above. Use its ID.
2. "remove"/"delete"/"get rid of" an adhoc_override block = remove_override (use the block's id as overrideId)
3. "skip" a recurring block = skip_block (use blockId)
4. NEVER use skip_block to remove an adhoc_override. ALWAYS use remove_override for those.
5. NEVER use "chat" intent unless the message is truly just conversation with zero schedule relevance.
6. Look at the "type" and "note" fields in the schedule — they tell you exactly which intent to use.
7. For running/training questions, use "chat" intent. Include runWorkout data (type, title, notes) and trainingWeek (week, phase, mileage) in your reply. If asking about tomorrow, use tomorrowRunWorkout instead of runWorkout.

JSON response format:
{
  "intent": "add_adhoc" | "skip_block" | "remove_override" | "add_task" | "complete_task" | "move_task" | "delete_task" | "rebuild_day" | "crm_status" | "crm_lead_detail" | "crm_followups" | "crm_log_contact" | "crm_update_status" | "client_list" | "client_add" | "client_remove" | "client_edit" | "dev_queue_add" | "dev_queue_status" | "scout_digest" | "scout_content_ideas" | "scout_research" | "project_status" | "what_next" | "chat",
  "params": { ... },
  "reply": "Short confirmation with emojis. No ** markdown."
}

Params:
- add_adhoc: { "date", "label", "startTime", "endTime", "emoji" }
- skip_block: { "blockId", "date" }
- remove_override: { "overrideId" }
- add_task: { "title", "scheduledDate", "priority", "category" }
- complete_task: { "taskId" }
- move_task: { "taskId", "scheduledDate" }
- delete_task: { "taskId" }
- rebuild_day: { "date", "constraints" }
- crm_status: {} (show pipeline overview)
- crm_lead_detail: { "name" } (look up a lead)
- crm_followups: {} (show overdue follow-ups)
- crm_log_contact: { "name" } (log contact with a lead)
- crm_update_status: { "name", "status" } (change lead status)
- client_list: {} (list active clients)
- client_add: { "name", "businessName" } (add a new active client)
- client_remove: { "name" } (mark client as completed/done)
- client_edit: { "name", "field", "value" } (edit client — field: notes/phone/email/business_name)
- dev_queue_add: { "description", "project" } (queue a dev task — e.g. "queue a fix for the kiosk")
- dev_queue_status: {} (show pending dev tasks — e.g. "what's in the dev queue?")
- scout_digest: {} (weekly AI news digest — e.g. "what's new in AI?")
- scout_content_ideas: { "topic" } (content ideas — e.g. "give me content ideas about voice AI")
- scout_research: { "topic" } (research brief — e.g. "research Retell alternatives")
- project_status: { "query" } (project status — e.g. "how's Brandon's project?")
- what_next: {} (smart prioritization — e.g. "what should I work on?")

Dates: "today"=${data.date}, "tomorrow"=next day. Times: "2pm"="14:00"`,
      messages: [{ role: 'user', content: text }],
    })

    const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      await send(chatId, '🤔 Didn\'t catch that. Try "my day", "add stretching 2-3pm", or "check off [task]"')
      return
    }

    const parsed = JSON.parse(jsonMatch[0])

    switch (parsed.intent) {
      case 'add_adhoc': {
        const p = parsed.params
        const id = crypto.randomUUID()
        const { error } = await supabase.from('schedule_overrides').insert({
          id, date: p.date, block_id: null, override_type: 'adhoc',
          label: p.label, emoji: p.emoji || '📌', start_time: p.startTime, end_time: p.endTime, locked: true,
        })
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        lastActionMem.set(chatId, { intent: 'add_adhoc', label: p.label, id })
        await logAction(chatId, 'add_adhoc', id, p.label)
        await send(chatId, parsed.reply || `📌 Added ${p.emoji || '📌'} ${p.label} (${p.startTime}-${p.endTime})`)
        break
      }

      case 'remove_override': {
        const p = parsed.params
        const { error } = await supabase.from('schedule_overrides').delete().eq('id', p.overrideId)
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        lastActionMem.set(chatId, { intent: 'remove_override', label: 'removed block', id: p.overrideId })
        await logAction(chatId, 'remove_override', p.overrideId, 'removed block')
        await send(chatId, parsed.reply || '🗑 Removed!')
        break
      }

      case 'skip_block': {
        const p = parsed.params
        const id = crypto.randomUUID()
        const { error } = await supabase.from('schedule_overrides').insert({
          id, date: p.date, block_id: p.blockId, override_type: 'skip', locked: false,
        })
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        lastActionMem.set(chatId, { intent: 'skip_block', label: 'skipped block', id })
        await logAction(chatId, 'skip_block', id, 'skipped block')
        await send(chatId, parsed.reply || '⏭ Skipped!')
        break
      }

      case 'add_task': {
        const p = parsed.params
        const id = crypto.randomUUID()
        const { error } = await supabase.from('planner_tasks').insert({
          id, title: p.title, priority: p.priority || 'medium',
          category: p.category || 'personal', scheduled_date: p.scheduledDate, status: 'todo',
        })
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        lastActionMem.set(chatId, { intent: 'add_task', label: p.title, id })
        await logAction(chatId, 'add_task', id, p.title)
        await send(chatId, parsed.reply || `➕ Added: ${p.title}`)
        break
      }

      case 'complete_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').update({
          status: 'done', completed_at: new Date().toISOString(),
        }).eq('id', p.taskId)
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        lastActionMem.set(chatId, { intent: 'complete_task', label: 'completed task', id: p.taskId })
        await logAction(chatId, 'complete_task', p.taskId, 'completed task')
        await send(chatId, parsed.reply || '✅ Done!')
        break
      }

      case 'move_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').update({
          scheduled_date: p.scheduledDate,
        }).eq('id', p.taskId)
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        await send(chatId, parsed.reply || `📅 Moved to ${p.scheduledDate}`)
        break
      }

      case 'delete_task': {
        const p = parsed.params
        const { error } = await supabase.from('planner_tasks').delete().eq('id', p.taskId)
        if (error) { await send(chatId, `❌ Failed: ${error.message}`); break }
        await send(chatId, parsed.reply || '🗑 Task deleted!')
        break
      }

      case 'rebuild_day': {
        const p = parsed.params
        await send(chatId, '🔨 Building your schedule...')
        try {
          const rebuildRes = await fetch('https://adam-planner.vercel.app/api/rebuild-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-secret': process.env.CRON_SECRET || '' },
            body: JSON.stringify({ date: p.date || data.date, constraints: p.constraints }),
          })
          const proposal = await rebuildRes.json()
          if (!proposal.success || !proposal.proposal) {
            await send(chatId, '❌ Couldn\'t build schedule. Try being more specific.')
            break
          }

          // Execute adhoc blocks from proposal
          const created: string[] = []
          for (const block of proposal.proposal.adhocBlocks || []) {
            const { error } = await supabase.from('schedule_overrides').insert({
              id: crypto.randomUUID(), date: p.date || data.date, block_id: null,
              override_type: 'adhoc', label: block.label, emoji: block.emoji || '📌',
              start_time: block.startTime, end_time: block.endTime, locked: true,
            })
            if (!error) created.push(`  ${block.emoji || '📌'} ${block.startTime}-${block.endTime} ${block.label}`)
          }

          const lines = ['✅ Schedule built!', '', '📌 New blocks added:',  ...created]
          if (proposal.proposal.summary) lines.push('', `💡 ${proposal.proposal.summary}`)
          await send(chatId, lines.join('\n'))
        } catch {
          await send(chatId, '❌ Schedule rebuild failed. Try again.')
        }
        break
      }

      case 'crm_status': {
        await send(chatId, await getCrmStatus())
        break
      }
      case 'crm_lead_detail': {
        await send(chatId, await getLeadDetail(parsed.params.name))
        break
      }
      case 'crm_followups': {
        await send(chatId, await getFollowupsDue())
        break
      }
      case 'crm_log_contact': {
        await send(chatId, await logLeadContact(parsed.params.name))
        break
      }
      case 'crm_update_status': {
        await send(chatId, await updateLeadStatus(parsed.params.name, parsed.params.status))
        break
      }

      case 'client_list': {
        await send(chatId, await listActiveClients())
        break
      }
      case 'client_add': {
        await send(chatId, await addActiveClient(parsed.params.name, parsed.params.businessName))
        break
      }
      case 'client_remove': {
        await send(chatId, await removeActiveClient(parsed.params.name))
        break
      }
      case 'client_edit': {
        await send(chatId, await editActiveClient(parsed.params.name, { [parsed.params.field]: parsed.params.value }))
        break
      }

      // ─── NEW INTENTS ───

      case 'dev_queue_add': {
        const result = await devQueueAdd(parsed.params.description, parsed.params.project)
        await send(chatId, result)
        await logAction(chatId, 'dev_queue_add', undefined, parsed.params.description)
        break
      }
      case 'dev_queue_status': {
        await sendLong(chatId, await devQueueStatus())
        break
      }
      case 'scout_digest': {
        await send(chatId, '🔬 Scanning this week\'s AI news...')
        await sendLong(chatId, await scoutDigest())
        break
      }
      case 'scout_content_ideas': {
        await send(chatId, '🎙 Generating content ideas...')
        await sendLong(chatId, await contentIdeas(parsed.params.topic))
        break
      }
      case 'scout_research': {
        await send(chatId, `🔍 Researching "${parsed.params.topic}"...`)
        await sendLong(chatId, await scoutResearch(parsed.params.topic))
        break
      }
      case 'project_status': {
        await sendLong(chatId, await getProjectStatus(parsed.params.query))
        break
      }
      case 'what_next': {
        await send(chatId, '🤔 Analyzing your priorities...')
        await sendLong(chatId, await whatShouldIWorkOn())
        break
      }

      case 'chat':
      default:
        await send(chatId, parsed.reply || '📋 I manage your schedule, tasks, clients, leads, dev queue & more! Try "my day", "dev queue", "what should I work on?", or "research [topic]"')
    }
  } catch (error) {
    console.error('White Collared error:', error)
    await send(chatId, '❌ Something went wrong. Try again!')
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    const message = update.message || update.edited_message
    if (message?.text && message?.chat?.id) {
      await handleMessage(message.chat.id, message.text)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', bot: 'white-collared-sws' })
}
