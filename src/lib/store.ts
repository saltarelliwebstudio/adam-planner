import { Task, DailyLog } from './types'
import { supabase } from './supabase'
import { getRunWorkout } from './running-plan'
import { loadTimeEntries } from './time-store'
import { loadScheduleBlocks, loadOverridesForRange } from './schedule-store'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { toast } from 'sonner'

// ── In-memory cache (synced with Supabase) ──
let tasksCache: Task[] = []
let tasksCacheLoaded = false
let iceboxCache: IceboxIdea[] = []
let iceboxCacheLoaded = false
let recurringCache: Set<string> = new Set()
let recurringCacheLoaded = false

// ── Inflight write tracking (prevents realtime races wiping optimistic state) ──
const inflightTaskIds = new Set<string>()
const inflightIceboxIds = new Set<string>()

// ── Sequence guards — discard stale concurrent loadX() responses ──
let loadTasksSeq = 0
let loadIceboxSeq = 0

// ── Retry helper: one retry after 2s for transient network failures ──
// Accepts any thenable that resolves to { error } — Supabase query builders qualify.
async function withRetry<T extends { error: unknown }>(op: () => PromiseLike<T>): Promise<T> {
  const first = await op()
  if (!first.error) return first
  await new Promise(r => setTimeout(r, 2000))
  return await op()
}

// ── Pub-sub (drives UI re-renders on cache changes from any source) ──
type Subscriber = () => void
const subscribers = new Set<Subscriber>()

export function onStoreChange(cb: Subscriber): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

function notifySubscribers() {
  for (const s of subscribers) {
    try { s() } catch (e) { console.error('store subscriber error', e) }
  }
}

function rangeForToday(): { start: string; end: string } {
  const start = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  const endDate = new Date(start + 'T12:00:00')
  endDate.setDate(endDate.getDate() + 13)
  return { start, end: endDate.toISOString().split('T')[0] }
}

// ── Init: load from Supabase ──
export async function initStore(): Promise<void> {
  const { start, end } = rangeForToday()

  await Promise.all([
    loadTasks(),
    loadIcebox(),
    loadRecurring(),
    loadTimeEntries(),
    loadScheduleBlocks(),
    loadOverridesForRange(start, end),
  ])
  notifySubscribers()
}

// ── Refresh: re-pull everything (called on visibility/focus) ──
export async function refreshAll(): Promise<void> {
  const { start, end } = rangeForToday()
  await Promise.all([
    loadTasks(),
    loadIcebox(),
    loadRecurring(),
    loadTimeEntries(),
    loadScheduleBlocks(),
    loadOverridesForRange(start, end),
  ])
  notifySubscribers()
}

// ── Realtime: cross-device sync via Supabase postgres_changes ──
let realtimeChannel: RealtimeChannel | null = null

export function subscribeRealtime(): () => void {
  if (realtimeChannel) return () => {}

  realtimeChannel = supabase
    .channel('planner-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'planner_tasks' }, () => {
      loadTasks().then(notifySubscribers)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'planner_icebox' }, () => {
      loadIcebox().then(notifySubscribers)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_overrides' }, () => {
      const { start, end } = rangeForToday()
      loadOverridesForRange(start, end).then(notifySubscribers)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_blocks' }, () => {
      loadScheduleBlocks().then(notifySubscribers)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => {
      loadTimeEntries().then(notifySubscribers)
    })
    .subscribe()

  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }
}

async function loadTasks(): Promise<void> {
  const seq = ++loadTasksSeq
  const { data } = await supabase
    .from('planner_tasks')
    .select('*')
    .order('created_at', { ascending: true })
  // A newer load started while we were waiting — drop this stale response
  if (seq !== loadTasksSeq) return
  if (data) {
    // Hold any inflight row (insert OR update) until its mutation settles —
    // server data may not yet reflect the optimistic change.
    const serverRows = data.map(rowToTask).filter(t => !inflightTaskIds.has(t.id))
    const optimisticRows = tasksCache.filter(t => inflightTaskIds.has(t.id))
    tasksCache = [...serverRows, ...optimisticRows]
    tasksCacheLoaded = true
  }
}

