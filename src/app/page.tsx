'use client'

import { useState, useEffect, useCallback } from 'react'
import BrainDump from '@/components/BrainDump'
import WeekGrid from '@/components/WeekGrid'
import WhatNext from '@/components/WhatNext'
import { Task } from '@/lib/types'
import { getBlocksForDay, getFreeHours, DAY_NAMES } from '@/lib/schedule'
import {
  getTasks, addTask, updateTask, saveTasks,
  today, getOverdueTasks,
  generateRecurringTasks, generateRecurringTasksForRange,
  getIcebox, addToIcebox, removeFromIcebox, getRandomIceboxIdea, IceboxIdea,
  initStore,
} from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Toronto'
  })
}

type Tab = 'my-day' | 'tasks' | 'week' | 'icebox' | 'log'

// ─── Icebox Nudge (random idea from the icebox) ─────
function IceboxNudge() {
  const [idea, setIdea] = useState<IceboxIdea | null>(null)
  useEffect(() => { setIdea(getRandomIceboxIdea()) }, [])
  if (!idea) return null
  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
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

      {/* Quick add */}
      <div className="flex gap-2">
        <input value={newIdea} onChange={e => setNewIdea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newIdea.trim()) { addToIcebox(newIdea.trim()); setNewIdea(''); refresh() }}}
          placeholder="Drop an idea..."
          className="flex-1 bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)]" />
        <button onClick={() => { if (newIdea.trim()) { addToIcebox(newIdea.trim()); setNewIdea(''); refresh() }}}
          disabled={!newIdea.trim()}
          className="px-4 rounded-xl bg-[var(--accent)] text-white font-bold disabled:opacity-30">+</button>
      </div>

      {ideas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🧊</p>
          <p className="text-sm text-[var(--text-muted)]">No ideas on ice yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Brain dump and put things here when they&apos;re not ready to be tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ideas.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(idea => (
            <div key={idea.id} className="bg-[var(--card)] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">💡</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px]">{idea.text}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {new Date(idea.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => { removeFromIcebox(idea.id); refresh() }}
                className="text-[var(--text-muted)] p-1 hover:text-[var(--danger)]">✕</button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-center text-[var(--text-muted)]">
        💡 A random idea shows up on your My Day page. You never know when one will click.
      </p>
    </div>
  )
}

const CAT_COLORS: Record<string, string> = {
  business: 'text-blue-400', client: 'text-purple-400', school: 'text-amber-400',
  personal: 'text-emerald-400', health: 'text-red-400',
}
const CAT_EMOJI: Record<string, string> = {
  business: '💼', client: '🤝', school: '📚', personal: '🏠', health: '💪',
}

