'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { computeRecap, getWeekRange, RecapData, CategoryRecap } from '@/lib/recap'
import { formatDuration, getTimeEntries } from '@/lib/time-store'
import { addTask, getWeekStart, today } from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Commitment {
  label: string
  category: string
  targetMinutes: number
  rationale: string
}

// Map time-tracker category → planner Task.category
function toTaskCategory(key: string): 'business' | 'client' | 'school' | 'personal' | 'health' {
  if (key === 'client-work') return 'client'
  if (key === 'school') return 'school'
  if (['gym', 'stretching', 'cooking', 'eating', 'sleep', 'grooming', 'naps', 'bathroom'].includes(key)) return 'health'
  if (['dog-walking', 'pet-care', 'cleaning', 'laundry', 'yard-work', 'home-maintenance', 'errands', 'commuting', 'scrolling', 'tv', 'gaming', 'reading-fun', 'socializing'].includes(key)) return 'personal'
  // work/growth leftovers default to business
  return 'business'
}

function nextMonday(): string {
  const d = new Date(today() + 'T12:00:00')
  const dow = d.getDay() // 0=Sun, 1=Mon
  const daysUntil = dow === 1 ? 7 : ((1 - dow + 7) % 7 || 7)
  d.setDate(d.getDate() + daysUntil)
  return d.toISOString().split('T')[0]
}

// ── Sparkline ──

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const w = 48
  const h = 16
  const step = values.length > 1 ? w / (values.length - 1) : w
  const points = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="flex-shrink-0" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Delta pill ──

function DeltaPill({ c }: { c: CategoryRecap }) {
  if (c.deltaMinutes === 0 && (c.deltaPct === 0 || c.deltaPct == null)) {
    return <span className="text-[10px] text-[var(--text-muted)] w-14 text-right">—</span>
  }
  const isUp = c.deltaMinutes > 0
  const label = c.deltaPct == null
    ? 'new'
    : `${isUp ? '+' : ''}${c.deltaPct}%`
  return (
    <span className={cn(
      'text-[10px] font-semibold w-14 text-right',
      isUp ? 'text-green-400' : 'text-orange-400'
    )}>
      {label}
    </span>
  )
}

// ── Commitments panel ──

