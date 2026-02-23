'use client'

import { useState, useEffect, useCallback } from 'react'
import ChatAgent from '@/components/ChatAgent'
import { Task, ViewMode } from '@/lib/types'
import { getBlocksForDay, getFreeHours, DAY_NAMES, DAY_SHORT } from '@/lib/schedule'
import {
  getTasks, addTask, updateTask, getTasksForDate, getOverdueTasks,
  today, getWeekStart, getBig3, saveBig3, saveTasks, rollOverTasks,
  getAnalyticsClients, addAnalyticsClient, markAnalyticsSent, getAnalyticsDue, saveAnalyticsClients,
  AnalyticsClient
} from '@/lib/store'

// ─── Helpers ────────────────────────────────────────
function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Toronto'
  })
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

const CATEGORIES = ['business', 'client', 'school', 'personal', 'health'] as const
const CAT_COLORS: Record<string, string> = {
  business: 'bg-blue-500/20 text-blue-400',
  client: 'bg-purple-500/20 text-purple-400',
  school: 'bg-amber-500/20 text-amber-400',
  personal: 'bg-emerald-500/20 text-emerald-400',
  health: 'bg-red-500/20 text-red-400',
}
const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-emerald-500',
}

// ─── Components ─────────────────────────────────────

function NavBar({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const tabs: { key: ViewMode; label: string; emoji: string }[] = [
    { key: 'today', label: 'Today', emoji: '📅' },
    { key: 'week', label: 'Week', emoji: '📆' },
    { key: 'tasks', label: 'Tasks', emoji: '✅' },
    { key: 'log', label: 'Log', emoji: '📝' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] px-2 pt-1">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => setView(t.key)}
          className={cn(
            'flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg text-xs transition-colors',
            view === t.key ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
          )}
        >
          <span className="text-lg">{t.emoji}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

function TaskCard({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border-l-4 bg-[var(--card)]',
      PRIORITY_COLORS[task.priority],
      task.status === 'done' && 'opacity-50'
    )}>
      <button
        onClick={onToggle}
        className={cn(
          'w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all',
          task.status === 'done'
            ? 'bg-[var(--success)] border-[var(--success)]'
            : 'border-[var(--text-muted)]'
        )}
      >
        {task.status === 'done' && <span className="text-xs">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', task.status === 'done' && 'line-through')}>{task.title}</p>
        <div className="flex gap-2 mt-1">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', CAT_COLORS[task.category])}>{task.category}</span>
          {task.rolledFrom && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">rolled</span>}
          {task.deadline && <span className="text-[10px] text-[var(--text-muted)]">due {task.deadline}</span>}
        </div>
      </div>
      <button onClick={onDelete} className="text-[var(--text-muted)] text-xs hover:text-[var(--danger)] p-1">✕</button>
    </div>
  )
}

function AddTaskModal({ date, onAdd, onClose }: { date: string; onAdd: (t: Omit<Task, 'id' | 'createdAt'>) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [category, setCategory] = useState<Task['category']>('business')
  const [deadline, setDeadline] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({
      title: title.trim(),
      priority,
      category,
      status: 'todo',
      scheduledDate: date,
      deadline: deadline || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[var(--card)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-[env(safe-area-inset-bottom)]"
      >
        <h3 className="text-lg font-semibold">Add Task</h3>
        <input
          autoFocus
          placeholder="What needs to get done?"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-[var(--bg)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent)]"
        />
        <div className="flex gap-2">
          {(['high', 'medium', 'low'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-medium capitalize border transition-colors',
                priority === p
                  ? p === 'high' ? 'border-red-500 bg-red-500/20 text-red-400'
                    : p === 'medium' ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                    : 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                  : 'border-[var(--border)] text-[var(--text-muted)]'
              )}
            >{p}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs capitalize border transition-colors',
                category === c ? CAT_COLORS[c] + ' border-transparent' : 'border-[var(--border)] text-[var(--text-muted)]'
              )}
            >{c}</button>
          ))}
        </div>
        <input
          type="date"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          className="w-full bg-[var(--bg)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border)] text-[var(--text-muted)]"
          placeholder="Deadline (optional)"
        />
        <button type="submit" className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] font-medium text-sm transition-colors">
          Add Task
        </button>
      </form>
    </div>
  )
}

