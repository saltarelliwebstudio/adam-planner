import { supabase } from './supabase'
import { today } from './store'

// ── Types ──

export interface TimeEntry {
  id: string
  task: string
  category: string
  startedAt: string // ISO
  stoppedAt: string | null
  durationMinutes: number | null
  createdAt: string
}

export interface TimerState {
  category: string
  startedAt: string // ISO
  task: string
}

// ── Categories ──

export interface TimeCategory {
  key: string
  label: string
  emoji: string
  color: string // HSL
  group: string
}

export interface CategoryGroup {
  key: string
  label: string
  emoji: string
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { key: 'work',     label: 'Work',                emoji: '💼' },
  { key: 'health',   label: 'Health & Body',        emoji: '🧘' },
  { key: 'home',     label: 'Home & Pets',          emoji: '🏠' },
  { key: 'growth',   label: 'Growth & Social',      emoji: '📚' },
  { key: 'downtime', label: 'Downtime & Transport',  emoji: '🚗' },
]

export const TIME_CATEGORIES: TimeCategory[] = [
  // ── Work (blue hues 190–250) ──
  { key: 'cold-outreach', label: 'Cold Outreach',      emoji: '📞', color: 'hsl(210, 80%, 55%)', group: 'work' },
  { key: 'follow-ups',    label: 'Follow-Ups',         emoji: '🔄', color: 'hsl(190, 70%, 50%)', group: 'work' },
  { key: 'client-work',   label: 'Client Work',        emoji: '💻', color: 'hsl(270, 65%, 55%)', group: 'work' },
  { key: 'proposals',     label: 'Proposal / Quoting', emoji: '📝', color: 'hsl(330, 65%, 55%)', group: 'work' },
  { key: 'admin',         label: 'Admin & Invoicing',  emoji: '🧾', color: 'hsl(30, 70%, 50%)',  group: 'work' },
  { key: 'deep-work',     label: 'Deep Work / Building', emoji: '🔨', color: 'hsl(250, 70%, 60%)', group: 'work' },

  // ── Health & Body (red/warm hues 0–20) ──
  { key: 'gym',           label: 'Gym / Training',        emoji: '💪', color: 'hsl(0, 70%, 55%)',   group: 'health' },
  { key: 'bathroom',      label: 'Bathroom',              emoji: '🚽', color: 'hsl(35, 55%, 50%)',  group: 'health' },
  { key: 'grooming',      label: 'Showering / Grooming',  emoji: '🚿', color: 'hsl(185, 55%, 50%)', group: 'health' },
  { key: 'cooking',       label: 'Cooking / Meal Prep',   emoji: '🍳', color: 'hsl(15, 75%, 50%)',  group: 'health' },
  { key: 'eating',        label: 'Eating',                emoji: '🍽️', color: 'hsl(25, 65%, 55%)',  group: 'health' },
  { key: 'naps',          label: 'Naps',                  emoji: '💤', color: 'hsl(260, 40%, 55%)', group: 'health' },
  { key: 'stretching',    label: 'Stretching / Mobility', emoji: '🤸', color: 'hsl(10, 60%, 55%)',  group: 'health' },

  // ── Home & Pets (green hues 90–160) ──
  { key: 'dog-walking',   label: 'Walking the Dog',    emoji: '🐕', color: 'hsl(90, 55%, 45%)',  group: 'home' },
  { key: 'pet-care',      label: 'Pet Care',            emoji: '🐾', color: 'hsl(105, 50%, 45%)', group: 'home' },
  { key: 'cleaning',      label: 'Cleaning',            emoji: '🧹', color: 'hsl(120, 45%, 45%)', group: 'home' },
  { key: 'laundry',       label: 'Laundry',             emoji: '👕', color: 'hsl(135, 45%, 45%)', group: 'home' },
  { key: 'yard-work',     label: 'Yard Work',           emoji: '🌿', color: 'hsl(150, 50%, 40%)', group: 'home' },
  { key: 'home-maintenance', label: 'Home Maintenance', emoji: '🔧', color: 'hsl(160, 40%, 45%)', group: 'home' },

  // ── Growth & Social (yellow/gold hues 40–70) ──
  { key: 'learning',      label: 'Learning / Research', emoji: '📚', color: 'hsl(45, 80%, 50%)',  group: 'growth' },
  { key: 'school',        label: 'School / Homework',   emoji: '🎓', color: 'hsl(60, 70%, 45%)',  group: 'growth' },
  { key: 'socializing',   label: 'Socializing',         emoji: '🍻', color: 'hsl(150, 60%, 45%)', group: 'growth' },
  { key: 'meetings',      label: 'Meetings / Calls',    emoji: '📱', color: 'hsl(350, 65%, 50%)', group: 'growth' },

  // ── Downtime & Transport (cool/muted hues 220–280) ──
  { key: 'errands',       label: 'Personal Errands',      emoji: '🏃', color: 'hsl(170, 50%, 45%)', group: 'downtime' },
  { key: 'sleep',         label: 'Sleep / Rest',          emoji: '😴', color: 'hsl(230, 30%, 45%)', group: 'downtime' },
  { key: 'commuting',     label: 'Commuting / Driving',   emoji: '🚗', color: 'hsl(220, 45%, 50%)', group: 'downtime' },
  { key: 'scrolling',     label: 'Scrolling / Social Media', emoji: '📱', color: 'hsl(280, 50%, 55%)', group: 'downtime' },
  { key: 'tv',            label: 'TV / Entertainment',    emoji: '📺', color: 'hsl(240, 40%, 50%)', group: 'downtime' },
  { key: 'gaming',        label: 'Gaming',                emoji: '🎮', color: 'hsl(265, 55%, 55%)', group: 'downtime' },
  { key: 'reading-fun',   label: 'Reading for Fun',       emoji: '📖', color: 'hsl(200, 40%, 50%)', group: 'downtime' },
]

