'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface WorkoutRow {
  id: string
  exercise: string
  reps: number
  date: string
  side?: string
  vestWeight?: number
  notes?: string
  rawName: string
  rawNote: string
}

type Filter = 'week' | 'month' | 'all'

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function torontoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function daysAgo(n: number): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }))
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function groupByDate(rows: WorkoutRow[]): Map<string, WorkoutRow[]> {
  const map = new Map<string, WorkoutRow[]>()
  for (const r of rows) {
    const list = map.get(r.date) || []
    list.push(r)
    map.set(r.date, list)
  }
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])))
}

export default function CalisthenicsView() {
  const [rows, setRows] = useState<WorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('month')

  useEffect(() => {
    setLoading(true)
    fetch('/api/workout-log')
      .then(r => r.json())
      .then(data => setRows(data.entries || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const cutoff = filter === 'week' ? daysAgo(7) : filter === 'month' ? daysAgo(30) : '2000-01-01'
  const filtered = rows.filter(r => r.date >= cutoff)
  const grouped = groupByDate(filtered)

  // Stats
  const totalSets = filtered.filter(r => r.reps > 0).length
  const totalReps = filtered.reduce((sum, r) => sum + r.reps, 0)
  const uniqueDays = grouped.size

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Calisthenics Log</h2>
        <div className="flex gap-1 bg-[var(--card)] rounded-xl p-0.5 border border-[var(--border)]">
          {(['week', 'month', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {f === 'week' ? '7d' : f === 'month' ? '30d' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card px-3 py-2 text-center">
          <div className="text-lg font-bold text-[var(--accent)]">{uniqueDays}</div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Days</div>
        </div>
        <div className="glass-card px-3 py-2 text-center">
          <div className="text-lg font-bold text-[var(--accent)]">{totalSets}</div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Sets</div>
        </div>
        <div className="glass-card px-3 py-2 text-center">
          <div className="text-lg font-bold text-[var(--accent)]">{totalReps}</div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Reps</div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading workouts...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-card p-6 text-center space-y-2">
          <div className="text-3xl">🏋️</div>
          <p className="text-sm text-[var(--text-muted)]">No workout entries yet</p>
          <p className="text-xs text-[var(--text-muted)]">
            Log exercises via your Shortcut — they'll appear here automatically from your Notion Brain.
          </p>
        </div>
      )}

      {!loading && [...grouped.entries()].map(([date, entries]) => (
        <motion.div
          key={date}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card overflow-hidden"
        >
          {/* Date header */}
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--accent)]/5">
            <span className="text-xs font-semibold text-[var(--accent)]">{fmtDate(date)}</span>
            <span className="text-xs text-[var(--text-muted)] ml-2">
              {entries.filter(e => e.reps > 0).length} sets · {entries.reduce((s, e) => s + e.reps, 0)} reps
            </span>
          </div>

          {/* Table */}
          <div className="divide-y divide-[var(--border)]">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
              <span>Exercise</span>
              <span className="w-12 text-right">Reps</span>
              <span className="w-16 text-right">Load</span>
              <span className="w-16 text-right">Notes</span>
            </div>

            {/* Data rows */}
            {entries.map((entry, i) => (
              <div
                key={entry.id + '-' + i}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 items-center"
              >
                <span className="text-sm font-medium truncate">{entry.exercise}</span>
                <span className="w-12 text-right text-sm tabular-nums font-semibold text-[var(--accent)]">
                  {entry.reps > 0 ? entry.reps : '—'}
                </span>
                <span className="w-16 text-right text-xs text-[var(--text-muted)]">
                  {entry.vestWeight ? `${entry.vestWeight}lb` : '—'}
                </span>
                <span className="w-16 text-right text-xs text-[var(--text-muted)] truncate">
                  {entry.side ? `${entry.side}` : entry.notes || '—'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