// ─── Views ──────────────────────────────────────────

function TodayView({ tasks, onToggle, onDelete, onAdd }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void
}) {
  const d = today()
  const dayOfWeek = new Date(d + 'T12:00:00').getDay()
  const blocks = getBlocksForDay(dayOfWeek)
  const freeHrs = getFreeHours(dayOfWeek)
  const done = tasks.filter(t => t.status === 'done').length
  const overdue = getOverdueTasks(d)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{DAY_NAMES[dayOfWeek]}</h1>
          <p className="text-sm text-[var(--text-muted)]">{formatDate(d)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[var(--accent)]">{freeHrs.toFixed(1)}h</p>
          <p className="text-xs text-[var(--text-muted)]">free today</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-[var(--card)] rounded-xl p-3">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-[var(--text-muted)]">Progress</span>
          <span>{done}/{tasks.length} tasks</span>
        </div>
        <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--success)] rounded-full transition-all"
            style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Analytics Due */}
      {(() => {
        const due = getAnalyticsDue()
        const d2 = new Date()
        const daysLeft = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate() - d2.getDate()
        if (due.length === 0 || daysLeft > 7) return null
        return (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-purple-400 mb-1">📊 Monthly Analytics Due ({due.length} clients)</h3>
            <p className="text-xs text-[var(--text-muted)]">{daysLeft} days left this month</p>
            {due.map(c => (
              <div key={c.id} className="text-sm mt-1">{c.clientName}{c.websiteUrl ? ` — ${c.websiteUrl}` : ''}</div>
            ))}
          </div>
        )
      })()}

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-red-400 mb-2">⚠️ Rolled Over ({overdue.length})</h3>
          {overdue.map(t => (
            <TaskCard key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      )}

      {/* Schedule */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2">SCHEDULE</h2>
        <div className="space-y-1">
          {blocks.map(b => (
            <div key={b.id} className={cn(
              'flex items-center gap-3 py-2 px-3 rounded-lg',
              b.locked ? 'bg-[var(--card)]' : 'bg-[var(--accent)]/5 border border-dashed border-[var(--accent)]/20'
            )}>
              <span className="text-xs text-[var(--text-muted)] w-24 flex-shrink-0">{b.start}–{b.end}</span>
              <span>{b.emoji}</span>
              <span className="text-sm flex-1">{b.label}</span>
              {b.locked && <span className="text-[10px] text-[var(--text-muted)]">🔒</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-[var(--text-muted)]">TASKS</h2>
          <button onClick={onAdd} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-3 py-1 rounded-full transition-colors">+ Add</button>
        </div>
        <div className="space-y-2">
          {tasks.filter(t => t.scheduledDate === d).length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-6">No tasks for today. Tap + to add one.</p>
          )}
          {tasks.filter(t => t.scheduledDate === d).sort((a, b) => {
            const po = { high: 0, medium: 1, low: 2 }
            return po[a.priority] - po[b.priority]
          }).map(t => (
            <TaskCard key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function WeekView({ tasks }: { tasks: Task[] }) {
  const d = today()
  const weekStart = getWeekStart(d)
  const [big3, setBig3] = useState<string[]>(['', '', ''])

  useEffect(() => {
    setBig3(getBig3(weekStart))
  }, [weekStart])

  function handleBig3Change(idx: number, val: string) {
    const next = [...big3]
    next[idx] = val
    setBig3(next)
    saveBig3(weekStart, next)
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(weekStart + 'T12:00:00')
    dt.setDate(dt.getDate() + i)
    const dateStr = dt.toISOString().split('T')[0]
    const dayTasks = tasks.filter(t => t.scheduledDate === dateStr)
    const done = dayTasks.filter(t => t.status === 'done').length
    const freeHrs = getFreeHours(dt.getDay())
    return { dateStr, dayOfWeek: dt.getDay(), dayTasks, done, freeHrs, isToday: dateStr === d }
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">This Week</h1>

      {/* Big 3 */}
      <div className="bg-[var(--card)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">🎯 BIG 3</h2>
        {big3.map((item, i) => (
          <input
            key={i}
            value={item}
            onChange={e => handleBig3Change(i, e.target.value)}
            placeholder={`Goal ${i + 1}`}
            className="w-full bg-[var(--bg)] rounded-lg px-3 py-2 text-sm mb-2 outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          />
        ))}
      </div>

      {/* Day cards */}
      <div className="space-y-2">
        {days.map(day => (
          <div key={day.dateStr} className={cn(
            'bg-[var(--card)] rounded-xl p-3 flex items-center gap-3',
            day.isToday && 'ring-1 ring-[var(--accent)]'
          )}>
            <div className="text-center w-12">
              <p className="text-xs text-[var(--text-muted)]">{DAY_SHORT[day.dayOfWeek]}</p>
              <p className="text-lg font-bold">{day.dateStr.split('-')[2]}</p>
            </div>
            <div className="flex-1">
              <div className="flex gap-2 text-xs text-[var(--text-muted)]">
                <span>{day.freeHrs.toFixed(1)}h free</span>
                <span>·</span>
                <span>{day.dayTasks.length} tasks</span>
              </div>
              {day.dayTasks.length > 0 && (
                <div className="h-1.5 bg-[var(--bg)] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[var(--success)] rounded-full"
                    style={{ width: `${day.dayTasks.length ? (day.done / day.dayTasks.length) * 100 : 0}%` }}
                  />
                </div>
              )}
            </div>
            {day.isToday && <span className="text-xs text-[var(--accent)] font-medium">TODAY</span>}
          </div>
        ))}
      </div>

      {/* Total free hours */}
      <div className="text-center text-sm text-[var(--text-muted)]">
        ~{days.reduce((s, d) => s + d.freeHrs, 0).toFixed(0)} free hours this week
      </div>
    </div>
  )
}

function TasksView({ tasks, onToggle, onDelete, onAdd }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('todo')
  const filtered = tasks.filter(t => filter === 'all' || (filter === 'todo' ? t.status !== 'done' : t.status === 'done'))
    .sort((a, b) => {
      const po = { high: 0, medium: 1, low: 2 }
      return po[a.priority] - po[b.priority]
    })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button onClick={onAdd} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-4 py-2 rounded-xl text-sm font-medium transition-colors">+ Add</button>
      </div>

      <div className="flex gap-2">
        {(['todo', 'all', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs capitalize transition-colors',
              filter === f ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--text-muted)]'
            )}
          >{f}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">
            {filter === 'todo' ? 'All caught up! 🎉' : 'No tasks yet.'}
          </p>
        )}
        {filtered.map(t => (
          <TaskCard key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
        ))}
      </div>
    </div>
  )
}

function LogView({ tasks }: { tasks: Task[] }) {
  const d = today()
  const done = tasks.filter(t => t.scheduledDate === d && t.status === 'done')
  const remaining = tasks.filter(t => t.scheduledDate === d && t.status !== 'done')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Daily Log</h1>
      <p className="text-sm text-[var(--text-muted)]">{formatDate(d)}</p>

      {/* Non-negotiables */}
      <div className="bg-[var(--card)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">🔒 NON-NEGOTIABLES</h2>
        {[
          { label: 'Morning routine', emoji: '🙏' },
          { label: 'Physical training', emoji: '💪' },
          { label: 'Outreach (min. 1)', emoji: '📞' },
        ].map(nn => (
          <label key={nn.label} className="flex items-center gap-3 py-2 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-[var(--success)]" />
            <span>{nn.emoji} {nn.label}</span>
          </label>
        ))}
      </div>

      {/* Completed */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--success)] mb-2">✅ Completed ({done.length})</h2>
        {done.map(t => (
          <div key={t.id} className="text-sm py-1 text-[var(--text-muted)] line-through">{t.title}</div>
        ))}
        {done.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nothing completed yet.</p>}
      </div>

      {/* Remaining */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--warning)] mb-2">⏳ Remaining ({remaining.length})</h2>
        {remaining.map(t => (
          <div key={t.id} className="text-sm py-1">{t.title}</div>
        ))}
        {remaining.length === 0 && <p className="text-sm text-[var(--text-muted)]">All done! 🎉</p>}
      </div>

      {/* Monthly Analytics */}
      <AnalyticsSection />

      {/* Priority list reminder */}
      <div className="bg-[var(--card)] rounded-xl p-4 text-sm">
        <h3 className="font-semibold mb-2">🔁 Don&apos;t know what&apos;s next?</h3>
        <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)]">
          <li>Follow up with any open lead</li>
          <li>Send 3 cold outreach messages</li>
          <li>Work on active client deliverable</li>
          <li>Build or improve a system</li>
          <li>Record content for lead gen</li>
          <li>Learn something for a current client</li>
        </ol>
        <p className="mt-2 text-xs italic text-[var(--accent)]">&ldquo;What would move money toward me fastest?&rdquo;</p>
      </div>
    </div>
  )
}