export function getCategoryByKey(key: string): TimeCategory | undefined {
  return TIME_CATEGORIES.find(c => c.key === key)
}

export function getCategoriesByGroup() {
  return CATEGORY_GROUPS.map(g => ({
    group: g,
    categories: TIME_CATEGORIES.filter(c => c.group === g.key),
  }))
}

// ── Cache ──

let entriesCache: TimeEntry[] = []
let entriesCacheLoaded = false

// ── Load from Supabase ──

export async function loadTimeEntries(): Promise<void> {
  const { data } = await supabase
    .from('time_entries')
    .select('*')
    .order('started_at', { ascending: false })
  if (data) {
    entriesCache = data.map(r => ({
      id: r.id,
      task: r.task || '',
      category: r.category,
      startedAt: r.started_at,
      stoppedAt: r.stopped_at,
      durationMinutes: r.duration_minutes,
      createdAt: r.created_at,
    }))
    entriesCacheLoaded = true

    // Sync active timer from server data so all devices agree
    if (typeof window !== 'undefined') {
      const running = data.find(r => r.stopped_at === null)
      if (running) {
        const timer: TimerState = {
          category: running.category,
          startedAt: running.started_at,
          task: running.task || '',
        }
        localStorage.setItem(TIMER_KEY, JSON.stringify(timer))
        localStorage.setItem(TIMER_ROW_ID_KEY, running.id)
      } else {
        localStorage.removeItem(TIMER_KEY)
        localStorage.removeItem(TIMER_ROW_ID_KEY)
      }
    }
  }
}

// ── CRUD ──

export function getTimeEntries(startDate?: string, endDate?: string): TimeEntry[] {
  if (!startDate && !endDate) return [...entriesCache]
  return entriesCache.filter(e => {
    const d = e.startedAt.split('T')[0]
    if (startDate && d < startDate) return false
    if (endDate && d > endDate) return false
    return true
  })
}

export function getTimeEntriesForDate(date: string): TimeEntry[] {
  return entriesCache.filter(e => {
    // Use Toronto timezone to match the rest of the app
    const entryDate = new Date(e.startedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
    return entryDate === date
  })
}

export function addTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt'>): TimeEntry {
  const newEntry: TimeEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  entriesCache.unshift(newEntry) // newest first
  supabase.from('time_entries').insert({
    id: newEntry.id,
    task: newEntry.task || null,
    category: newEntry.category,
    started_at: newEntry.startedAt,
    stopped_at: newEntry.stoppedAt,
    duration_minutes: newEntry.durationMinutes,
  }).then()
  return newEntry
}

/**
 * Create multiple completed entries in one batch insert.
 * Used for backfill parsing of narrative input like
 * "did 25 min homework, then 5 min eating, then 30 min math".
 */
export async function createEntriesBatch(
  segments: { task: string; category: string; startedAt: string; stoppedAt: string; durationMinutes: number }[]
): Promise<TimeEntry[]> {
  const createdAt = new Date().toISOString()
  const newEntries: TimeEntry[] = segments.map(s => ({
    ...s,
    id: crypto.randomUUID(),
    createdAt,
  }))
  // Prepend to local cache, newest startedAt first
  for (const e of [...newEntries].reverse()) {
    entriesCache.unshift(e)
  }
  await supabase.from('time_entries').insert(
    newEntries.map(e => ({
      id: e.id,
      task: e.task || null,
      category: e.category,
      started_at: e.startedAt,
      stopped_at: e.stoppedAt,
      duration_minutes: e.durationMinutes,
    }))
  )
  return newEntries
}

