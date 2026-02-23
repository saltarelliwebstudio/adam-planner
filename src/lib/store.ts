import { Task, DailyLog } from './types'

// Local storage helpers - will migrate to Supabase
const TASKS_KEY = 'cc_tasks'
const LOGS_KEY = 'cc_logs'
const BIG3_KEY = 'cc_big3'

function getJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function setJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

// Tasks
export function getTasks(): Task[] {
  return getJson<Task[]>(TASKS_KEY, [])
}

export function saveTasks(tasks: Task[]) {
  setJson(TASKS_KEY, tasks)
}

export function addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
  const tasks = getTasks()
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  tasks.push(newTask)
  saveTasks(tasks)
  return newTask
}

export function updateTask(id: string, updates: Partial<Task>) {
  const tasks = getTasks()
  const idx = tasks.findIndex(t => t.id === id)
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...updates }
    saveTasks(tasks)
  }
  return tasks
}

export function getTasksForDate(date: string): Task[] {
  return getTasks().filter(t => t.scheduledDate === date && t.status !== 'done')
}

export function getOverdueTasks(today: string): Task[] {
  return getTasks().filter(t => t.scheduledDate < today && t.status !== 'done')
}

// Daily Logs
export function getLogs(): DailyLog[] {
  return getJson<DailyLog[]>(LOGS_KEY, [])
}

export function getLogForDate(date: string): DailyLog | undefined {
  return getLogs().find(l => l.date === date)
}

export function saveLog(log: DailyLog) {
  const logs = getLogs().filter(l => l.date !== log.date)
  logs.push(log)
  setJson(LOGS_KEY, logs)
}

// Big 3
export function getBig3(weekStart: string): string[] {
  const all = getJson<Record<string, string[]>>(BIG3_KEY, {})
  return all[weekStart] || ['', '', '']
}

export function saveBig3(weekStart: string, items: string[]) {
  const all = getJson<Record<string, string[]>>(BIG3_KEY, {})
  all[weekStart] = items
  setJson(BIG3_KEY, all)
}

// Roll over incomplete tasks
export function rollOverTasks(fromDate: string, toDate: string) {
  const tasks = getTasks()
  let rolled = 0
  tasks.forEach(t => {
    if (t.scheduledDate === fromDate && t.status === 'todo') {
      t.scheduledDate = toDate
      t.rolledFrom = fromDate
      t.status = 'rolled'
      rolled++
    }
  })
  saveTasks(tasks)
  return rolled
}

// Client Analytics
const ANALYTICS_KEY = 'cc_analytics'

export interface AnalyticsClient {
  id: string
  clientName: string
  websiteUrl?: string
  lastSent?: string
  notes?: string
}

export function getAnalyticsClients(): AnalyticsClient[] {
  return getJson<AnalyticsClient[]>(ANALYTICS_KEY, [])
}

export function saveAnalyticsClients(clients: AnalyticsClient[]) {
  setJson(ANALYTICS_KEY, clients)
}

export function addAnalyticsClient(name: string, url?: string): AnalyticsClient {
  const clients = getAnalyticsClients()
  const client: AnalyticsClient = {
    id: crypto.randomUUID(),
    clientName: name,
    websiteUrl: url,
  }
  clients.push(client)
  saveAnalyticsClients(clients)
  return client
}

export function markAnalyticsSent(id: string) {
  const clients = getAnalyticsClients()
  const idx = clients.findIndex(c => c.id === id)
  if (idx >= 0) {
    clients[idx].lastSent = new Date().toISOString().split('T')[0]
    saveAnalyticsClients(clients)
  }
}

export function getAnalyticsDue(): AnalyticsClient[] {
  const now = new Date()
  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  return getAnalyticsClients().filter(c => {
    if (!c.lastSent) return true
    return !c.lastSent.startsWith(currentMonth)
  })
}

// Date helpers
export function today(): string {
  // Adam is in America/Toronto
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}