function AnalyticsSection() {
  const [clients, setClients] = useState<AnalyticsClient[]>([])
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    setClients(getAnalyticsClients())
  }, [])

  const refresh = () => setClients(getAnalyticsClients())

  const due = getAnalyticsDue()
  const now = new Date()
  const monthName = now.toLocaleString('en-US', { month: 'long' })

  return (
    <div className="bg-[var(--card)] rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">📊 MONTHLY ANALYTICS — {monthName.toUpperCase()}</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-[var(--accent)]">+ Client</button>
      </div>

      {showAdd && (
        <div className="space-y-2 mb-3">
          <input
            placeholder="Client name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-[var(--bg)] rounded-lg px-3 py-2 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          />
          <input
            placeholder="Website URL (optional)"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            className="w-full bg-[var(--bg)] rounded-lg px-3 py-2 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          />
          <button
            onClick={() => {
              if (newName.trim()) {
                addAnalyticsClient(newName.trim(), newUrl.trim() || undefined)
                setNewName('')
                setNewUrl('')
                setShowAdd(false)
                refresh()
              }
            }}
            className="w-full py-2 rounded-lg bg-[var(--accent)] text-sm font-medium"
          >Add Client</button>
        </div>
      )}

      {clients.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No clients added. Tap + to add one.</p>
      )}

      {clients.map(c => {
        const isDue = due.some(d => d.id === c.id)
        return (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
            <button
              onClick={() => { markAnalyticsSent(c.id); refresh() }}
              className={cn(
                'w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all',
                !isDue ? 'bg-[var(--success)] border-[var(--success)]' : 'border-[var(--text-muted)]'
              )}
            >
              {!isDue && <span className="text-xs">✓</span>}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{c.clientName}</p>
              {c.websiteUrl && <p className="text-xs text-[var(--text-muted)]">{c.websiteUrl}</p>}
            </div>
            <span className={cn('text-xs px-2 py-0.5 rounded-full', isDue ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400')}>
              {isDue ? 'due' : 'sent'}
            </span>
            <button
              onClick={() => {
                const updated = clients.filter(x => x.id !== c.id)
                saveAnalyticsClients(updated)
                refresh()
              }}
              className="text-[var(--text-muted)] text-xs hover:text-[var(--danger)] p-1"
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main App ───────────────────────────────────────

export default function Home() {
  const [view, setView] = useState<ViewMode>('today')
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    setTasks(getTasks())
  }, [])

  const refresh = useCallback(() => setTasks(getTasks()), [])

  function handleToggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    updateTask(id, {
      status: task.status === 'done' ? 'todo' : 'done',
      completedAt: task.status === 'done' ? undefined : new Date().toISOString(),
    })
    refresh()
  }

  function handleDelete(id: string) {
    const updated = tasks.filter(t => t.id !== id)
    saveTasks(updated)
    refresh()
  }

  function handleAdd(task: Omit<Task, 'id' | 'createdAt'>) {
    addTask(task)
    refresh()
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto scroll-container">
      {view === 'today' && <TodayView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} />}
      {view === 'week' && <WeekView tasks={tasks} />}
      {view === 'tasks' && <TasksView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} />}
      {view === 'log' && <LogView tasks={tasks} />}

      <NavBar view={view} setView={setView} />
      <ChatAgent onScheduleChange={refresh} />

      {showAdd && <AddTaskModal date={today()} onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
    </main>
  )
}