export function updateTimeEntry(id: string, updates: Partial<Pick<TimeEntry, 'task' | 'category' | 'startedAt' | 'stoppedAt' | 'durationMinutes'>>) {
  const idx = entriesCache.findIndex(e => e.id === id)
  if (idx >= 0) {
    entriesCache[idx] = { ...entriesCache[idx], ...updates }
    // If start/stop changed, recalculate duration
    if ((updates.startedAt || updates.stoppedAt) && entriesCache[idx].stoppedAt) {
      const ms = new Date(entriesCache[idx].stoppedAt!).getTime() - new Date(entriesCache[idx].startedAt).getTime()
      entriesCache[idx].durationMinutes = Math.round(ms / 60000 * 10) / 10
    }
  }

  const row: Record<string, unknown> = {}
  if (updates.task !== undefined) row.task = updates.task || null
  if (updates.category !== undefined) row.category = updates.category
  if (updates.startedAt !== undefined) row.started_at = updates.startedAt
  if (updates.stoppedAt !== undefined) row.stopped_at = updates.stoppedAt
  if (updates.durationMinutes !== undefined) row.duration_minutes = updates.durationMinutes
  // Recalc duration on server side too
  if ((updates.startedAt || updates.stoppedAt) && idx >= 0 && entriesCache[idx].stoppedAt) {
    row.duration_minutes = entriesCache[idx].durationMinutes
  }

  if (Object.keys(row).length > 0) {
    supabase.from('time_entries').update(row).eq('id', id).then()
  }
}

export function deleteTimeEntry(id: string) {
  entriesCache = entriesCache.filter(e => e.id !== id)
  supabase.from('time_entries').delete().eq('id', id).then()
}

// ── Timer (localStorage + Supabase sync) ──

const TIMER_KEY = 'adam-planner-timer'
const TIMER_ROW_ID_KEY = 'adam-planner-timer-row-id'

export function getActiveTimer(): TimerState | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(TIMER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function startTimer(category: string): TimerState {
  const timer: TimerState = {
    category,
    startedAt: new Date().toISOString(),
    task: '',
  }
  localStorage.setItem(TIMER_KEY, JSON.stringify(timer))

  // Persist to Supabase so other devices can see the running timer
  const rowId = crypto.randomUUID()
  localStorage.setItem(TIMER_ROW_ID_KEY, rowId)
  supabase.from('time_entries').insert({
    id: rowId,
    task: null,
    category,
    started_at: timer.startedAt,
    stopped_at: null,
    duration_minutes: null,
  }).then()

  // Add to local cache (running entry, no duration yet)
  entriesCache.unshift({
    id: rowId, task: '', category,
    startedAt: timer.startedAt, stoppedAt: null,
    durationMinutes: null, createdAt: new Date().toISOString(),
  })

  return timer
}

export function updateTimerTask(task: string) {
  const timer = getActiveTimer()
  if (timer) {
    timer.task = task
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer))
    // Also persist task to Supabase
    const rowId = localStorage.getItem(TIMER_ROW_ID_KEY)
    if (rowId) {
      supabase.from('time_entries').update({ task: task || null }).eq('id', rowId).then()
    }
  }
}

export function stopTimer(): TimeEntry | null {
  const timer = getActiveTimer()
  if (!timer) return null
  localStorage.removeItem(TIMER_KEY)
  const rowId = localStorage.getItem(TIMER_ROW_ID_KEY)
  localStorage.removeItem(TIMER_ROW_ID_KEY)

  const stoppedAt = new Date().toISOString()
  const durationMs = new Date(stoppedAt).getTime() - new Date(timer.startedAt).getTime()
  const durationMinutes = Math.round(durationMs / 60000 * 10) / 10 // 1 decimal

  if (rowId) {
    // Update the existing running row in Supabase
    supabase.from('time_entries').update({
      stopped_at: stoppedAt,
      duration_minutes: durationMinutes,
      task: timer.task || null,
    }).eq('id', rowId).then()

    // Update in local cache
    const idx = entriesCache.findIndex(e => e.id === rowId)
    if (idx >= 0) {
      entriesCache[idx] = {
        ...entriesCache[idx],
        stoppedAt,
        durationMinutes,
        task: timer.task,
      }
      return entriesCache[idx]
    }
  }

  // Fallback: if no row ID (e.g. started before this update), insert like before
  return addTimeEntry({
    task: timer.task,
    category: timer.category,
    startedAt: timer.startedAt,
    stoppedAt,
    durationMinutes,
  })
}

/** Sync active timer from Supabase → localStorage (call on page focus) */
export async function syncActiveTimer(): Promise<TimerState | null> {
  const { data } = await supabase
    .from('time_entries')
    .select('*')
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1)

  if (data && data.length > 0) {
    const row = data[0]
    const timer: TimerState = {
      category: row.category,
      startedAt: row.started_at,
      task: row.task || '',
    }
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer))
    localStorage.setItem(TIMER_ROW_ID_KEY, row.id)
    return timer
  } else {
    // No running timer on server — clear local state
    localStorage.removeItem(TIMER_KEY)
    localStorage.removeItem(TIMER_ROW_ID_KEY)
    return null
  }
}

// ── Formatting ──

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
