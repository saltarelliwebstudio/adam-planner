import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const BOT_TOKEN = process.env.WHITE_COLLARED_BOT_TOKEN || ''
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const ADAM_CHAT_ID = '6842515203'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const hubSupabase = process.env.HUB_SUPABASE_URL && process.env.HUB_SUPABASE_SERVICE_KEY
  ? createClient(process.env.HUB_SUPABASE_URL, process.env.HUB_SUPABASE_SERVICE_KEY)
  : null

const anthropic = new Anthropic()

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

async function send(text: string) {
  if (text.length <= 4000) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADAM_CHAT_ID, text }),
    })
    return
  }
  const lines = text.split('\n')
  let chunk = ''
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 4000) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADAM_CHAT_ID, text: chunk }),
      })
      chunk = line
    } else {
      chunk = chunk ? chunk + '\n' + line : line
    }
  }
  if (chunk) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADAM_CHAT_ID, text: chunk }),
    })
  }
}

async function getScheduleData(date?: string) {
  const d = date || todayToronto()
  const dow = new Date(d + 'T12:00:00').getDay()

  const { data: blocks } = await supabase
    .from('schedule_blocks').select('*').eq('day_of_week', dow).order('sort_order', { ascending: true })
  const { data: overrides } = await supabase
    .from('schedule_overrides').select('*').eq('date', d)
  const { data: tasks } = await supabase
    .from('planner_tasks').select('*').eq('scheduled_date', d).order('priority', { ascending: true })
  const { data: overdue } = await supabase
    .from('planner_tasks').select('*').eq('status', 'todo').lt('scheduled_date', d).order('scheduled_date', { ascending: true })
  const { data: timeEntries } = await supabase
    .from('time_entries').select('*').eq('date', d)

  const skipped = new Set((overrides || []).filter(o => o.override_type === 'skip').map(o => o.block_id))

  const resolvedBlocks: Array<{ emoji: string; label: string; time: string; locked: boolean }> = []
  for (const b of blocks || []) {
    if (skipped.has(b.id)) continue
    resolvedBlocks.push({ emoji: b.emoji, label: b.label, time: `${b.start_time}-${b.end_time}`, locked: b.locked })
  }
  for (const o of (overrides || []).filter(o => o.override_type === 'adhoc' && o.start_time)) {
    resolvedBlocks.push({ emoji: o.emoji || '📌', label: o.label || 'Ad-hoc', time: `${o.start_time}-${o.end_time}`, locked: true })
  }
  resolvedBlocks.sort((a, b) => a.time.localeCompare(b.time))

  return {
    date: d,
    blocks: resolvedBlocks,
    tasks: tasks || [],
    overdue: overdue || [],
    timeEntries: timeEntries || [],
  }
}

// ─── MORNING DEBRIEF ───

async function morningDebrief() {
  const data = await getScheduleData()
  const todo = data.tasks.filter((t: any) => t.status !== 'done' && t.source !== 'recurring')
  const dayName = new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })

  const lines = [
    `☀️ ${dayName}, ${data.date}`,
    '',
  ]

  // Tasks (user-created only, max 5)
  if (todo.length > 0) {
    const high = todo.filter((t: any) => t.priority === 'high')
    const rest = todo.filter((t: any) => t.priority !== 'high')
    const shown = [...high, ...rest].slice(0, 5)
    lines.push(`📋 ${todo.length} task(s):`)
    shown.forEach((t: any) => {
      const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'
      lines.push(`  ${p} ${t.title}`)
    })
    if (todo.length > 5) lines.push(`  ... +${todo.length - 5} more`)
    lines.push('')
  }

  // Overdue
  if (data.overdue.length > 0) {
    lines.push(`⚠️ ${data.overdue.length} overdue`)
    lines.push('')
  }

  // Calendar
  try {
    const calRes = await fetch(`https://adam-planner.vercel.app/api/gcal-proxy?date=${data.date}`, {
      headers: { 'x-api-secret': process.env.CRON_SECRET || '' },
    })
    const cal = await calRes.json()
    if (cal.events && cal.events.length > 0) {
      lines.push('📅 Meetings:')
      for (const e of cal.events) {
        const start = e.start?.includes('T')
          ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
          : 'All day'
        lines.push(`  • ${start} — ${e.summary}`)
      }
      lines.push('')
    }
  } catch {}

  // CRM — one-liner only if follow-ups due or replied leads
  if (hubSupabase) {
    try {
      const { data: leads } = await hubSupabase.from('admin_leads').select('status')
      const replied = leads?.filter(l => l.status === 'replied').length || 0
      const { data: followups } = await hubSupabase
        .from('admin_leads')
        .select('name')
        .not('status', 'in', '("closed","client","do_not_contact")')
        .or(`next_followup_date.lte.${data.date},next_followup_date.is.null`)
        .limit(5)
      const fCount = followups?.length || 0
      if (replied > 0 || fCount > 0) {
        const parts = []
        if (replied > 0) parts.push(`💬 ${replied} replied`)
        if (fCount > 0) parts.push(`📞 ${fCount} follow-up(s) due`)
        lines.push(parts.join(' · '))
        lines.push('')
      }
    } catch {}
  }

  await send(lines.join('\n'))
}

