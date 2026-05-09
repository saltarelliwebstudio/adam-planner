'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  TIME_CATEGORIES, getCategoryByKey,
  getActiveTimer, startTimer, stopTimer, updateTimerTask, syncActiveTimer,
  getTimeEntries, getTimeEntriesForDate, deleteTimeEntry, updateTimeEntry,
  createEntriesBatch, formatDuration, formatElapsed,
  TimerState, TimeEntry,
} from '@/lib/time-store'
import { today, getWeekStart } from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

function haptic(ms = 40) {
  try { navigator.vibrate?.(ms) } catch { /* not supported */ }
}

// ── Parser response types ──

interface ParsedSegment {
  task: string
  category: string
  durationMinutes: number | null
  confidence: number
}

interface ParsedPayload {
  mode: 'backfill' | 'start' | 'stop' | 'switch' | 'unknown'
  segments: ParsedSegment[]
  note?: string
  now?: string
}

// ── Quick Log (text + voice input) ──────────────────────

function QuickLog({ onChange }: { onChange: () => void }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<ParsedPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const interimRef = useRef('')

  async function parseAndApply(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return
    setSubmitting(true)
    setErr(null)
    setPreview(null)

    const active = getActiveTimer()
    try {
      const res = await fetch('/api/time-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          activeTimer: active ? {
            category: active.category,
            task: active.task,
            startedAt: active.startedAt,
          } : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `parse failed (${res.status})`)
      }
      const data: ParsedPayload = await res.json()
      setPreview(data)
      await applyParse(data, trimmed)
      setText('')
      onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'parse failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function applyParse(p: ParsedPayload, originalText: string) {
    const now = p.now ? new Date(p.now) : new Date()
    haptic(50)

    if (p.mode === 'stop') {
      if (getActiveTimer()) stopTimer()
      return
    }

    if (p.mode === 'backfill') {
      const durations = p.segments.map(s => s.durationMinutes || 0)
      const totalMin = durations.reduce((a, b) => a + b, 0)
      if (totalMin === 0) {
        // No durations — can't safely place them on the timeline
        setErr('Need durations to backfill — try "25 min homework, 5 min eating"')
        return
      }
      let cursor = now.getTime() - totalMin * 60_000
      const rows = p.segments
        .filter(s => (s.durationMinutes || 0) > 0)
        .map(s => {
          const start = new Date(cursor).toISOString()
          cursor += (s.durationMinutes as number) * 60_000
          const stop = new Date(cursor).toISOString()
          return {
            task: s.task,
            category: s.category,
            startedAt: start,
            stoppedAt: stop,
            durationMinutes: s.durationMinutes as number,
          }
        })
      await createEntriesBatch(rows)
      return
    }

    if (p.mode === 'start' || p.mode === 'switch') {
      if (p.segments.length === 0) return
      const seg = p.segments[0]
      if (p.mode === 'switch' && getActiveTimer()) {
        stopTimer()
      }
      const t = startTimer(seg.category)
      // Prefer the model's task label, fall back to raw text if empty
      const label = seg.task || originalText
      if (label) updateTimerTask(label)
      void t
      return
    }

    // unknown
    setErr('Didn\'t understand that one — try more detail.')
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setErr('Voice input requires Chrome or Safari')
      return
    }
    const r = new SR()
    recognitionRef.current = r
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    interimRef.current = ''
    r.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      const combined = (final || interim).trim()
      interimRef.current = combined
      setText(combined)
    }
    r.onend = () => {
      setListening(false)
      const captured = interimRef.current.trim()
      if (captured) {
        parseAndApply(captured)
      }
    }
    r.onerror = () => {
      setListening(false)
    }
    r.start()
    setListening(true)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    parseAndApply(text)
  }

  const low = preview?.segments.some(s => s.confidence < 0.6)

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          className={cn(
            'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-colors',
            listening ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)]'
          )}
          aria-label={listening ? 'Stop listening' : 'Start voice input'}
        >
          {listening ? '■' : '🎙'}
        </button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Tap to log — e.g. "25 min homework, 5 min eating"'}
          disabled={submitting}
          className="flex-1 bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="flex-shrink-0 px-4 h-11 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm active:scale-95 disabled:opacity-40"
        >
          {submitting ? '…' : 'Log'}
        </button>
      </form>

      {err && <p className="text-xs text-red-400 px-1">{err}</p>}

      {preview && preview.segments.length > 0 && (
        <div className="space-y-1">
          {preview.segments.map((s, i) => {
            const cat = getCategoryByKey(s.category)
            return (
              <div key={i} className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--card)] border',
                s.confidence < 0.6 ? 'border-orange-500/50' : 'border-[var(--border)]'
              )}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat?.color }} />
                <span className="text-xs font-medium flex-1 truncate">
                  {cat?.emoji} {cat?.label} — <span className="text-[var(--text-muted)]">{s.task}</span>
                </span>
                {s.durationMinutes != null && (
                  <span className="text-xs font-mono text-[var(--text-muted)]">{formatDuration(s.durationMinutes)}</span>
                )}
                {s.confidence < 0.6 && <span className="text-[10px] text-orange-400">low conf.</span>}
              </div>
            )
          })}
          {low && (
            <p className="text-[10px] text-orange-400/80 px-1">
              Low confidence — tap any entry below to re-categorize.
            </p>
          )}
          {preview.note && (
            <p className="text-[10px] text-[var(--text-muted)] px-1 italic">{preview.note}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Running Timer Panel ──────────────────────────────────

function RunningTimer({ onStop }: { onStop: () => void }) {
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [elapsed, setElapsed] = useState('00:00:00')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(() => {
    const t = getActiveTimer()
    setTimer(t)
  }, [])

  useEffect(() => {
    refresh()
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        syncActiveTimer().then(t => setTimer(t))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    const poll = setInterval(refresh, 2000)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(poll)
    }
  }, [refresh])

  useEffect(() => {
    if (timer) {
      const tick = () => setElapsed(formatElapsed(timer.startedAt))
      tick()
      intervalRef.current = setInterval(tick, 1000)
      return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }
  }, [timer])

  if (!timer) return null

  const cat = getCategoryByKey(timer.category)

  function handleStop() {
    stopTimer()
    setTimer(null)
    setElapsed('00:00:00')
    onStop()
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl p-4 space-y-3 border border-[var(--border)]">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: cat?.color }} />
        <span className="text-sm font-semibold">{cat?.emoji} {cat?.label}</span>
        {timer.task && <span className="text-xs text-[var(--text-muted)] truncate">— {timer.task}</span>}
      </div>
      <p className="text-4xl font-mono font-bold text-center tracking-wider">{elapsed}</p>
      <p className="text-[10px] text-[var(--text-muted)] text-center">
        Say &quot;done&quot; or name a new activity to switch.
      </p>
      <button onClick={handleStop}
        className="w-full py-2.5 rounded-xl bg-red-500/90 text-white font-bold text-sm active:scale-95 transition-transform">
        Stop
      </button>
    </div>
  )
}

// ── Week Scroll ──────────────────────────────────────

function WeekScroll({ selectedDate, onSelect, entriesByDate }: {
  selectedDate: string
  onSelect: (d: string) => void
  entriesByDate: Map<string, TimeEntry[]>
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const d = today()
  const ws = getWeekStart(d)
  const baseDate = new Date(ws + 'T12:00:00')
  baseDate.setDate(baseDate.getDate() + weekOffset * 7)

  const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(baseDate)
    dt.setDate(baseDate.getDate() + i)
    const dateStr = dt.toISOString().split('T')[0]
    const entries = entriesByDate.get(dateStr) || []
    const totalMin = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0)
    return { dateStr, dayName: DAY_ABBRS[dt.getDay()], dayNum: dt.getDate(), isToday: dateStr === d, totalMin }
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Weekly Overview</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(w => w - 1)} className="px-2 py-1 text-sm text-[var(--accent)] font-medium">&larr;</button>
          <button onClick={() => setWeekOffset(0)} className="px-2 py-1 text-[10px] text-[var(--text-muted)]">Today</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-2 py-1 text-sm text-[var(--accent)] font-medium">&rarr;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const isSelected = selectedDate === day.dateStr
          return (
            <button key={day.dateStr} onClick={() => onSelect(day.dateStr)}
              className={cn(
                'flex flex-col items-center py-2 rounded-xl transition-all',
                day.isToday && 'ring-2 ring-[var(--accent)]',
                isSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'
              )}>
              <span className="text-[10px] font-medium">{day.dayName}</span>
              <span className="text-lg font-bold">{day.dayNum}</span>
              <span className={cn('text-[9px]', isSelected ? 'text-white/70' : 'text-[var(--text-muted)]')}>
                {day.totalMin > 0 ? formatDuration(day.totalMin) : '--'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Edit Entry Modal ─────────────────────────────────

function EditEntryModal({ entry, onSave, onClose }: {
  entry: TimeEntry
  onSave: (id: string, updates: Partial<Pick<TimeEntry, 'task' | 'category' | 'startedAt' | 'stoppedAt'>>) => void
  onClose: () => void
}) {
  const [task, setTask] = useState(entry.task)
  const [category, setCategory] = useState(entry.category)
  const startDate = entry.startedAt.split('T')[0]
  const startTimeVal = entry.startedAt.split('T')[1]?.slice(0, 5) || ''
  const stopTimeVal = entry.stoppedAt?.split('T')[1]?.slice(0, 5) || ''
  const [startTime, setStartTime] = useState(startTimeVal)
  const [stopTime, setStopTime] = useState(stopTimeVal)

  function handleSave() {
    const updates: Partial<Pick<TimeEntry, 'task' | 'category' | 'startedAt' | 'stoppedAt'>> = {}
    if (task !== entry.task) updates.task = task
    if (category !== entry.category) updates.category = category
    if (startTime !== startTimeVal) updates.startedAt = `${startDate}T${startTime}:00`
    if (stopTime !== stopTimeVal && entry.stoppedAt) updates.stoppedAt = `${startDate}T${stopTime}:00`
    onSave(entry.id, updates)
    onClose()
  }

  const cat = getCategoryByKey(category)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--bg)] rounded-t-2xl p-5 space-y-4 pb-[max(env(safe-area-inset-bottom),20px)]" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">Edit Time Entry</h3>

        <div>
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1 block">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {TIME_CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                  category === c.key
                    ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                )}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <input value={task} onChange={e => setTask(e.target.value)}
          placeholder="What were you working on?"
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)]" />

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Start</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Stop</label>
            <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)}
              className="w-full bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none" />
          </div>
        </div>

        {cat && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
            <span>{cat.emoji} {cat.label}</span>
            <span className="ml-auto">{startTime} – {stopTime}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-medium">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm active:scale-95">Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Day Detail ───────────────────────────────────────

function DayDetail({ date, entries, onDelete, onEdit }: {
  date: string; entries: TimeEntry[];
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<TimeEntry, 'task' | 'category' | 'startedAt' | 'stoppedAt'>>) => void
}) {
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie')
  const [ChartsLoaded, setChartsLoaded] = useState(false)
  const [RechartsModule, setRechartsModule] = useState<typeof import('recharts') | null>(null)

  useEffect(() => {
    import('recharts').then(mod => {
      setRechartsModule(mod)
      setChartsLoaded(true)
    })
  }, [])

  const totalMin = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0)

  const breakdown = new Map<string, number>()
  entries.forEach(e => {
    breakdown.set(e.category, (breakdown.get(e.category) || 0) + (e.durationMinutes || 0))
  })
  const breakdownArr = Array.from(breakdown.entries())
    .map(([key, min]) => {
      const cat = getCategoryByKey(key)
      return { key, label: cat?.label || key, emoji: cat?.emoji || '', color: cat?.color || 'hsl(0,0%,50%)', minutes: min, pct: totalMin > 0 ? Math.round(min / totalMin * 100) : 0 }
    })
    .sort((a, b) => b.minutes - a.minutes)

  const fmtDateFull = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{fmtDateFull(date)}</h2>
        <span className="text-xs text-[var(--text-muted)]">{totalMin > 0 ? formatDuration(totalMin) : 'No entries'}</span>
      </div>

      {entries.length > 0 && (
        <div className="rounded-xl overflow-hidden">
          {entries.map(e => {
            const cat = getCategoryByKey(e.category)
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 bg-[var(--card)] border-b border-[var(--border)] last:border-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat?.color }} />
                <span className="text-xs font-medium" style={{ color: cat?.color }}>{cat?.label}</span>
                <span className="text-xs text-[var(--text-muted)] flex-1 truncate">{e.task || '\u2014'}</span>
                <span className="text-xs font-mono text-[var(--text-muted)]">{e.durationMinutes ? formatDuration(e.durationMinutes) : '--'}</span>
                <button onClick={() => setEditingEntry(e)} className="text-[var(--text-muted)] hover:text-[var(--accent)] p-1 text-xs">&#9998;</button>
                <button onClick={() => onDelete(e.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1 -mr-1 text-xs">&times;</button>
              </div>
            )
          })}
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">&#9203;</p>
          <p className="text-sm text-[var(--text-muted)]">No time entries for this day</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Log one above — just type or speak what you did.</p>
        </div>
      )}

      {breakdownArr.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Analytics</h3>
            <div className="flex gap-1">
              <button onClick={() => setChartType('pie')}
                className={cn('px-2 py-1 rounded text-[10px] font-medium', chartType === 'pie' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--text-muted)]')}>Pie</button>
              <button onClick={() => setChartType('bar')}
                className={cn('px-2 py-1 rounded text-[10px] font-medium', chartType === 'bar' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--text-muted)]')}>Bar</button>
            </div>
          </div>

          {ChartsLoaded && RechartsModule && (
            <div className="bg-[var(--card)] rounded-xl p-3" style={{ height: 200 }}>
              {chartType === 'pie' ? (
                <RechartsModule.ResponsiveContainer width="100%" height="100%">
                  <RechartsModule.PieChart>
                    <RechartsModule.Pie
                      data={breakdownArr.map(b => ({ name: b.label, value: b.minutes, fill: b.color }))}
                      dataKey="value"
                      cx="50%" cy="50%"
                      innerRadius={40} outerRadius={70}
                      paddingAngle={2}
                    >
                      {breakdownArr.map(b => (
                        <RechartsModule.Cell key={b.key} fill={b.color} />
                      ))}
                    </RechartsModule.Pie>
                    <RechartsModule.Tooltip
                      formatter={(value) => formatDuration(Number(value))}
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                    />
                  </RechartsModule.PieChart>
                </RechartsModule.ResponsiveContainer>
              ) : (
                <RechartsModule.ResponsiveContainer width="100%" height="100%">
                  <RechartsModule.BarChart data={breakdownArr.map(b => ({ name: b.emoji, minutes: b.minutes, fill: b.color }))}>
                    <RechartsModule.XAxis dataKey="name" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} />
                    <RechartsModule.YAxis hide />
                    <RechartsModule.Tooltip
                      formatter={(value) => formatDuration(Number(value))}
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                    />
                    <RechartsModule.Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                      {breakdownArr.map(b => (
                        <RechartsModule.Cell key={b.key} fill={b.color} />
                      ))}
                    </RechartsModule.Bar>
                  </RechartsModule.BarChart>
                </RechartsModule.ResponsiveContainer>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            {breakdownArr.map(b => (
              <div key={b.key} className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg',
                b.pct > 30 ? 'bg-orange-500/15' : 'bg-[var(--card)]'
              )}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-xs font-medium flex-1">{b.emoji} {b.label}</span>
                <span className="text-xs font-mono text-[var(--text-muted)]">{formatDuration(b.minutes)}</span>
                <span className={cn('text-[10px] font-bold w-8 text-right', b.pct > 30 ? 'text-orange-400' : 'text-[var(--text-muted)]')}>
                  {b.pct}%
                </span>
                {b.pct > 30 && <span className="text-[10px]">&#9888;&#65039;</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onSave={onEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  )
}

// ── Main TimeTracker ─────────────────────────────────

export default function TimeTracker() {
  const [selectedDate, setSelectedDate] = useState(today())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [, setTick] = useState(0)

  const refresh = useCallback(() => {
    setEntries(getTimeEntriesForDate(selectedDate))
    setTick(t => t + 1)
  }, [selectedDate])

  useEffect(() => {
    setEntries(getTimeEntriesForDate(selectedDate))
  }, [selectedDate])

  const entriesByDate = new Map<string, TimeEntry[]>()
  const all = getTimeEntries()
  all.forEach((e: TimeEntry) => {
    const d = new Date(e.startedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
    if (!entriesByDate.has(d)) entriesByDate.set(d, [])
    entriesByDate.get(d)!.push(e)
  })

  function handleDelete(id: string) {
    deleteTimeEntry(id)
    refresh()
  }

  function handleEdit(id: string, updates: Partial<Pick<TimeEntry, 'task' | 'category' | 'startedAt' | 'stoppedAt'>>) {
    updateTimeEntry(id, updates)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-3xl font-bold">Timer</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Just type or speak. I&apos;ll sort it.</p>
      </div>

      <QuickLog onChange={refresh} />
      <RunningTimer onStop={refresh} />
      <WeekScroll selectedDate={selectedDate} onSelect={setSelectedDate} entriesByDate={entriesByDate} />
      <DayDetail date={selectedDate} entries={entries} onDelete={handleDelete} onEdit={handleEdit} />
    </div>
  )
}