async function loadIcebox(): Promise<void> {
  const seq = ++loadIceboxSeq
  const { data } = await supabase
    .from('planner_icebox')
    .select('*')
    .order('created_at', { ascending: false })
  if (seq !== loadIceboxSeq) return
  if (data) {
    const serverRows = data
      .filter(r => !r.text.startsWith('REM|') && !r.text.startsWith('CTX|'))
      .filter(r => !inflightIceboxIds.has(r.id))
      .map(r => ({ id: r.id, text: r.text, createdAt: r.created_at }))
    const optimisticRows = iceboxCache.filter(i => inflightIceboxIds.has(i.id))
    iceboxCache = [...serverRows, ...optimisticRows]
    iceboxCacheLoaded = true
  }
}

async function loadRecurring(): Promise<void> {
  const { data } = await supabase.from('planner_recurring_generated').select('key')
  if (data) {
    recurringCache = new Set(data.map(r => r.key))
    recurringCacheLoaded = true
  }
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    title: r.title as string,
    priority: r.priority as Task['priority'],
    status: r.status as Task['status'],
    deadline: r.deadline as string | undefined,
    scheduledDate: r.scheduled_date as string,
    scheduledTime: r.scheduled_time as string | undefined,
    category: r.category as Task['category'],
    notes: r.notes as string | undefined,
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | undefined,
    rolledFrom: r.rolled_from as string | undefined,
    source: r.source as string | undefined,
  }
}

function taskToRow(t: Partial<Task> & { id?: string }) {
  const row: Record<string, unknown> = {}
  if (t.id !== undefined) row.id = t.id
  if (t.title !== undefined) row.title = t.title
  if (t.priority !== undefined) row.priority = t.priority
  if (t.status !== undefined) row.status = t.status
  if (t.deadline !== undefined) row.deadline = t.deadline
  if (t.scheduledDate !== undefined) row.scheduled_date = t.scheduledDate
  if (t.scheduledTime !== undefined) row.scheduled_time = t.scheduledTime
  if (t.category !== undefined) row.category = t.category
  if (t.notes !== undefined) row.notes = t.notes
  if (t.completedAt !== undefined) row.completed_at = t.completedAt
  if (t.rolledFrom !== undefined) row.rolled_from = t.rolledFrom
  if (t.source !== undefined) row.source = t.source
  return row
}

// ── Tasks ──

export function getTasks(): Task[] {
  return [...tasksCache]
}

export function saveTasks(tasks: Task[]) {
  const prev = tasksCache
  tasksCache = tasks
  notifySubscribers()
  const newIds = new Set(tasks.map(t => t.id))
  const toDelete = prev.filter(t => !newIds.has(t.id))
  if (toDelete.length === 0) return
  ;(async () => {
    const failed: Task[] = []
    for (const t of toDelete) {
      const { error } = await withRetry(() =>
        supabase.from('planner_tasks').delete().eq('id', t.id)
      )
      if (error) failed.push(t)
    }
    if (failed.length > 0) {
      tasksCache = [...tasksCache, ...failed]
      toast.error(`Couldn't delete ${failed.length} task${failed.length > 1 ? 's' : ''} — check connection`)
      notifySubscribers()
    }
  })()
}

export function addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  tasksCache.push(newTask)
  inflightTaskIds.add(newTask.id)
  notifySubscribers()
  ;(async () => {
    // upsert (not insert) so the retry is idempotent if the first write
    // landed on the server but the response was lost on a flaky connection.
    const { error } = await withRetry(() =>
      supabase.from('planner_tasks').upsert(taskToRow(newTask), { onConflict: 'id' })
    )
    inflightTaskIds.delete(newTask.id)
    if (error) {
      tasksCache = tasksCache.filter(t => t.id !== newTask.id)
      toast.error('Failed to save task — check connection')
      notifySubscribers()
    }
  })()
  return newTask
}

export function updateTask(id: string, updates: Partial<Task>) {
  const idx = tasksCache.findIndex(t => t.id === id)
  if (idx >= 0) {
    const prev = tasksCache[idx]
    tasksCache[idx] = { ...prev, ...updates }
    inflightTaskIds.add(id)
    notifySubscribers()
    ;(async () => {
      const { error } = await withRetry(() =>
        supabase.from('planner_tasks').update(taskToRow(updates)).eq('id', id)
      )
      inflightTaskIds.delete(id)
      if (error) {
        const stillIdx = tasksCache.findIndex(t => t.id === id)
        if (stillIdx >= 0) tasksCache[stillIdx] = prev
        toast.error('Failed to update task — check connection')
        notifySubscribers()
      }
    })()
  }
  return tasksCache
}

