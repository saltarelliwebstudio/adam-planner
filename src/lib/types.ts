export interface Task {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  status: 'todo' | 'in-progress' | 'done' | 'rolled'
  deadline?: string // ISO date or null
  scheduledDate: string // YYYY-MM-DD
  scheduledTime?: string // HH:MM - optional slot
  category: 'business' | 'client' | 'school' | 'personal' | 'health'
  notes?: string
  createdAt: string
  completedAt?: string
  rolledFrom?: string // date it was rolled from
}

export interface TimeBlock {
  id: string
  start: string // HH:MM
  end: string // HH:MM
  label: string
  emoji: string
  locked: boolean // true = non-negotiable
  dayOfWeek: number // 0=Sun, 1=Mon, ...6=Sat
}

export interface DailyLog {
  date: string // YYYY-MM-DD
  completed: string[] // task IDs
  rolled: string[] // task IDs rolled to next day
  notes: string
  rating?: 1 | 2 | 3 | 4 | 5
  outreachDone: boolean
  morningRoutineDone: boolean
  trainingDone: boolean
}

export interface NonNegotiable {
  name: string
  emoji: string
  tracker: Record<string, boolean> // date -> done
}

export interface ClientAnalytics {
  id: string
  clientName: string
  websiteUrl?: string
  lastSent?: string // ISO date of last analytics send
  notes?: string
}

export type ViewMode = 'today' | 'week' | 'tasks' | 'log'
