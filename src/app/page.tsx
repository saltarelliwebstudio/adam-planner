'use client'

import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import BrainDump from '@/components/BrainDump'
import CalisthenicsView from '@/components/CalisthenicsView'
import WeekGrid from '@/components/WeekGrid'
import WhatNext from '@/components/WhatNext'
import TimeTracker from '@/components/TimeTracker'
import NavBar, { Tab } from '@/components/NavBar'
import TimelineView from '@/components/TimelineView'
import ViewToggle, { ViewMode, getStoredViewMode } from '@/components/ViewToggle'
import AddBlockModal from '@/components/AddBlockModal'
import WeeklyRecap from '@/components/WeeklyRecap'
import LeadsView from '@/components/LeadsView'
import BrainView from '@/components/BrainView'
import { Task } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { getBlocksForDay, getFreeHours, getResolvedSchedule, DAY_NAMES } from '@/lib/schedule'
import { skipBlock } from '@/lib/schedule-store'
import {
  getTasks, addTask, updateTask, saveTasks,
  today, getOverdueTasks,
  generateRecurringTasks, generateRecurringTasksForRange,
  getIcebox, addToIcebox, removeFromIcebox, getRandomIceboxIdea, IceboxIdea,
  initStore, refreshAll, subscribeRealtime, onStoreChange,
} from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Toronto'
  })
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

// ─── Icebox Nudge ────────────────────────────────────
function IceboxNudge() {
  const [idea, setIdea] = useState<IceboxIdea | null>(null)
  useEffect(() => { setIdea(getRandomIceboxIdea()) }, [])
  if (!idea) return null
  return (
    <div className="glass-card px-4 py-3 flex items-center gap-3">
      <span className="text-lg">🧊</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-blue-400 font-semibold uppercase">From the Icebox</p>
        <p className="text-sm truncate">{idea.text}</p>
      </div>
      <button onClick={() => setIdea(getRandomIceboxIdea())} className="text-xs text-[var(--text-muted)] p-1">🔄</button>
    </div>
  )
}