// ─── EVENING DEBRIEF ───

async function eveningDebrief() {
  const data = await getScheduleData()
  const done = data.tasks.filter((t: any) => t.status === 'done')
  const total = data.tasks.length
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0

  const lines = [
    `🌙 Evening wrap — ${data.date}`,
    `✅ ${done.length}/${total} tasks (${pct}%)`,
  ]

  if (data.overdue.length > 0) {
    lines.push(`⚠️ ${data.overdue.length} overdue carrying over`)
  }

  lines.push('', 'Rest up!')
  await send(lines.join('\n'))
}

// ─── DAILY RESEARCH BRIEF ───

async function fetchRSS(url: string, source: string, limit = 10): Promise<Array<{ title: string; url: string; source: string }>> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'AdamPlannerBot/1.0' } })
    const xml = await res.text()
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    const results: Array<{ title: string; url: string; source: string }> = []
    for (const item of items.slice(0, limit)) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
      const linkMatch = item.match(/<link>(.*?)<\/link>/)
      if (titleMatch && linkMatch) {
        results.push({ title: titleMatch[1], url: linkMatch[1], source })
      }
    }
    return results
  } catch { return [] }
}

async function dailyResearchBrief() {
  const today = todayToronto()
  const dayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)

  const seen = new Set<string>()
  let stories: Array<{ title: string; url: string; points: number; source: string }> = []

  function addStory(title: string, url: string, source: string, points = 0) {
    if (seen.has(url)) return
    seen.add(url)
    stories.push({ title, url, points, source })
  }

  // 1. Hacker News (multiple queries, last 24h)
  const hnQueries = ['AI+tool', 'LLM', 'automation+framework', 'developer+tooling']
  for (const q of hnQueries) {
    try {
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${q}&numericFilters=created_at_i>${dayAgo}&hitsPerPage=15`)
      const d = await res.json()
      for (const h of d.hits || []) {
        addStory(h.title, h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, 'HN', h.points || 0)
      }
    } catch {}
  }

  // 2. Product Hunt (RSS — AI category)
  const phItems = await fetchRSS('https://www.producthunt.com/feed?category=artificial-intelligence', 'PH')
  for (const item of phItems) addStory(item.title, item.url, item.source)

  // 3. TechCrunch AI (RSS)
  const tcItems = await fetchRSS('https://techcrunch.com/category/artificial-intelligence/feed/', 'TC')
  for (const item of tcItems) addStory(item.title, item.url, item.source)

  // 4. GitHub Trending (scrape daily trending)
  try {
    const ghRes = await fetch('https://github.com/trending?since=daily&spoken_language_code=en')
    const ghHtml = await ghRes.text()
    const repoMatches = ghHtml.matchAll(/<h2 class="h3 lh-condensed">[\s\S]*?<a href="(\/[^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/g)
    let ghCount = 0
    for (const m of repoMatches) {
      if (ghCount >= 8) break
      const repoPath = m[1].trim()
      const repoName = m[2].replace(/\s+/g, ' ').trim()
      addStory(repoName, `https://github.com${repoPath}`, 'GH')
      ghCount++
    }
  } catch {}

  // 5. Anthropic Blog (RSS)
  const anthItems = await fetchRSS('https://www.anthropic.com/rss.xml', 'Anthropic', 5)
  for (const item of anthItems) addStory(item.title, item.url, item.source)

  // 6. OpenAI Blog (RSS)
  const oaiItems = await fetchRSS('https://openai.com/blog/rss.xml', 'OpenAI', 5)
  for (const item of oaiItems) addStory(item.title, item.url, item.source)

  // 7. Reddit (JSON API — no auth needed)
  const subreddits = ['LocalLLaMA', 'artificial', 'webdev', 'nextjs', 'SaaS']
  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=5&t=day`, {
        headers: { 'User-Agent': 'AdamPlannerBot/1.0' },
      })
      const d = await res.json()
      for (const post of d.data?.children || []) {
        const p = post.data
        if (p.stickied) continue
        addStory(p.title, `https://reddit.com${p.permalink}`, `r/${sub}`, p.score || 0)
      }
    } catch {}
  }

  // 8. Your stack — Vercel, Supabase, Next.js, Tailwind blogs
  const stackFeeds: Array<[string, string]> = [
    ['https://vercel.com/atom', 'Vercel'],
    ['https://supabase.com/rss.xml', 'Supabase'],
    ['https://nextjs.org/rss.xml', 'Next.js'],
    ['https://tailwindcss.com/feeds/feed.xml', 'Tailwind'],
  ]
  for (const [feedUrl, src] of stackFeeds) {
    const items = await fetchRSS(feedUrl, src, 5)
    for (const item of items) addStory(item.title, item.url, item.source)
  }

  // 9. Indie Hackers (RSS)
  const ihItems = await fetchRSS('https://www.indiehackers.com/feed.xml', 'IH', 5)
  for (const item of ihItems) addStory(item.title, item.url, item.source)

  if (stories.length === 0) { await send(`📡 Daily Research Brief — ${today}\n\nNo stories found today. Check back tomorrow!`); return }

  const storyList = stories.sort((a, b) => b.points - a.points).slice(0, 20)
    .map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.points ? ` (${s.points} pts)` : ''} — ${s.url}`).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: `You are a daily research briefing bot for Adam Saltarelli — solo dev agency owner building with Next.js, Supabase, Vercel, Tailwind, Retell AI voice agents, Telegram bots, and CRM automation.

