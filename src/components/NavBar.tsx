'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

export type Tab = 'my-day' | 'tasks' | 'week' | 'timer' | 'icebox' | 'log' | 'recap' | 'leads' | 'brain' | 'strength' | 'more'

const tabs: { key: Tab; label: string; emoji: string }[] = [
  { key: 'my-day', label: 'My Day', emoji: '☀️' },
  { key: 'tasks', label: 'Tasks', emoji: '📋' },
  { key: 'week', label: 'Week', emoji: '📆' },
  { key: 'timer', label: 'Timer', emoji: '⏱️' },
  { key: 'leads', label: 'Clients', emoji: '👥' },
  { key: 'more', label: 'More', emoji: '···' },
]

const moreTabs: { key: Tab; label: string; emoji: string }[] = [
  { key: 'strength', label: 'Strength', emoji: '🏋️' },
  { key: 'brain', label: 'Brain', emoji: '🧠' },
  { key: 'recap', label: 'Recap', emoji: '📊' },
  { key: 'icebox', label: 'Icebox', emoji: '🧊' },
  { key: 'log', label: 'Log', emoji: '📝' },
]

const MORE_KEYS = new Set(moreTabs.map(t => t.key))

export default function NavBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [showMore, setShowMore] = useState(false)
  const isMoreActive = MORE_KEYS.has(tab)

  return (
    <>
      {/* More menu popover */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-16 right-4 z-50 glass-card p-2 min-w-[140px] pb-[env(safe-area-inset-bottom)]"
            >
              {moreTabs.map(t => (
                <button key={t.key}
                  onClick={() => { setTab(t.key); setShowMore(false) }}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors',
                    tab === t.key ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-muted)]'
                  )}>
                  <span className="text-base">{t.emoji}</span>
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-30 frosted-nav pb-[env(safe-area-inset-bottom)] pt-1">
        <div className="grid grid-cols-6 max-w-lg mx-auto">
          {tabs.map(t => {
            const active = t.key === 'more' ? isMoreActive : tab === t.key

            return (
              <button key={t.key}
                onClick={() => {
                  if (t.key === 'more') { setShowMore(v => !v) }
                  else { setTab(t.key); setShowMore(false) }
                }}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] transition-colors min-w-0',
                  active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                )}>
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-[var(--accent)]/10 rounded-lg"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="text-[18px] leading-none relative z-10">{t.emoji}</span>
                <span className="relative z-10 font-medium truncate w-full text-center">{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
