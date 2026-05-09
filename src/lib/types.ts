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
  source?: string // 'user' | 'recurring' | 'telegram' | 'web' | 'api' | 'siri'
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

export interface ScheduleBlock {
  id: string
  label: string
  emoji: string
  dayOfWeek: number // 0=Sun, 1=Mon, ...6=Sat
  startTime: string // HH:MM
  endTime: string // HH:MM
  locked: boolean
  skippable: boolean
  category?: string
  sortOrder: number
}

export interface ScheduleOverride {
  id: string
  date: string // YYYY-MM-DD
  blockId?: string // null for adhoc
  overrideType: 'skip' | 'move' | 'adhoc'
  label?: string
  emoji?: string
  startTime?: string
  endTime?: string
  locked: boolean
}

export interface ResolvedBlock {
  id: string
  start: string // HH:MM
  end: string // HH:MM
  label: string
  emoji: string
  locked: boolean
  skippable: boolean
  isOverride: boolean
  overrideType?: 'skip' | 'move' | 'adhoc'
  blockId?: string // original schedule_block id (for skipping/moving)
}

export interface WeeklyRecap {
  id: string
  weekStart: string
  timeByCategory: Record<string, number>
  tasksCompleted: number
  tasksOverdue: number
  streaks: Record<string, number>
  highlights: string[]
}

export type ViewMode = 'today' | 'week' | 'tasks' | 'log'
