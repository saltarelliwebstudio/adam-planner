import { Task, DailyLog } from './types'
import { supabase } from './supabase'
import { getRunWorkout } from './running-plan'

// ── In-memory cache (synced with Supabase) ──
let tasksCache: Task[] = []
let tasksCacheLoaded = false
let iceboxCache: IceboxIdea[] = []
let iceboxCacheLoaded = false
let recurringCache: Set<string> = new Set()
let recurringCacheLoaded = false

// ── Init: load from Supabase ──
export async function initStore(): Promise<void> {
  await Promise.all([loadTasks(), loadIcebox(), loadRecurring()])
}

async function loadTasks(): Promise<void> {
  const { data } = await supabase
    .from('planner_tasks')
    .select('*')
    .order('created_at', { ascending: true })
  if (data) {
    tasksCache = data.map(rowToTask)
    tasksCacheLoaded = true
  }
}

async function loadIcebox(): Promise<void> {
  const { data } = await supabase
    .from('planner_icebox')
    .select('*')
    .order('created_at', { ascending: false })
  if (data) {
    iceboxCache = data.map(r => ({ id: r.id, text: r.text, createdAt: r.created_at }))
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
  return row
}

// ── Tasks ──

export function getTasks(): Task[] {
  return [...tasksCache]
}

export function saveTasks(tasks: Task[]) {
  tasksCache = tasks
  // Full sync: delete all and re-insert (used for bulk operations like delete)
  // We handle this async - fire and forget
  _syncAllTasks(tasks)
}

async function _syncAllTasks(tasks: Task[]) {
  // Delete tasks not in the new list
  const ids = new Set(tasks.map(t => t.id))
  const toDelete = tasksCache.filter(t => !ids.has(t.id))
  for (const t of toDelete) {
    await supabase.from('planner_tasks').delete().eq('id', t.id)
  }
}

export function addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  tasksCache.push(newTask)
  // Async insert
  supabase.from('planner_tasks').insert(taskToRow(newTask)).then()
  return newTask
}

export function updateTask(id: string, updates: Partial<Task>) {
  const idx = tasksCache.findIndex(t => t.id === id)
  if (idx >= 0) {
    tasksCache[idx] = { ...tasksCache[idx], ...updates }
    // Async update
    supabase.from('planner_tasks').update(taskToRow(updates)).eq('id', id).then()
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
  supabase.from('planner_icebox').insert({ id: idea.id, text }).then()
  return idea
}

export function removeFromIcebox(id: string) {
  iceboxCache = iceboxCache.filter(i => i.id !== id)
  supabase.from('planner_icebox').delete().eq('id', id).then()
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
  { title: '📞 Outreach — reach out to 1 person', category: 'business', priority: 'high' },
  { title: '📱 Post 1 piece of content', category: 'business', priority: 'high' },
  { title: '🔍 Check client apps, automations & dashboards', category: 'client', priority: 'high', dayOfWeek: 6 },
  { title: '💰 Log business expenses for the week', category: 'business', priority: 'high', dayOfWeek: 0 },
  { title: '📋 Prep for next week — review schedule & goals', category: 'business', priority: 'high', dayOfWeek: 0 },
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
      }
      addTask({
        title: runWorkout.title,
        category: categoryMap[runWorkout.type] || 'health',
        priority: runWorkout.type === 'race' ? 'high' : runWorkout.type === 'rest' ? 'low' : 'medium',
        scheduledDate: dateStr,
        status: 'todo',
        notes: runWorkout.notes,
      })
      recurringCache.add(runKey)
      supabase.from('planner_recurring_generated').insert({ key: runKey }).then()
    }
  }

  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const currentDay = d.getDate()
  if (currentDay === lastDay || currentDay >= 28) {
    for (const task of MONTHLY_TASKS) {
      const key = `${d.getFullYear()}-${d.getMonth()}:${task.title}`
      if (!recurringCache.has(key)) {
        addTask({
          title: task.title,
          category: task.category,
          priority: task.priority,
          scheduledDate: dateStr,
          status: 'todo',
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