export function getTasksForDate(date: string): Task[] {
  return tasksCache.filter(t => t.scheduledDate === date && t.status !== 'done')
}

export function getOverdueTasks(today: string): Task[] {
  return tasksCache.filter(t => t.scheduledDate < today && t.status !== 'done')
}

// ── Daily Logs ──

const logsCache: Map<string, DailyLog> = new Map()

export function getLogs(): DailyLog[] {
  return Array.from(logsCache.values())
}

export function getLogForDate(date: string): DailyLog | undefined {
  return logsCache.get(date)
}

export function saveLog(log: DailyLog) {
  logsCache.set(log.date, log)
  supabase.from('planner_daily_logs').upsert({
    date: log.date,
    completed: log.completed,
    rolled: log.rolled,
    notes: log.notes,
    rating: log.rating,
    outreach_done: log.outreachDone,
    morning_routine_done: log.morningRoutineDone,
    training_done: log.trainingDone,
  }).then()
}

// ── Big 3 ──

const big3Cache: Map<string, string[]> = new Map()

export function getBig3(weekStart: string): string[] {
  return big3Cache.get(weekStart) || ['', '', '']
}

export async function loadBig3(weekStart: string): Promise<string[]> {
  if (big3Cache.has(weekStart)) return big3Cache.get(weekStart)!
  const { data } = await supabase.from('planner_big3').select('items').eq('week_start', weekStart).single()
  const items = data?.items || ['', '', '']
  big3Cache.set(weekStart, items)
  return items
}

export function saveBig3(weekStart: string, items: string[]) {
  big3Cache.set(weekStart, items)
  supabase.from('planner_big3').upsert({ week_start: weekStart, items }).then()
}

// ── Roll over ──

export function rollOverTasks(fromDate: string, toDate: string) {
  let rolled = 0
  tasksCache.forEach(t => {
    if (t.scheduledDate === fromDate && t.status === 'todo') {
      t.scheduledDate = toDate
      t.rolledFrom = fromDate
      t.status = 'rolled'
      rolled++
      supabase.from('planner_tasks').update({
        scheduled_date: toDate,
        rolled_from: fromDate,
        status: 'rolled',
      }).eq('id', t.id).then()
    }
  })
  return rolled
}

// ── Analytics Clients ──

export interface AnalyticsClient {
  id: string
  clientName: string
  websiteUrl?: string
  lastSent?: string
  notes?: string
}

let analyticsCache: AnalyticsClient[] = []

export function getAnalyticsClients(): AnalyticsClient[] {
  return analyticsCache
}

export function saveAnalyticsClients(clients: AnalyticsClient[]) {
  analyticsCache = clients
}

export function addAnalyticsClient(name: string, url?: string): AnalyticsClient {
  const client: AnalyticsClient = {
    id: crypto.randomUUID(),
    clientName: name,
    websiteUrl: url,
  }
  analyticsCache.push(client)
  supabase.from('planner_analytics_clients').insert({
    id: client.id,
    client_name: name,
    website_url: url,
  }).then()
  return client
}

export function markAnalyticsSent(id: string) {
  const idx = analyticsCache.findIndex(c => c.id === id)
  if (idx >= 0) {
    const today = new Date().toISOString().split('T')[0]
    analyticsCache[idx].lastSent = today
    supabase.from('planner_analytics_clients').update({ last_sent: today }).eq('id', id).then()
  }
}

export function getAnalyticsDue(): AnalyticsClient[] {
  const now = new Date()
  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  return analyticsCache.filter(c => {
    if (!c.lastSent) return true
    return !c.lastSent.startsWith(currentMonth)
  })
}

// ── Icebox ──

export interface IceboxIdea {
  id: string
  text: string
  createdAt: string
}

export function getIcebox(): IceboxIdea[] {
  return iceboxCache
}

export function addToIcebox(text: string): IceboxIdea {
  const idea: IceboxIdea = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }
  iceboxCache.push(idea)
  inflightIceboxIds.add(idea.id)
  notifySubscribers()
  ;(async () => {
    const { error } = await withRetry(() =>
      supabase.from('planner_icebox').upsert({ id: idea.id, text }, { onConflict: 'id' })
    )
    inflightIceboxIds.delete(idea.id)
    if (error) {
      iceboxCache = iceboxCache.filter(i => i.id !== idea.id)
      toast.error('Failed to save idea — check connection')
      notifySubscribers()
    }
  })()
  return idea
}

