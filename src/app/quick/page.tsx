'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  getCategoriesByGroup, getCategoryByKey, getActiveTimer,
  startTimer, stopTimer, loadTimeEntries, formatElapsed, syncActiveTimer,
  TimerState,
} from '@/lib/time-store'

export default function QuickTimerPage() {
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [elapsed, setElapsed] = useState('00:00:00')
  const [ready, setReady] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Hydrate cache + read active timer on mount
  useEffect(() => {
    loadTimeEntries().then(() => {
      setTimer(getActiveTimer())
      setReady(true)
    })

    // Re-sync from Supabase when tab/app becomes visible (cross-device sync)
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        syncActiveTimer().then(synced => setTimer(synced))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Tick elapsed clock
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timer) {
      const tick = () => setElapsed(formatElapsed(timer.startedAt))
      tick()
      intervalRef.current = setInterval(tick, 1000)
      return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    } else {
      setElapsed('00:00:00')
    }
  }, [timer])

  function handleTap(categoryKey: string) {
    if (timer?.category === categoryKey) {
      // Same category — stop
      stopTimer()
      setTimer(null)
    } else if (timer) {
      // Different category — stop old, start new
      stopTimer()
      const t = startTimer(categoryKey)
      setTimer(t)
    } else {
      // No timer — start
      const t = startTimer(categoryKey)
      setTimer(t)
    }
  }

  function handleStop() {
    stopTimer()
    setTimer(null)
  }

  const grouped = getCategoriesByGroup()
  const activeCat = timer ? getCategoryByKey(timer.category) : null

  if (!ready) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 pt-3 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Quick Timer</h1>
        <Link href="/" className="text-xs text-[var(--accent)] font-medium">
          &larr; App
        </Link>
      </div>

      {/* Active Timer Banner */}
      {timer && activeCat && (
        <div
          className="rounded-2xl p-4 mb-4 border-2"
          style={{
            borderColor: activeCat.color,
            background: `color-mix(in srgb, ${activeCat.color} 10%, var(--bg))`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: activeCat.color }}
            />
            <span className="text-sm font-semibold">
              {activeCat.emoji} {activeCat.label}
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-center tracking-wider mb-3">
            {elapsed}
          </p>
          <button
            onClick={handleStop}
            className="w-full py-3.5 rounded-xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-transform"
            style={{ minHeight: 56 }}
          >
            STOP
          </button>
        </div>
      )}

      {/* Category Grid */}
      <div className="space-y-3">
        {grouped.map(({ group, categories }) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 px-1 mb-1.5">
              <span className="text-sm">{group.emoji}</span>
              <span className="text-xs font-semibold text-[var(--text-muted)]">{group.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(cat => {
                const isActive = timer?.category === cat.key
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleTap(cat.key)}
                    className="flex items-center gap-2 rounded-xl px-3 py-3 text-left active:scale-95 transition-transform border"
                    style={{
                      minHeight: 56,
                      borderColor: isActive ? cat.color : 'var(--border)',
                      backgroundColor: isActive
                        ? `color-mix(in srgb, ${cat.color} 15%, var(--card))`
                        : 'var(--card)',
                    }}
                  >
                    {isActive ? (
                      <span
                        className="w-3 h-3 rounded-full animate-pulse flex-shrink-0"
                        style={{ backgroundColor: '#22c55e' }}
                      />
                    ) : (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span className="text-xs font-medium leading-tight">{cat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