// ─── Microsoft To Do Style Task Row ──────────────────
function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const isDone = task.status === 'done'
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 bg-[var(--card)] border-b border-[var(--border)] last:border-0 transition-all',
      isDone && 'opacity-50'
    )}>
      {/* Checkbox — large touch target */}
      <button onClick={onToggle} className="flex-shrink-0 p-2 -m-2 active:scale-90 transition-transform">
        <div className={cn(
          'w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center transition-all',
          isDone ? 'bg-[var(--accent)] border-[var(--accent)]' : 
          task.priority === 'high' ? 'border-red-400' : 
          task.priority === 'medium' ? 'border-amber-400' : 'border-[var(--text-muted)]'
        )}>
          {isDone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
      </button>

      {/* Content */}
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

      {/* Delete */}
      <button onClick={onDelete} className="text-[var(--text-muted)] p-2 -mr-2 hover:text-[var(--danger)] transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}

// ─── My Day (Today) ──────────────────────────────────
function MyDayView({ tasks, onToggle, onDelete, onAdd }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void
}) {
  const d = today()
  const dayOfWeek = new Date(d + 'T12:00:00').getDay()
  const freeHrs = getFreeHours(dayOfWeek)
  const todayTasks = tasks.filter(t => t.scheduledDate === d)
  const done = todayTasks.filter(t => t.status === 'done').length
  const overdue = getOverdueTasks(d)
  const blocks = getBlocksForDay(dayOfWeek)

  const now = new Date()
  const currentMin = now.getHours() * 60 + now.getMinutes()

  // Greeting based on time
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-4">
      {/* Header — MS To Do style */}
      <div className="pt-2">
        <h1 className="text-3xl font-bold">My Day</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">{fmtDate(d)} · {freeHrs.toFixed(1)}h free</p>
      </div>

      {/* Quick greeting + progress */}
      <div className="bg-[var(--card)] rounded-2xl p-4">
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
                  strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {todayTasks.length > 0 ? Math.round((done / todayTasks.length) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Overdue / rolled */}
      {overdue.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wide px-1 mb-2">
            ⚠️ Overdue ({overdue.length})
          </h2>
          <div className="rounded-xl overflow-hidden">
            {overdue.map(t => (
              <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Current schedule block */}
      {(() => {
        const current = blocks.find(b => {
          const [sh, sm] = b.start.split(':').map(Number)
          const [eh, em] = b.end.split(':').map(Number)
          return currentMin >= sh * 60 + sm && currentMin < eh * 60 + em
        })
        if (!current) return null
        return (
          <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">{current.emoji}</span>
            <div>
              <p className="text-sm font-semibold">{current.label}</p>
              <p className="text-xs text-[var(--text-muted)]">{current.start} – {current.end} {current.locked ? '🔒' : ''}</p>
            </div>
            <span className="ml-auto text-xs text-[var(--accent)] font-medium">NOW</span>
          </div>
        )
      })()}

      {/* Today's tasks — split into active + done */}
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
                  <p className="text-xs text-[var(--text-muted)] mt-1">Use the 🎤 button to brain dump</p>
                </div>
              ) : active.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="text-sm text-[var(--text-muted)]">All done for today!</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden">
                  {active
                    .sort((a, b) => {
                      const po = { high: 0, medium: 1, low: 2 }
                      return po[a.priority] - po[b.priority]
                    })
                    .map(t => (
                      <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
                    ))}
                </div>
              )}
            </div>

            {/* Completed tasks */}
            {completed.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide px-1 mb-2">
                  ✅ Done ({completed.length})
                </h2>
                <div className="rounded-xl overflow-hidden">
                  {completed.map(t => (
                    <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* What should I do next? */}
      <WhatNext />

      {/* Icebox nudge — random old idea */}
      <IceboxNudge />

      {/* Rolling task alerts — tasks sitting 3+ days */}
      {(() => {
        const stale = tasks.filter(t => {
          if (t.status === 'done') return false
          const created = new Date(t.createdAt)
          const now = new Date()
          const days = Math.floor((now.getTime() - created.getTime()) / 86400000)
          return days >= 3 && t.scheduledDate <= d
        })
        if (stale.length === 0) return null
        return (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
            <h3 className="text-xs font-bold text-orange-400 mb-1">🔥 Rolling for 3+ days — do it, delegate it, or kill it</h3>
            {stale.slice(0, 3).map(t => (
              <p key={t.id} className="text-sm py-0.5">{t.title}</p>
            ))}
          </div>
        )
      })()}

      {/* Today's schedule */}
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
                isCurrent ? 'bg-[var(--accent)]/10 font-medium' : isPast ? 'opacity-40' : '',
                b.locked ? 'bg-[var(--card)]' : ''
              )}>
                <span className="text-xs text-[var(--text-muted)] w-24 flex-shrink-0">{b.start}–{b.end}</span>
                <span>{b.emoji}</span>
                <span className="flex-1">{b.label}</span>
                {b.locked && <span className="text-[10px] text-[var(--text-muted)]">🔒</span>}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

// ─── All Tasks (To Do style lists) ───────────────────
function AllTasksView({ tasks, onToggle, onDelete, onAdd }: {
  tasks: Task[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'business' | 'client' | 'school' | 'personal' | 'health'>('all')
  const [showDone, setShowDone] = useState(false)

  const active = tasks.filter(t => t.status !== 'done')
  const done = tasks.filter(t => t.status === 'done')
  const filtered = filter === 'all' ? active : active.filter(t => t.category === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-3xl font-bold">Tasks</h1>
        <button onClick={onAdd} className="bg-[var(--accent)] px-4 py-2 rounded-xl text-sm font-medium active:scale-95">+ Add</button>
      </div>

      {/* Category filters — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(['all', 'business', 'client', 'school', 'personal', 'health'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              filter === f ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--text-muted)]'
            )}>
            {f === 'all' ? '📋 All' : `${CAT_EMOJI[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Active tasks */}
      {filtered.length === 0 ? (
        <p className="text-sm text-center text-[var(--text-muted)] py-8">
          {filter === 'all' ? 'No active tasks 🎉' : `No ${filter} tasks`}
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden">
          {filtered.sort((a, b) => {
            const po = { high: 0, medium: 1, low: 2 }
            if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority]
            return a.scheduledDate.localeCompare(b.scheduledDate)
          }).map(t => (
            <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      )}

      {/* Completed — collapsible */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(!showDone)}
            className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1 flex items-center gap-1">
            <span className="text-[10px]">{showDone ? '▼' : '▶'}</span>
            Completed ({done.length})
          </button>
          {showDone && (
            <div className="rounded-xl overflow-hidden mt-2">
              {done.slice(0, 20).map(t => (
                <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Log View ────────────────────────────────────────
function LogView({ tasks }: { tasks: Task[] }) {
  const d = today()
  const todayDone = tasks.filter(t => t.scheduledDate === d && t.status === 'done')
  const todayLeft = tasks.filter(t => t.scheduledDate === d && t.status !== 'done')

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold pt-2">Daily Log</h1>
      <p className="text-sm text-[var(--text-muted)]">{fmtDate(d)}</p>

      <div className="bg-[var(--card)] rounded-2xl p-4">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">🔒 Non-Negotiables</h2>
        {[
          { label: 'Morning routine', emoji: '🙏' },
          { label: 'Outreach (min. 1)', emoji: '📞' },
          { label: 'Post 1 piece of content', emoji: '📱' },
        ].map(nn => (
          <label key={nn.label} className="flex items-center gap-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform">
            <input type="checkbox" className="w-6 h-6 accent-[var(--accent)] rounded" />
            <span className="text-[15px]">{nn.emoji} {nn.label}</span>
          </label>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide px-1 mb-2">✅ Done ({todayDone.length})</h2>
        {todayDone.length > 0 ? (
          <div className="rounded-xl overflow-hidden">
            {todayDone.map(t => <div key={t.id} className="px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] text-sm text-[var(--text-muted)] line-through">{t.title}</div>)}
          </div>
        ) : <p className="text-sm text-[var(--text-muted)] px-1">Nothing yet — get after it 💪</p>}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wide px-1 mb-2">⏳ Remaining ({todayLeft.length})</h2>
        {todayLeft.length > 0 ? (
          <div className="rounded-xl overflow-hidden">
            {todayLeft.map(t => <div key={t.id} className="px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] text-sm">{t.title}</div>)}
          </div>
        ) : <p className="text-sm text-[var(--text-muted)] px-1">All clear! 🎉</p>}
      </div>

      <div className="bg-[var(--card)] rounded-2xl p-4">
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--bg)] rounded-t-2xl p-5 space-y-4 pb-[max(env(safe-area-inset-bottom),20px)]" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">New Task</h3>
        <input autoFocus placeholder="What needs to get done?" value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onAdd({ title: title.trim(), priority, category, scheduledDate: date, status: 'todo' }); onClose() }}}
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] outline-none border border-[var(--border)] focus:border-[var(--accent)]" />
        <div className="flex gap-2">
          {(['high', 'medium', 'low'] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className={cn('flex-1 py-2 rounded-xl text-xs font-medium capitalize border',
                priority === p
                  ? p === 'high' ? 'border-red-400 bg-red-500/20 text-red-400' : p === 'medium' ? 'border-amber-400 bg-amber-500/20 text-amber-400' : 'border-emerald-400 bg-emerald-500/20 text-emerald-400'
                  : 'border-[var(--border)] text-[var(--text-muted)]'
              )}>{p}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['business', 'client', 'school', 'personal', 'health'] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn('px-3 py-1.5 rounded-xl text-xs capitalize border',
                category === c ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'
              )}>{CAT_EMOJI[c]} {c}</button>
          ))}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-sm border border-[var(--border)] outline-none" />
        <button onClick={() => { if (title.trim()) { onAdd({ title: title.trim(), priority, category, scheduledDate: date, status: 'todo' }); onClose() }}}
          className="w-full py-3.5 rounded-xl bg-[var(--accent)] font-bold text-sm active:scale-95">Add Task</button>
      </div>
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────
function NavBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'my-day', label: 'My Day', emoji: '☀️' },
    { key: 'tasks', label: 'Tasks', emoji: '📋' },
    { key: 'week', label: 'Week', emoji: '📆' },
    { key: 'icebox', label: 'Icebox', emoji: '🧊' },
    { key: 'log', label: 'Log', emoji: '📝' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] px-2 pt-1">
      {tabs.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)}
          className={cn('flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg text-xs',
            tab === t.key ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
          )}>
          <span className="text-lg">{t.emoji}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ─── Main ────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>('my-day')
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAdd, setShowAdd] = useState(false)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initStore().then(() => {
      const todayDate = today()
      // Generate tasks for today and the next 13 days (2 weeks)
      const endDate = new Date(todayDate + 'T12:00:00')
      endDate.setDate(endDate.getDate() + 13)
      const endDateStr = endDate.toISOString().split('T')[0]
      generateRecurringTasksForRange(todayDate, endDateStr)
      setTasks(getTasks())
      setLoading(false)
    })
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
    saveTasks(tasks.filter(t => t.id !== id))
    refresh()
  }

  function handleAdd(task: Omit<Task, 'id' | 'createdAt'>) {
    addTask(task)
    refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">⚡</p>
          <p className="text-sm text-[var(--text-muted)]">Loading your planner...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-4 max-w-lg mx-auto">
      {tab === 'my-day' && <MyDayView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} />}
      {tab === 'tasks' && <AllTasksView tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} onAdd={() => setShowAdd(true)} />}
      {tab === 'week' && <WeekGrid tasks={tasks} onRefresh={refresh} />}
      {tab === 'icebox' && <IceboxView />}
      {tab === 'log' && <LogView tasks={tasks} />}

      <NavBar tab={tab} setTab={setTab} />
      
      {/* Brain Dump is the primary interaction — big mic button */}
      <BrainDump onDone={refresh} />

      {showAdd && <AddTaskModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
    </main>
  )
}
