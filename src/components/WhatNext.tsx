'use client'

import { useState } from 'react'
import { getTasks, today } from '@/lib/store'
import { getBlocksForDay } from '@/lib/schedule'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

interface Suggestion {
  task: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  category: string
  timeEstimate?: string
}

const PRIORITY_FRAMEWORK = [
  { text: 'Follow up open leads', category: 'business', emoji: '📞' },
  { text: 'Send 3 cold outreach messages', category: 'business', emoji: '📧' },
  { text: 'Work on active client deliverable', category: 'client', emoji: '🔨' },
  { text: 'Build or improve a system', category: 'business', emoji: '⚙️' },
  { text: 'Record content for lead gen', category: 'business', emoji: '📹' },
  { text: 'Learn something for a current client', category: 'client', emoji: '📚' },
]

export default function WhatNext() {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)

  async function getSuggestion() {
    setLoading(true)
    setShow(true)

    const todayDate = today()
    const tasks = getTasks()
    const todayTasks = tasks.filter(t => t.scheduledDate === todayDate && t.status !== 'done')
    const overdue = tasks.filter(t => t.scheduledDate < todayDate && t.status !== 'done')
    const now = new Date()
    const currentHour = now.getHours()

    const dayOfWeek = new Date(todayDate + 'T12:00:00').getDay()
    const blocks = getBlocksForDay(dayOfWeek)
    const currentBlock = blocks.find(b => {
      const [sh, sm] = b.start.split(':').map(Number)
      const [eh, em] = b.end.split(':').map(Number)
      const mins = currentHour * 60 + now.getMinutes()
      return mins >= sh * 60 + sm && mins < eh * 60 + em
    })

    try {
      const res = await fetch('/api/what-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          today: todayDate,
          currentTime: `${currentHour}:${now.getMinutes().toString().padStart(2, '0')}`,
          currentBlock: currentBlock ? { label: currentBlock.label, locked: currentBlock.locked, end: currentBlock.end } : null,
          todayTasks: todayTasks.map(t => ({ title: t.title, priority: t.priority, category: t.category, scheduledTime: t.scheduledTime })),
          overdueTasks: overdue.map(t => ({ title: t.title, priority: t.priority, scheduledDate: t.scheduledDate })),
          priorityFramework: PRIORITY_FRAMEWORK.map(p => p.text),
        }),
      })
      const data = await res.json()
      setSuggestion(data)
    } catch {
      // Fallback: use local priority framework
      const hasOverdue = overdue.length > 0
      const hasHighPriority = todayTasks.some(t => t.priority === 'high' && t.status !== 'done')

      if (hasOverdue) {
        setSuggestion({
          task: overdue[0].title,
          reason: `This has been sitting since ${overdue[0].scheduledDate}. Either do it, delegate it, or kill it.`,
          priority: 'high',
          category: overdue[0].category,
        })
      } else if (hasHighPriority) {
        const t = todayTasks.find(t => t.priority === 'high')!
        setSuggestion({
          task: t.title,
          reason: 'This is your highest priority task for today.',
          priority: 'high',
          category: t.category,
        })
      } else {
        const next = PRIORITY_FRAMEWORK[0]
        setSuggestion({
          task: next.text,
          reason: '"What would move money toward me fastest?"',
          priority: 'high',
          category: next.category,
        })
      }
    }
    setLoading(false)
  }

  if (!show) {
    return (
      <button onClick={getSuggestion}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 text-white font-bold text-sm active:scale-[0.98] transition-transform">
        🎯 What should I do next?
      </button>
    )
  }

  return (
    <div className="bg-gradient-to-br from-[var(--accent)]/10 to-purple-500/10 border border-[var(--accent)]/30 rounded-2xl p-5 space-y-3">
      {loading ? (
        <div className="text-center py-4">
          <div className="text-3xl animate-bounce mb-2">🎯</div>
          <p className="text-sm text-[var(--text-muted)]">Thinking about what moves the needle...</p>
        </div>
      ) : suggestion ? (
        <>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="font-bold text-lg">{suggestion.task}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{suggestion.reason}</p>
              {suggestion.timeEstimate && (
                <p className="text-xs text-[var(--accent)] mt-1">⏱ ~{suggestion.timeEstimate}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShow(false)}
              className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium active:scale-95">
              👍 On it
            </button>
            <button onClick={getSuggestion}
              className="py-2.5 px-4 rounded-xl border border-[var(--border)] text-sm">
              🔄 Something else
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
