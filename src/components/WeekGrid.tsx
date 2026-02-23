'use client'

import { useState } from 'react'
import { Task } from '@/lib/types'
import { getBlocksForDay, getFreeHours, DAY_NAMES } from '@/lib/schedule'
import { today, getWeekStart, addTask } from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'p' : 'a'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ap}` : `${h12}:${m.toString().padStart(2, '0')}${ap}`
}

function fmtDateShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CAT_EMOJI: Record<string, string> = {
  business: '💼', client: '🤝', school: '📚', personal: '🏠', health: '💪',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-emerald-400',
}

export default function WeekGrid({ tasks, onRefresh }: { tasks: Task[]; onRefresh: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium')
  const [newCategory, setNewCategory] = useState<Task['category']>('business')

  const d = today()
  const ws = getWeekStart(d)
  const baseDate = new Date(ws + 'T12:00:00')
  baseDate.setDate(baseDate.getDate() + weekOffset * 7)

  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(baseDate)
    dt.setDate(baseDate.getDate() + i)
    const dateStr = dt.toISOString().split('T')[0]
    return {
      dateStr,
      dow: dt.getDay(),
      dayName: DAY_NAMES[dt.getDay()].slice(0, 3),
      dayNum: dt.getDate(),
      isToday: dateStr === d,
      tasks: tasks.filter(t => t.scheduledDate === dateStr),
      blocks: getBlocksForDay(dt.getDay()),
      freeHrs: getFreeHours(dt.getDay()),
    }
  })

  const selectedDay = selectedDate ? days.find(d => d.dateStr === selectedDate) : null

  function handleAddTask() {
    if (!newTitle.trim() || !selectedDate) return
    addTask({
      title: newTitle.trim(),
      priority: newPriority,
      category: newCategory,
      scheduledDate: selectedDate,
      scheduledTime: newTime || undefined,
      status: 'todo',
    })
    setNewTitle('')
    setNewTime('')
    setShowAddTask(false)
    onRefresh()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-3xl font-bold">Week</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1 text-sm text-[var(--accent)] font-medium">←</button>
          <button onClick={() => setWeekOffset(0)} className="px-2 py-1 text-xs text-[var(--text-muted)]">Today</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1 text-sm text-[var(--accent)] font-medium">→</button>
        </div>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        {fmtDateShort(days[0].dateStr)} — {fmtDateShort(days[6].dateStr)}
      </p>

      {/* Week strip — tap a day to expand */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const isSelected = selectedDate === day.dateStr
          const doneTasks = day.tasks.filter(t => t.status === 'done').length
          const totalTasks = day.tasks.length
          return (
            <button key={day.dateStr} onClick={() => setSelectedDate(isSelected ? null : day.dateStr)}
              className={cn(
                'flex flex-col items-center py-2 rounded-xl transition-all',
                day.isToday && 'ring-2 ring-[var(--accent)]',
                isSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'
              )}>
              <span className="text-[10px] font-medium">{day.dayName}</span>
              <span className="text-lg font-bold">{day.dayNum}</span>
              <span className={cn('text-[9px]', isSelected ? 'text-white/70' : 'text-[var(--text-muted)]')}>
                {totalTasks > 0 ? `${doneTasks}/${totalTasks}` : `${day.freeHrs.toFixed(0)}h`}
              </span>
              {/* Task dots */}
              {totalTasks > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {day.tasks.slice(0, 3).map((t, i) => (
                    <div key={i} className={cn('w-1.5 h-1.5 rounded-full', t.status === 'done' ? 'bg-white/40' : PRIORITY_DOT[t.priority])} />
                  ))}
                  {totalTasks > 3 && <span className="text-[7px]">+{totalTasks - 3}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Expanded day view */}
      {selectedDay && (
        <div className="space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{DAY_NAMES[selectedDay.dow]}, {fmtDateShort(selectedDay.dateStr)}</h2>
            <span className="text-xs text-[var(--text-muted)]">{selectedDay.freeHrs.toFixed(1)}h free</span>
          </div>

          {/* Time blocks */}
          <div className="space-y-1">
            {selectedDay.blocks.map(block => {
              const blockTasks = selectedDay.tasks.filter(t => {
                if (!t.scheduledTime) return false
                return t.scheduledTime >= block.start && t.scheduledTime < block.end
              })
              return (
                <div key={block.id} className={cn(
                  'rounded-xl px-3 py-2',
                  block.locked ? 'bg-[var(--card)]' : 'bg-[var(--accent)]/5 border border-dashed border-[var(--accent)]/20'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] w-20 flex-shrink-0">{fmt12(block.start)}–{fmt12(block.end)}</span>
                    <span className="text-sm">{block.emoji}</span>
                    <span className="text-sm flex-1">{block.label}</span>
                    {block.locked && <span className="text-[9px] text-[var(--text-muted)]">🔒</span>}
                  </div>
                  {/* Tasks in this block */}
                  {blockTasks.map(t => (
                    <div key={t.id} className="ml-[84px] mt-1 flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[t.priority])} />
                      <span className={cn(t.status === 'done' && 'line-through text-[var(--text-muted)]')}>{t.title}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Unscheduled tasks for this day */}
          {(() => {
            const unscheduled = selectedDay.tasks.filter(t => !t.scheduledTime)
            if (unscheduled.length === 0) return null
            return (
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Tasks (no time set)</h3>
                <div className="rounded-xl overflow-hidden bg-[var(--card)]">
                  {unscheduled.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border)] last:border-0">
                      <div className={cn('w-2.5 h-2.5 rounded-full', PRIORITY_DOT[t.priority])} />
                      <span className={cn('text-sm flex-1', t.status === 'done' && 'line-through text-[var(--text-muted)]')}>{t.title}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{CAT_EMOJI[t.category]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Quick add */}
          <button onClick={() => setShowAddTask(!showAddTask)}
            className="w-full py-2.5 rounded-xl border border-dashed border-[var(--accent)]/30 text-sm text-[var(--accent)] font-medium">
            + Add task for {DAY_NAMES[selectedDay.dow]}
          </button>

          {showAddTask && (
            <div className="bg-[var(--card)] rounded-xl p-4 space-y-3">
              <input autoFocus placeholder="Task title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask() }}
                className="w-full bg-[var(--bg)] rounded-xl px-4 py-2.5 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)]" />
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className="w-full bg-[var(--bg)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none" placeholder="Time (optional)" />
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as const).map(p => (
                  <button key={p} onClick={() => setNewPriority(p)}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs capitalize border',
                      newPriority === p
                        ? p === 'high' ? 'border-red-400 bg-red-500/20 text-red-400' : p === 'medium' ? 'border-amber-400 bg-amber-500/20 text-amber-400' : 'border-emerald-400 bg-emerald-500/20 text-emerald-400'
                        : 'border-[var(--border)] text-[var(--text-muted)]'
                    )}>{p}</button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['business', 'client', 'school', 'personal', 'health'] as const).map(c => (
                  <button key={c} onClick={() => setNewCategory(c)}
                    className={cn('px-2.5 py-1 rounded-lg text-[11px] capitalize border',
                      newCategory === c ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'
                    )}>{CAT_EMOJI[c]} {c}</button>
                ))}
              </div>
              <button onClick={handleAddTask}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] font-bold text-sm active:scale-95">Add</button>
            </div>
          )}
        </div>
      )}

      {/* If no day selected, show overview */}
      {!selectedDay && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1">This Week</h2>
          {days.map(day => {
            const activeTasks = day.tasks.filter(t => t.status !== 'done')
            return (
              <button key={day.dateStr} onClick={() => setSelectedDate(day.dateStr)}
                className={cn(
                  'w-full bg-[var(--card)] rounded-xl p-3 flex items-center gap-3 text-left transition-all active:scale-[0.98]',
                  day.isToday && 'ring-1 ring-[var(--accent)]'
                )}>
                <div className="text-center w-10">
                  <p className="text-[10px] text-[var(--text-muted)]">{day.dayName}</p>
                  <p className="text-lg font-bold">{day.dayNum}</p>
                </div>
                <div className="flex-1 min-w-0">
                  {/* Time blocks summary */}
                  <div className="flex gap-0.5 mb-1">
                    {day.blocks.filter(b => b.locked).map(b => (
                      <span key={b.id} className="text-[9px] bg-[var(--bg)] px-1 py-0.5 rounded">{b.emoji}{fmt12(b.start)}</span>
                    ))}
                  </div>
                  {/* Tasks preview */}
                  {activeTasks.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {activeTasks.slice(0, 3).map(t => (
                        <span key={t.id} className="text-[10px] text-[var(--text-muted)] truncate max-w-[100px]">
                          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-0.5', PRIORITY_DOT[t.priority])} />
                          {t.title}
                        </span>
                      ))}
                      {activeTasks.length > 3 && <span className="text-[10px] text-[var(--text-muted)]">+{activeTasks.length - 3}</span>}
                    </div>
                  ) : (
                    <span className="text-[10px] text-[var(--text-muted)]">{day.freeHrs.toFixed(1)}h free</span>
                  )}
                </div>
                {day.isToday && <span className="text-[10px] text-[var(--accent)] font-bold">TODAY</span>}
                <span className="text-[var(--text-muted)] text-xs">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