export function removeFromIcebox(id: string) {
  const removed = iceboxCache.find(i => i.id === id)
  iceboxCache = iceboxCache.filter(i => i.id !== id)
  notifySubscribers()
  if (!removed) return
  ;(async () => {
    const { error } = await withRetry(() =>
      supabase.from('planner_icebox').delete().eq('id', id)
    )
    if (error) {
      iceboxCache = [...iceboxCache, removed]
      toast.error('Failed to remove idea — check connection')
      notifySubscribers()
    }
  })()
}

export function getRandomIceboxIdea(): IceboxIdea | null {
  if (iceboxCache.length === 0) return null
  return iceboxCache[Math.floor(Math.random() * iceboxCache.length)]
}

// ── Recurring / Auto Tasks ──

export interface RecurringTask {
  title: string
  category: 'business' | 'client' | 'school' | 'personal' | 'health'
  priority: 'high' | 'medium' | 'low'
  dayOfWeek?: number
  dayOfMonth?: number
}

const RECURRING_TASKS: RecurringTask[] = [
  { title: '🙏 Morning routine (pray, bed, cold shower, exercise, stretch, read)', category: 'health', priority: 'high' },
  { title: '🔍 Check client apps, automations & dashboards', category: 'client', priority: 'high', dayOfWeek: 6 },
  { title: '📞 Check in with cold callers — booking pace, blockers, payouts, anyone going cold', category: 'business', priority: 'high', dayOfWeek: 6 },
  { title: '💰 Log business expenses for the week', category: 'business', priority: 'high', dayOfWeek: 0 },
  { title: '📋 Prep for next week — review schedule & goals', category: 'business', priority: 'high', dayOfWeek: 0 },
  { title: '🎬 Create content', category: 'business', priority: 'high', dayOfWeek: 0 },
]

const MONTHLY_TASKS = [
  { title: '📊 Send monthly website analytics to all clients', category: 'client' as const, priority: 'high' as const },
]

export function generateRecurringTasks(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()

  for (const task of RECURRING_TASKS) {
    if (task.dayOfWeek === undefined || task.dayOfWeek === dow) {
      const key = `${dateStr}:${task.title}`
      if (!recurringCache.has(key)) {
        addTask({
          title: task.title,
          category: task.category,
          priority: task.priority,
          scheduledDate: dateStr,
          status: 'todo',
          source: 'recurring',
        })
        recurringCache.add(key)
        supabase.from('planner_recurring_generated').insert({ key }).then()
      }
    }
  }

  // ── Running plan ──
  const runWorkout = getRunWorkout(dateStr)
  if (runWorkout) {
    const runKey = `${dateStr}:run:${runWorkout.title}`
    if (!recurringCache.has(runKey)) {
      const categoryMap: Record<string, Task['category']> = {
        easy: 'health', long: 'health', tempo: 'health', intervals: 'health',
        mp: 'health', strength: 'health', ma: 'health', cross: 'health',
        rest: 'personal', race: 'health',
        back_to_back: 'health', shakeout: 'health', night_run: 'health',
        walk: 'personal', recovery_walk: 'personal',
      }
      addTask({
        title: runWorkout.title,
        category: categoryMap[runWorkout.type] || 'health',
        priority: runWorkout.type === 'race' ? 'high' : ['rest', 'walk', 'recovery_walk'].includes(runWorkout.type) ? 'low' : 'medium',
        scheduledDate: dateStr,
        status: 'todo',
        notes: runWorkout.notes,
        source: 'recurring',
      })
      recurringCache.add(runKey)
      supabase.from('planner_recurring_generated').insert({ key: runKey }).then()
    }
  }

  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const currentDay = d.getDate()
  if (currentDay === lastDay) {
    for (const task of MONTHLY_TASKS) {
      const key = `${d.getFullYear()}-${d.getMonth()}:${task.title}`
      if (!recurringCache.has(key)) {
        addTask({
          title: task.title,
          category: task.category,
          priority: task.priority,
          scheduledDate: dateStr,
          status: 'todo',
          source: 'recurring',
        })
        recurringCache.add(key)
        supabase.from('planner_recurring_generated').insert({ key }).then()
      }
    }
  }
}

// ── Generate tasks for a date range (useful for week view) ──
export function generateRecurringTasksForRange(startDate: string, endDate: string) {
  const start = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  const current = new Date(start)
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    generateRecurringTasks(dateStr)
    current.setDate(current.getDate() + 1)
  }
}

// ── Date helpers ──

export function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}