Pick the TOP 3 most relevant stories. For each:
- Title + link
- One-line summary
- "How this helps you:" — one sentence explaining specifically how Adam could use this in his stack, business, or client work

PRIORITY: Core stack updates (Vercel, Supabase, Next.js, Tailwind) > AI tools/models > automation frameworks > business/founder insights.
Skip anything without a practical takeaway.

Format as a clean Telegram message. Start with "📡 Brief — ${today}".
No markdown bold, no sections, no grouping. Just 3 numbered items. Keep it scannable.

Stories:
${storyList}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : 'Research brief unavailable.'
  await send(text)
}

// ─── SUNDAY INTERACTIVE DEBRIEF (trigger) ───

async function sundayDebrief() {
  const chatId = ADAM_CHAT_ID

  // Fetch weekly recap data
  let recapText = ''
  try {
    const res = await fetch(`https://adam-planner.vercel.app/api/recap`, {
      headers: { 'x-api-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json()
    recapText = data.telegramMessage || ''
  } catch {}

  // Clear any stale debrief state
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF|${chatId}|%`)
  await supabase.from('planner_metadata').delete().like('key', `DEBRIEF_ANS|${chatId}|%`)

  // Set state to step1
  await supabase.from('planner_metadata').insert({ key: `DEBRIEF|${chatId}|step1` })

  const message = [
    '📊 Sunday Debrief',
    '',
    recapText || '(No recap data this week)',
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    "Let's reflect on the week and plan ahead. I'll ask 4 quick questions, one at a time.",
    '',
    '💭 What went well this week? What are you most proud of?',
    '',
    '(Reply with your answer, or say "skip debrief" to cancel)',
  ].join('\n')

  await send(message)
}

// ─── SCOUT DIGEST (weekly) ───

async function weeklyScoutDigest() {
  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const hnUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI+tool&numericFilters=created_at_i>${weekAgo}&hitsPerPage=20`

  let stories: Array<{ title: string; url: string; points: number }> = []
  try {
    const res = await fetch(hnUrl)
    const d = await res.json()
    stories = (d.hits || []).map((h: any) => ({
      title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points || 0,
    }))
  } catch {}

  if (stories.length === 0) { await send('🔬 No AI stories found this week.'); return }

  const storyList = stories.sort((a, b) => b.points - a.points).slice(0, 15)
    .map((s, i) => `${i + 1}. ${s.title} (${s.points} pts) — ${s.url}`).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: `You are a tech scout for Saltarelli Web Studio (Next.js, Supabase, AI, Retell, Telegram bots). Pick TOP 5 most relevant stories. For each: name, one-line summary, why it matters, link. Format for Telegram, no markdown bold. Start with "🔬 Weekly AI Scout".\n\nStories:\n${storyList}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : 'Scout failed.'
  await send(text)
}

// ─── WEEKLY RECAP ───

async function weeklyRecap() {
  try {
    const res = await fetch(`https://adam-planner.vercel.app/api/recap`, {
      headers: { 'x-api-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json()
    await send(data.telegramMessage || 'No recap data available.')
  } catch {
    await send('❌ Could not generate weekly recap.')
  }
}

// ─── ROUTE HANDLER ───

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const cronAuth = req.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && cronAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = req.nextUrl.searchParams.get('type') || 'morning'

  try {
    switch (type) {
      case 'morning': await morningDebrief(); break
      case 'evening': await eveningDebrief(); break
      case 'research': await dailyResearchBrief(); break
      case 'scout': await weeklyScoutDigest(); break
      case 'sunday': await sundayDebrief(); break
      case 'recap': await weeklyRecap(); break
      default: return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, type })
  } catch (error) {
    console.error('Debrief error:', error)
    return NextResponse.json({ error: 'Debrief failed' }, { status: 500 })
  }
}
