import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function auth(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

// Category metadata for response enrichment
const CATEGORIES: Record<string, { label: string; emoji: string }> = {
  'cold-outreach':    { label: 'Cold Outreach',         emoji: '📞' },
  'follow-ups':       { label: 'Follow-Ups',            emoji: '🔄' },
  'client-work':      { label: 'Client Work',           emoji: '💻' },
  'proposals':        { label: 'Proposal / Quoting',    emoji: '📝' },
  'admin':            { label: 'Admin & Invoicing',     emoji: '🧾' },
  'deep-work':        { label: 'Deep Work / Building',  emoji: '🔨' },
  'gym':              { label: 'Gym / Training',        emoji: '💪' },
  'bathroom':         { label: 'Bathroom',              emoji: '🚽' },
  'grooming':         { label: 'Showering / Grooming',  emoji: '🚿' },
  'cooking':          { label: 'Cooking / Meal Prep',   emoji: '🍳' },
  'eating':           { label: 'Eating',                emoji: '🍽️' },
  'naps':             { label: 'Naps',                  emoji: '💤' },
  'stretching':       { label: 'Stretching / Mobility', emoji: '🤸' },
  'dog-walking':      { label: 'Walking the Dog',       emoji: '🐕' },
  'pet-care':         { label: 'Pet Care',              emoji: '🐾' },
  'cleaning':         { label: 'Cleaning',              emoji: '🧹' },
  'laundry':          { label: 'Laundry',               emoji: '👕' },
  'yard-work':        { label: 'Yard Work',             emoji: '🌿' },
  'home-maintenance': { label: 'Home Maintenance',      emoji: '🔧' },
  'learning':         { label: 'Learning / Research',   emoji: '📚' },
  'school':           { label: 'School / Homework',     emoji: '🎓' },
  'socializing':      { label: 'Socializing',           emoji: '🍻' },
  'meetings':         { label: 'Meetings / Calls',      emoji: '📱' },
  'errands':          { label: 'Personal Errands',      emoji: '🏃' },
  'sleep':            { label: 'Sleep / Rest',          emoji: '😴' },
  'commuting':        { label: 'Commuting / Driving',   emoji: '🚗' },
  'scrolling':        { label: 'Scrolling / Social Media', emoji: '📱' },
  'tv':               { label: 'TV / Entertainment',    emoji: '📺' },
  'gaming':           { label: 'Gaming',                emoji: '🎮' },
  'reading-fun':      { label: 'Reading for Fun',       emoji: '📖' },
}

// Keyword → category key mapping (checked in order, first match wins)
// Multi-word phrases are checked before single words
const KEYWORD_MAP: [string[], string][] = [
  // Multi-word phrases first (more specific)
  [['deep work', 'focused work', 'building feature'], 'deep-work'],
  [['cold call', 'cold outreach', 'prospecting'], 'cold-outreach'],
  [['follow up', 'following up'], 'follow-ups'],
  [['client work'], 'client-work'],
  [['meal prep', 'making food'], 'cooking'],
  [['walk the dog', 'walking dog', 'walking the dog'], 'dog-walking'],
  [['getting ready'], 'grooming'],
  [['hanging out'], 'socializing'],
  [['phone call'], 'meetings'],
  [['yard work', 'outside work'], 'yard-work'],
  [['home maintenance'], 'home-maintenance'],
  [['washing clothes'], 'laundry'],

  // Single-word / short keywords
  [['sobeys', 'grocery', 'groceries', 'store', 'shopping', 'walmart', 'costco', 'errand', 'errands', 'pickup', 'dollarama', 'pharmacy'], 'errands'],
  [['gym', 'training', 'workout', 'lifting', 'weights', 'exercise', 'genius'], 'gym'],
  [['driving', 'drive', 'commute', 'commuting', 'car', 'road', 'transit', 'bus'], 'commuting'],
  [['cooking', 'cook', 'prepping'], 'cooking'],
  [['eating', 'lunch', 'dinner', 'breakfast', 'snack', 'food'], 'eating'],
  [['shower', 'showering', 'grooming', 'shaving'], 'grooming'],
  [['dog', 'pet', 'pets', 'feeding the dog'], 'dog-walking'],
  [['cleaning', 'clean', 'tidying', 'tidy', 'dishes', 'vacuuming', 'sweeping'], 'cleaning'],
  [['laundry', 'clothes'], 'laundry'],
  [['school', 'class', 'homework', 'studying', 'assignment', 'lecture'], 'school'],
  [['coding', 'dev', 'developing', 'programming', 'building'], 'client-work'],
  [['outreach', 'leads', 'prospecting'], 'cold-outreach'],
  [['meeting', 'call', 'zoom', 'teams'], 'meetings'],
  [['social', 'friends', 'drinks', 'party', 'hangout'], 'socializing'],
  [['stretch', 'stretching', 'mobility', 'yoga', 'foam roll'], 'stretching'],
  [['nap', 'napping', 'resting', 'rest'], 'naps'],
  [['tv', 'watching', 'netflix', 'show', 'movie', 'youtube', 'streaming'], 'tv'],
  [['gaming', 'game', 'playing', 'xbox', 'playstation', 'ps5'], 'gaming'],
  [['reading', 'book'], 'reading-fun'],
  [['scrolling', 'instagram', 'tiktok', 'twitter', 'reddit'], 'scrolling'],
  [['invoicing', 'invoice', 'admin', 'paperwork', 'bookkeeping', 'accounting'], 'admin'],
  [['proposal', 'quote', 'quoting', 'estimate'], 'proposals'],
  [['learning', 'research', 'tutorial', 'course'], 'learning'],
  [['yard', 'mowing', 'lawn', 'garden', 'gardening'], 'yard-work'],
  [['fixing', 'repair', 'maintenance', 'plumbing'], 'home-maintenance'],
  [['sleep', 'bed', 'sleeping'], 'sleep'],
  [['bathroom'], 'bathroom'],
]

const FILLER_WORDS = ['i', 'im', "i'm", 'am', 'at', 'the', 'doing', 'currently', 'right', 'now', 'just', 'going', 'to', 'gonna', 'about', 'some', 'a', 'an', 'my', 'for']

function matchCategory(raw: string): { key: string; matched: 'keyword' | 'default' } {
  const normalized = raw.toLowerCase().replace(/['']/g, "'").replace(/[^\w\s']/g, ' ').trim()

  // Check multi-word phrases against the full normalized string
  for (const [keywords, categoryKey] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (kw.includes(' ') && normalized.includes(kw)) {
        return { key: categoryKey, matched: 'keyword' }
      }
    }
  }

  // Strip filler words for single-word matching
  const words = normalized.split(/\s+/).filter(w => !FILLER_WORDS.includes(w))

  for (const [keywords, categoryKey] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (!kw.includes(' ') && words.some(w => w === kw || w.startsWith(kw) || kw.startsWith(w))) {
        return { key: categoryKey, matched: 'keyword' }
      }
    }
  }

  // Fallback: check if any category label appears in the input
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    const labelLower = meta.label.toLowerCase()
    if (normalized.includes(labelLower) || labelLower.includes(normalized)) {
      return { key, matched: 'keyword' }
    }
  }

  return { key: 'errands', matched: 'default' }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { text } = body as { text?: string }

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const { key: categoryKey, matched } = matchCategory(text)
  const meta = CATEGORIES[categoryKey]!
  const now = new Date().toISOString()

  // Find any active timer
  const { data: active } = await supabase
    .from('time_entries')
    .select('*')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  async function stopEntry(entry: { id: string; started_at: string }) {
    const duration = Math.round((new Date(now).getTime() - new Date(entry.started_at).getTime()) / 60000)
    await supabase
      .from('time_entries')
      .update({ stopped_at: now, duration_minutes: duration })
      .eq('id', entry.id)
    return duration
  }

  const baseResponse = {
    activity: text.trim(),
    category: categoryKey,
    categoryLabel: meta.label,
    emoji: meta.emoji,
    ...(matched === 'default' ? { matched: 'default' } : {}),
  }

  // Same category already running → stop it
  if (active && active.category === categoryKey) {
    const duration = await stopEntry(active)
    return NextResponse.json({ status: 'stopped', ...baseResponse, duration })
  }

  // Different category running → switch
  if (active) {
    const stoppedDuration = await stopEntry(active)
    const id = crypto.randomUUID()
    await supabase.from('time_entries').insert({
      id,
      task: text.trim(),
      category: categoryKey,
      started_at: now,
      created_at: now,
    })
    return NextResponse.json({
      status: 'switched',
      stopped: { activity: active.task, category: active.category, duration: stoppedDuration },
      started: baseResponse,
    })
  }

  // Nothing running → start new
  const id = crypto.randomUUID()
  await supabase.from('time_entries').insert({
    id,
    task: text.trim(),
    category: categoryKey,
    started_at: now,
    created_at: now,
  })
  return NextResponse.json({ status: 'started', ...baseResponse })
}