function CommitmentsPanel({ recap }: { recap: RecapData }) {
  const [loading, setLoading] = useState(false)
  const [commitments, setCommitments] = useState<Commitment[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  async function generate() {
    setLoading(true)
    setErr(null)
    setCommitments(null)
    try {
      // Previous week snapshot (matches same shape as current)
      const prevRecap = computeRecap(
        new Date(new Date(recap.weekStart + 'T12:00:00').getTime() - 7 * 86400_000).toISOString().split('T')[0]
      )
      const res = await fetch('/api/weekly-commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thisWeek: recap.timeByCategory.map(c => ({
            key: c.key, label: c.label, minutes: c.minutes,
            deltaMinutes: c.deltaMinutes, trend4w: c.trend4w,
          })),
          prevWeek: prevRecap.timeByCategory.map(c => ({
            key: c.key, label: c.label, minutes: c.minutes,
            deltaMinutes: c.deltaMinutes, trend4w: c.trend4w,
          })),
          thisTotalMin: recap.totalMinutes,
          prevTotalMin: recap.prevTotalMinutes,
        }),
      })
      if (!res.ok) throw new Error(`commitments failed (${res.status})`)
      const data = await res.json()
      setCommitments(data.commitments || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }

  function acceptCommitment(idx: number, c: Commitment) {
    const mondayDate = nextMonday()
    addTask({
      title: c.label,
      priority: 'high',
      status: 'todo',
      category: toTaskCategory(c.category),
      scheduledDate: mondayDate,
      scheduledTime: '09:00',
      notes: c.rationale ? `Why: ${c.rationale}` : undefined,
      source: 'web',
    })
    setAccepted(prev => new Set(prev).add(idx))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Commitments for next week</h2>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {loading ? 'Thinking…' : commitments ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {!commitments && !loading && (
        <p className="text-xs text-[var(--text-muted)]">
          Tap Generate — I&apos;ll look at this week vs last week and propose 3–5 specific commitments
          tied to your priorities. Each accepted one lands on next Monday at 9am.
        </p>
      )}

      {commitments && commitments.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No commitments proposed. Try tracking more this week and regenerate.</p>
      )}

      <div className="space-y-2">
        {commitments?.map((c, i) => {
          const isAccepted = accepted.has(i)
          return (
            <div key={i} className={cn(
              'glass-card p-3 space-y-2 transition-all',
              isAccepted && 'opacity-60'
            )}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{c.label}</p>
                  {c.rationale && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">{c.rationale}</p>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Target: {formatDuration(c.targetMinutes)} · {c.category}
                  </p>
                </div>
                <button
                  onClick={() => acceptCommitment(i, c)}
                  disabled={isAccepted}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-semibold',
                    isAccepted
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[var(--accent)] text-white active:scale-95'
                  )}
                >
                  {isAccepted ? '✓ Added' : 'Accept'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chat-back panel ──

function ChatPanel({ recap }: { recap: RecapData }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function ask(q: string) {
    if (!q.trim() || streaming) return
    setStreaming(true)
    setAnswer('')
    setErr(null)

    const { start, end } = getWeekRange(recap.weekStart)
    const entries = getTimeEntries(start, end)
      .filter(e => e.stoppedAt !== null)
      .map(e => ({
        date: new Date(e.startedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }),
        dayOfWeek: DAY_ABBRS[new Date(e.startedAt).getDay()],
        category: e.category,
        task: e.task,
        durationMinutes: e.durationMinutes || 0,
        startedAt: e.startedAt,
        stoppedAt: e.stoppedAt!,
      }))

    const totals = recap.timeByCategory.map(c => ({
      key: c.key, label: c.label, minutes: c.minutes, deltaMinutes: c.deltaMinutes,
    }))

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/weekly-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          entries,
          totals,
          weekLabel: `${recap.weekStart} to ${recap.weekEnd}`,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n')
          const message = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 2)
          if (message.startsWith('data: ')) {
            const data = message.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) throw new Error(parsed.error)
              if (parsed.text) setAnswer(prev => prev + parsed.text)
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setErr(e instanceof Error ? e.message : 'chat failed')
      }
    } finally {
      setStreaming(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    ask(question)
  }

  const quickPrompts = [
    'What crowded out my deep work this week?',
    'Biggest time sinks I didn\'t plan for?',
    'Am I on track for my training volume?',
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Ask about this week</h2>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Why was scrolling so high Thursday?"
          className="flex-1 bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none focus:border-[var(--accent)]"
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={!question.trim() || streaming}
          className="px-4 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-40 active:scale-95"
        >
          {streaming ? '…' : 'Ask'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {quickPrompts.map(q => (
          <button
            key={q}
            onClick={() => { setQuestion(q); ask(q) }}
            disabled={streaming}
            className="text-[10px] px-2 py-1 rounded-md bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border)]"
          >
            {q}
          </button>
        ))}
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {(answer || streaming) && (
        <div className="glass-card p-3">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {answer}
            {streaming && <span className="inline-block w-2 h-4 bg-[var(--accent)] ml-0.5 animate-pulse" />}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main ──

export default function WeeklyRecap() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [recap, setRecap] = useState<RecapData | null>(null)
  const [RechartsModule, setRechartsModule] = useState<typeof import('recharts') | null>(null)

  const currentWeekStart = getWeekStart(today())
  const targetDate = new Date(currentWeekStart + 'T12:00:00')
  targetDate.setDate(targetDate.getDate() + weekOffset * 7)
  const targetWeekStart = targetDate.toISOString().split('T')[0]

  useEffect(() => {
    setRecap(computeRecap(targetWeekStart))
  }, [targetWeekStart])

  useEffect(() => {
    import('recharts').then(mod => setRechartsModule(mod))
  }, [])

  if (!recap) return null

  const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const completionPct = recap.tasksTotal > 0 ? Math.round((recap.tasksCompleted / recap.tasksTotal) * 100) : 0
  const totalDeltaMin = recap.totalMinutes - recap.prevTotalMinutes

  return (
    <div className="space-y-5 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📊 Recap</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {fmtShort(recap.weekStart)} — {fmtShort(recap.weekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1 text-sm text-[var(--accent)] font-medium">←</button>
          <button onClick={() => setWeekOffset(0)} className="px-2 py-1 text-[10px] text-[var(--text-muted)]">This week</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1 text-sm text-[var(--accent)] font-medium">→</button>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card p-3 text-center">
          <p className="text-2xl font-bold">{recap.totalFormatted}</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase">Tracked</p>
          {recap.prevTotalMinutes > 0 && (
            <p className={cn('text-[10px] font-semibold mt-0.5',
              totalDeltaMin >= 0 ? 'text-green-400' : 'text-orange-400'
            )}>
              {totalDeltaMin >= 0 ? '+' : ''}{formatDuration(Math.abs(totalDeltaMin))} vs last wk
            </p>
          )}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card p-3 text-center">
          <p className="text-2xl font-bold">{recap.tasksCompleted}<span className="text-sm text-[var(--text-muted)]">/{recap.tasksTotal}</span></p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase">Tasks Done</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className={cn('glass-card p-3 text-center', completionPct >= 80 && 'glow-success')}>
          <p className="text-2xl font-bold">{completionPct}%</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase">Completion</p>
        </motion.div>
      </div>

      {/* Insight */}
      {recap.topInsight && (
        <div className="glass-card gradient-border px-4 py-3">
          <p className="text-sm">💡 {recap.topInsight}</p>
        </div>
      )}

      {/* Daily bar chart */}
      {RechartsModule && recap.timeByDay.some(d => d.minutes > 0) && (
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Daily Activity</h2>
          <div className="glass-card p-3" style={{ height: 160 }}>
            <RechartsModule.ResponsiveContainer width="100%" height="100%">
              <RechartsModule.BarChart data={recap.timeByDay.map(d => ({
                name: DAY_ABBRS[new Date(d.date + 'T12:00:00').getDay()],
                minutes: Math.round(d.minutes),
              }))}>
                <RechartsModule.XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <RechartsModule.YAxis hide />
                <RechartsModule.Tooltip
                  formatter={(value) => formatDuration(Number(value))}
                  contentStyle={{ background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(8px)' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <RechartsModule.Bar dataKey="minutes" radius={[6, 6, 0, 0]} fill="var(--accent)" />
              </RechartsModule.BarChart>
            </RechartsModule.ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category breakdown pie */}
      {RechartsModule && recap.timeByCategory.filter(c => c.minutes > 0).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Time Breakdown</h2>
          <div className="glass-card p-3" style={{ height: 200 }}>
            <RechartsModule.ResponsiveContainer width="100%" height="100%">
              <RechartsModule.PieChart>
                <RechartsModule.Pie
                  data={recap.timeByCategory.filter(c => c.minutes > 0).map(c => ({ name: c.label, value: c.minutes, fill: c.color }))}
                  dataKey="value"
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={75}
                  paddingAngle={2}
                >
                  {recap.timeByCategory.filter(c => c.minutes > 0).map(c => (
                    <RechartsModule.Cell key={c.key} fill={c.color} />
                  ))}
                </RechartsModule.Pie>
                <RechartsModule.Tooltip
                  formatter={(value) => formatDuration(Number(value))}
                  contentStyle={{ background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
              </RechartsModule.PieChart>
            </RechartsModule.ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category list with deltas + sparklines */}
      {recap.timeByCategory.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Categories · 4-week trend</h2>
          {recap.timeByCategory.map((c, i) => (
            <motion.div key={c.key}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card-hover px-3 py-2.5 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-xs font-medium flex-1 truncate">{c.emoji} {c.label}</span>
              <Sparkline values={c.trend4w} color={c.color} />
              <span className="text-xs font-mono text-[var(--text-muted)] w-14 text-right">{c.formatted}</span>
              <DeltaPill c={c} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Panel 2 — Commitments for next week */}
      <CommitmentsPanel recap={recap} />

      {/* Panel 3 — Chat-back */}
      <ChatPanel recap={recap} />

      {/* Empty state */}
      {recap.totalMinutes === 0 && recap.tasksTotal === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm text-[var(--text-muted)]">No data for this week yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Log time in the Timer tab — just type or speak what you did.</p>
        </div>
      )}
    </div>
  )
}