// ─── Icebox View ─────────────────────────────────────
function IceboxView() {
  const [ideas, setIdeas] = useState<IceboxIdea[]>([])
  const [newIdea, setNewIdea] = useState('')

  useEffect(() => { setIdeas(getIcebox()) }, [])
  const refresh = () => setIdeas(getIcebox())

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <h1 className="text-3xl font-bold">🧊 Icebox</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Ideas on ice — not tasks yet, just things to think about</p>
      </div>
      <div className="flex gap-2">
        <input value={newIdea} onChange={e => setNewIdea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newIdea.trim()) { addToIcebox(newIdea.trim()); setNewIdea(''); refresh() }}}
          placeholder="Drop an idea..."
          className="flex-1 glass-card px-4 py-3 text-[15px] outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        <button onClick={() => { if (newIdea.trim()) { addToIcebox(newIdea.trim()); setNewIdea(''); refresh() }}}
          disabled={!newIdea.trim()}
          className="px-4 rounded-xl bg-[var(--accent)] text-white font-bold disabled:opacity-30">+</button>
      </div>
      {ideas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🧊</p>
          <p className="text-sm text-[var(--text-muted)]">No ideas on ice yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ideas.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(idea => (
            <motion.div key={idea.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card px-4 py-3 flex items-center gap-3">
              <span className="text-lg">💡</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px]">{idea.text}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {new Date(idea.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => { removeFromIcebox(idea.id); refresh() }}
                className="text-[var(--text-muted)] p-1 hover:text-[var(--danger)]">✕</button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Row ────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  business: 'text-blue-400', client: 'text-purple-400', school: 'text-amber-400',
  personal: 'text-emerald-400', health: 'text-red-400',
}
const CAT_EMOJI: Record<string, string> = {
  business: '💼', client: '🤝', school: '📚', personal: '🏠', health: '💪',
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const isDone = task.status === 'done'
  const [justCompleted, setJustCompleted] = useState(false)

  function handleToggle() {
    if (!isDone) setJustCompleted(true)
    onToggle()
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 bg-[var(--glass)] border-b border-[var(--border)] last:border-0 transition-all',
        isDone && 'opacity-50'
      )}>
      <button onClick={handleToggle} className="flex-shrink-0 p-2 -m-2 active:scale-90 transition-transform">
        <div className={cn(
          'w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center transition-all',
          justCompleted && 'task-complete-bounce',
          isDone ? 'bg-[var(--accent)] border-[var(--accent)]' :
          task.priority === 'high' ? 'border-red-400' :
          task.priority === 'medium' ? 'border-amber-400' : 'border-[var(--text-muted)]'
        )}>
          {isDone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-[15px] leading-snug', isDone && 'line-through text-[var(--text-muted)]')}>{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.scheduledTime && (
            <span className="text-[11px] text-[var(--text-muted)]">🕐 {(() => {
              const [h, m] = task.scheduledTime.split(':').map(Number)
              const ap = h >= 12 ? 'PM' : 'AM'
              return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${ap}`
            })()}</span>
          )}
          <span className={cn('text-[11px]', CAT_COLORS[task.category])}>
            {CAT_EMOJI[task.category]} {task.category}
          </span>
          {task.deadline && <span className="text-[11px] text-[var(--text-muted)]">📌 {task.deadline}</span>}
          {task.rolledFrom && <span className="text-[11px] text-orange-400">↻ rolled</span>}
        </div>
      </div>
      <button onClick={onDelete} className="text-[var(--text-muted)] p-2 -mr-2 hover:text-[var(--danger)] transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </motion.div>
  )
}

// ─── My Day (Today) ──────────────────────────────────
function MyDayView({ tasks, onToggle, onDelete, onAdd, onRefresh }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void; onRefresh: () => void
}) {
  const d = today()
  const freeHrs = getFreeHours(d)
  const todayTasks = tasks.filter(t => t.scheduledDate === d)
  const done = todayTasks.filter(t => t.status === 'done').length
  const overdue = getOverdueTasks(d)
  const blocks = getResolvedSchedule(d)

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showAddBlock, setShowAddBlock] = useState(false)

  useEffect(() => { setViewMode(getStoredViewMode()) }, [])

  const [currentMin, setCurrentMin] = useState(0)
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const torontoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
      const h = torontoTime.getHours()
      const m = torontoTime.getMinutes()
      setCurrentMin(h * 60 + m)
      setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  async function handleSkipBlock(blockId: string) {
    await skipBlock(blockId, d)
    onRefresh()
    toast('Block skipped for today', { duration: 1500, icon: '⏭' })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-3xl font-bold">My Day</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{fmtDate(d)} · {freeHrs.toFixed(1)}h free</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddBlock(true)}
            className="text-[10px] text-[var(--accent)] font-medium glass-card px-2.5 py-1.5">+ Block</button>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Progress card */}
      <div className="glass-card gradient-border p-4">
        <p className="text-sm text-[var(--text-muted)]">{greeting}, Adam</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{done}/{todayTasks.length}</span>
            <span className="text-sm text-[var(--text-muted)]">tasks done</span>
          </div>
          {todayTasks.length > 0 && (
            <div className="w-16 h-16 relative">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" strokeWidth="3"
                  strokeDasharray={`${(done / todayTasks.length) * 88} 88`}
                  strokeLinecap="round" className="progress-ring-animate" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {todayTasks.length > 0 ? Math.round((done / todayTasks.length) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wide px-1 mb-2">
            ⚠️ Overdue ({overdue.length})
          </h2>
          <div className="rounded-xl overflow-hidden glass-card">
            <AnimatePresence>
              {overdue.map(t => (
                <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Timeline or List view */}
      {viewMode === 'timeline' ? (
        <TimelineView blocks={blocks} tasks={todayTasks} onSkipBlock={handleSkipBlock} />
      ) : (
        <>
          {/* Current schedule block */}
          {(() => {
            const current = blocks.find(b => {
              const [sh, sm] = b.start.split(':').map(Number)
              const [eh, em] = b.end.split(':').map(Number)
              return currentMin >= sh * 60 + sm && currentMin < eh * 60 + em
            })
            if (!current) return null
            return (
              <div className="glass-card glow-accent px-4 py-3 flex items-center gap-3">
                <span className="text-lg">{current.emoji}</span>
                <div>
                  <p className="text-sm font-semibold">{current.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{current.start} – {current.end} {current.locked ? '🔒' : ''}</p>
                </div>
                <span className="ml-auto text-[10px] text-[var(--accent)] font-bold bg-[var(--accent)]/20 px-2 py-1 rounded-full">NOW</span>
              </div>
            )
          })()}

          {/* Today's tasks */}
          {(() => {
            const active = todayTasks.filter(t => t.status !== 'done')
            const completed = todayTasks.filter(t => t.status === 'done')
            return (
              <>
                <div>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Tasks</h2>
                    <button onClick={onAdd} className="text-xs text-[var(--accent)] font-medium">+ Add task</button>
                  </div>
                  {active.length === 0 && completed.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">☀️</p>
                      <p className="text-sm text-[var(--text-muted)]">No tasks for today</p>
                    </div>
                  ) : active.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-2xl mb-1">🎉</p>
                      <p className="text-sm text-[var(--text-muted)]">All done for today!</p>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden glass-card">
                      <AnimatePresence>
                        {active.sort((a, b) => {
                          const po = { high: 0, medium: 1, low: 2 }
                          return po[a.priority] - po[b.priority]
                        }).map(t => (
                          <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                {completed.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide px-1 mb-2">✅ Done ({completed.length})</h2>
                    <div className="rounded-xl overflow-hidden glass-card">
                      {completed.map(t => (
                        <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </>
      )}

      <WhatNext />
      <IceboxNudge />

      {/* Stale tasks alert */}
      {(() => {
        const stale = tasks.filter(t => {
          if (t.status === 'done') return false
          const created = new Date(t.createdAt)
          const days = Math.floor((Date.now() - created.getTime()) / 86400000)
          return days >= 3 && t.scheduledDate <= d
        })
        if (stale.length === 0) return null
        return (
          <div className="glass-card border-orange-500/20 p-3" style={{ borderColor: 'rgba(249,115,22,0.2)' }}>
            <h3 className="text-xs font-bold text-orange-400 mb-1">🔥 Rolling for 3+ days</h3>
            {stale.slice(0, 3).map(t => (
              <p key={t.id} className="text-sm py-0.5">{t.title}</p>
            ))}
          </div>
        )
      })()}

      {/* Full Schedule (collapsible) */}
      <details>
        <summary className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1 cursor-pointer">
          Full Schedule
        </summary>
        <div className="space-y-1 mt-2">
          {blocks.map(b => {
            const [sh, sm] = b.start.split(':').map(Number)
            const [eh, em] = b.end.split(':').map(Number)
            const isPast = currentMin >= eh * 60 + em
            const isCurrent = currentMin >= sh * 60 + sm && currentMin < eh * 60 + em
            return (
              <div key={b.id} className={cn(
                'flex items-center gap-3 py-2 px-3 rounded-lg text-sm',
                isCurrent ? 'glass-card glow-accent font-medium' : isPast ? 'opacity-40' : '',
                b.locked && !isCurrent ? 'bg-[var(--glass)]' : ''
              )}>
                <span className="text-xs text-[var(--text-muted)] w-24 flex-shrink-0">{b.start}–{b.end}</span>
                <span>{b.emoji}</span>
                <span className="flex-1">{b.label}</span>
                {b.locked && <span className="text-[10px] text-[var(--text-muted)]">🔒</span>}
                {b.isOverride && <span className="text-[10px] text-[var(--accent)]">✦</span>}
              </div>
            )
          })}
        </div>
      </details>

      {showAddBlock && <AddBlockModal onDone={onRefresh} onClose={() => setShowAddBlock(false)} />}
    </div>
  )
}

// ─── All Tasks ───────────────────────────────────────
function AllTasksView({ tasks, onToggle, onDelete, onAdd }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void
}) {
  const [showDone, setShowDone] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const d = today()
  const source = showAll ? tasks : tasks.filter(t => t.scheduledDate === d)
  const active = source.filter(t => t.status !== 'done')
  const done = source.filter(t => t.status === 'done')
  const categories = ['business', 'client', 'school', 'personal', 'health'] as const
  const grouped = categories.map(cat => ({
    cat,
    tasks: active.filter(t => t.category === cat).sort((a, b) => {
      const po = { high: 0, medium: 1, low: 2 }
      return po[a.priority] - po[b.priority]
    }),
  })).filter(g => g.tasks.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{showAll ? 'All tasks' : fmtDate(d)}</p>
        </div>
        <button onClick={onAdd} className="bg-[var(--accent)] px-4 py-2 rounded-xl text-sm font-medium active:scale-95">+ Add</button>
      </div>
      {grouped.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm text-[var(--text-muted)]">{showAll ? 'No active tasks' : 'No tasks for today'}</p>
        </div>
      ) : (
        grouped.map(g => (
          <div key={g.cat}>
            <h2 className="text-xs font-semibold uppercase tracking-wide px-1 mb-2 flex items-center gap-1.5">
              <span>{CAT_EMOJI[g.cat]}</span>
              <span className={CAT_COLORS[g.cat]}>{g.cat.charAt(0).toUpperCase() + g.cat.slice(1)}</span>
              <span className="text-[var(--text-muted)]">({g.tasks.length})</span>
            </h2>
            <div className="rounded-xl overflow-hidden glass-card">
              <AnimatePresence>
                {g.tasks.map(t => (
                  <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(!showDone)}
            className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1 flex items-center gap-1">
            <span className="text-[10px]">{showDone ? '▼' : '▶'}</span>
            Completed ({done.length})
          </button>
          {showDone && (
            <div className="rounded-xl overflow-hidden glass-card mt-2">
              {done.slice(0, 20).map(t => (
                <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-center">
        <button onClick={() => setShowAll(!showAll)} className="text-xs text-[var(--accent)] font-medium py-2">
          {showAll ? '← Show only today' : 'Show all dates →'}
        </button>
      </div>
    </div>
  )
}

// ─── Log View ────────────────────────────────────────
function LogView({ tasks }: { tasks: Task[] }) {
  const d = today()
  const todayDone = tasks.filter(t => t.scheduledDate === d && t.status === 'done')
  const todayLeft = tasks.filter(t => t.scheduledDate === d && t.status !== 'done')
  const [nnChecked, setNnChecked] = useState<Record<string, boolean>>({})

  const NON_NEGOTIABLES = [
    { label: 'Morning routine', emoji: '🙏', key: 'morning_routine_done' },
    { label: 'Outreach (min. 1)', emoji: '📞', key: 'outreach_done' },
    { label: '10 mins of reading a day', emoji: '📚', key: 'reading_done' },
    { label: 'Stretching at night', emoji: '🤸', key: 'stretching_done' },
  ]

  useEffect(() => {
    supabase.from('planner_daily_logs').select('*').eq('date', d).single().then(({ data }) => {
      if (data) {
        const checked: Record<string, boolean> = {}
        if (data.morning_routine_done) checked['Morning routine'] = true
        if (data.outreach_done) checked['Outreach (min. 1)'] = true
        if (data.training_done) checked['10 mins of reading a day'] = true
        const extras = (data.completed as Record<string, boolean>) || {}
        if (extras['reading_done']) checked['10 mins of reading a day'] = true
        if (extras['stretching_done']) checked['Stretching at night'] = true
        setNnChecked(checked)
      }
    })
  }, [d])

  function toggleNN(label: string) {
    const newVal = !nnChecked[label]
    const next = { ...nnChecked, [label]: newVal }
    setNnChecked(next)
    supabase.from('planner_daily_logs').upsert({
      date: d,
      morning_routine_done: !!next['Morning routine'],
      outreach_done: !!next['Outreach (min. 1)'],
      training_done: !!next['10 mins of reading a day'],
      completed: {
        reading_done: !!next['10 mins of reading a day'],
        stretching_done: !!next['Stretching at night'],
      },
    }).then()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold pt-2">Daily Log</h1>
      <p className="text-sm text-[var(--text-muted)]">{fmtDate(d)}</p>

      <div className="glass-card gradient-border p-4">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">🔒 Non-Negotiables</h2>
        {NON_NEGOTIABLES.map(nn => (
          <label key={nn.label} className="flex items-center gap-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform">
            <input type="checkbox" checked={!!nnChecked[nn.label]} onChange={() => toggleNN(nn.label)} className="w-6 h-6 accent-[var(--accent)] rounded" />
            <span className="text-[15px]">{nn.emoji} {nn.label}</span>
          </label>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide px-1 mb-2">✅ Done ({todayDone.length})</h2>
        {todayDone.length > 0 ? (
          <div className="rounded-xl overflow-hidden glass-card">
            {todayDone.map(t => <div key={t.id} className="px-4 py-2 border-b border-[var(--border)] text-sm text-[var(--text-muted)] line-through">{t.title}</div>)}
          </div>
        ) : <p className="text-sm text-[var(--text-muted)] px-1">Nothing yet — get after it 💪</p>}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wide px-1 mb-2">⏳ Remaining ({todayLeft.length})</h2>
        {todayLeft.length > 0 ? (
          <div className="rounded-xl overflow-hidden glass-card">
            {todayLeft.map(t => <div key={t.id} className="px-4 py-2 border-b border-[var(--border)] text-sm">{t.title}</div>)}
          </div>
        ) : <p className="text-sm text-[var(--text-muted)] px-1">All clear! 🎉</p>}
      </div>

      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold mb-2">🔁 Don&apos;t know what to do next?</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--text-muted)]">
          <li>Follow up open leads</li>
          <li>Send 3 cold outreach messages</li>
          <li>Work on active client deliverable</li>
          <li>Build/improve a system</li>
          <li>Record content for lead gen</li>
          <li>Learn something for a client</li>
        </ol>
      </div>
    </div>
  )
}

// ─── Add Task Modal ──────────────────────────────────
function AddTaskModal({ onAdd, onClose }: { onAdd: (t: Omit<Task, 'id' | 'createdAt'>) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [category, setCategory] = useState<Task['category']>('business')
  const [date, setDate] = useState(today())

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="w-full max-w-md glass-card p-5 space-y-4 pb-[max(env(safe-area-inset-bottom),20px)] rounded-b-none"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">New Task</h3>
        <input autoFocus placeholder="What needs to get done?" value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onAdd({ title: title.trim(), priority, category, scheduledDate: date, status: 'todo' }); onClose() }}}
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] outline-none border border-[var(--border)] focus:border-[var(--accent)]" />
        <div className="flex gap-2">
          {(['high', 'medium', 'low'] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className={cn('flex-1 py-2 rounded-xl text-xs font-medium capitalize border transition-all',
                priority === p
                  ? p === 'high' ? 'border-red-400 bg-red-500/20 text-red-400' : p === 'medium' ? 'border-amber-400 bg-amber-500/20 text-amber-400' : 'border-emerald-400 bg-emerald-500/20 text-emerald-400'
                  : 'border-[var(--border)] text-[var(--text-muted)]'
              )}>{p}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['business', 'client', 'school', 'personal', 'health'] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn('px-3 py-1.5 rounded-xl text-xs capitalize border transition-all',
                category === c ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'
              )}>{CAT_EMOJI[c]} {c}</button>
          ))}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-sm border border-[var(--border)] outline-none" />
        <button onClick={() => { if (title.trim()) { onAdd({ title: title.trim(), priority, category, scheduledDate: date, status: 'todo' }); onClose() }}}
          className="w-full py-3.5 rounded-xl bg-[var(--accent)] font-bold text-sm active:scale-95 transition-transform">Add Task</button>
      </motion.div>
    </div>
  )
}

// ─── Error Boundary ──────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) { console.error('App error:', error) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="glass-card p-8 text-center max-w-sm">
            <p className="text-4xl mb-4">⚡</p>
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">The app hit an unexpected error.</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
              className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm active:scale-95">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main ────────────────────────────────────────────
function HomeInner() {
  const [tab, setTab] = useState<Tab>('my-day')
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubStore: (() => void) | null = null
    let unsubRealtime: (() => void) | null = null

    initStore().then(() => {
      const todayDate = today()
      const endDate = new Date(todayDate + 'T12:00:00')
      endDate.setDate(endDate.getDate() + 13)
      const endDateStr = endDate.toISOString().split('T')[0]
      generateRecurringTasksForRange(todayDate, endDateStr)
      setTasks(getTasks())
      setLoading(false)

      // Keep React state in sync with the store cache (drives UI updates from
      // realtime, optimistic mutations, rollbacks, and refreshAll).
      unsubStore = onStoreChange(() => setTasks(getTasks()))
      unsubRealtime = subscribeRealtime()
    })

    // Re-pull from server when the tab/PWA becomes visible or focused.
    // This is the primary cross-device sync path: open the PWA on phone after
    // hours away → it pulls the latest snapshot from Supabase before render.
    function handleVisible() {
      if (document.visibilityState !== 'visible') return
      refreshAll().then(() => setTasks(getTasks()))
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)

    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
      unsubStore?.()
      unsubRealtime?.()
    }
  }, [])

  const refresh = useCallback(() => setTasks(getTasks()), [])

  function handleToggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const wasDone = task.status === 'done'
    updateTask(id, {
      status: wasDone ? 'todo' : 'done',
      completedAt: wasDone ? undefined : new Date().toISOString(),
    })
    refresh()
    if (!wasDone) toast.success('Task completed!', { duration: 1500 })
  }

  function handleDelete(id: string) {
    const task = tasks.find(t => t.id === id)
    saveTasks(tasks.filter(t => t.id !== id))
    refresh()
    toast('Task removed', { duration: 1500, icon: '🗑️' })
  }

  function handleAdd(task: Omit<Task, 'id' | 'createdAt'>) {
    addTask(task)
    refresh()
    toast.success('Task added!', { duration: 1500 })
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center">
          <p className="text-4xl mb-3">⚡</p>
          <p className="text-sm text-[var(--text-muted)]">Loading your planner...</p>
        </motion.div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-2 max-w-lg mx-auto">
      <div className="flex justify-end mb-2">
        <a href="/quick" className="text-xs text-[var(--accent)] font-medium glass-card px-3 py-1.5">⏱️ Quick Timer</a>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {tab === 'my-day' && <MyDayView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} onRefresh={refresh} />}
          {tab === 'tasks' && <AllTasksView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} />}
          {tab === 'week' && <WeekGrid tasks={tasks} onRefresh={refresh} />}
          {tab === 'timer' && <TimeTracker />}
          {tab === 'recap' && <WeeklyRecap />}
          {tab === 'icebox' && <IceboxView />}
          {tab === 'leads' && <LeadsView />}
          {tab === 'brain' && <BrainView />}
          {tab === 'strength' && <CalisthenicsView />}
          {tab === 'log' && <LogView tasks={tasks} />}
        </motion.div>
      </AnimatePresence>

      <NavBar tab={tab} setTab={setTab} />
      <BrainDump onDone={refresh} />

      <AnimatePresence>
        {showAdd && <AddTaskModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </main>
  )
}

export default function Home() {
  return (
    <ErrorBoundary>
      <HomeInner />
    </ErrorBoundary>
  )
}
