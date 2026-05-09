'use client'

import { motion } from 'framer-motion'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

export type ViewMode = 'list' | 'timeline'

const VIEW_KEY = 'adam-planner-view-mode'

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list'
  return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list'
}

export function setStoredViewMode(mode: ViewMode) {
  localStorage.setItem(VIEW_KEY, mode)
}

export default function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex gap-1 glass-card p-1 w-fit">
      {(['list', 'timeline'] as const).map(m => (
        <button key={m} onClick={() => { onChange(m); setStoredViewMode(m) }}
          className={cn(
            'relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            mode === m ? 'text-white' : 'text-[var(--text-muted)]'
          )}>
          {mode === m && (
            <motion.div
              layoutId="view-toggle"
              className="absolute inset-0 bg-[var(--accent)] rounded-lg"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{m === 'list' ? '☰ List' : '⏰ Timeline'}</span>
        </button>
      ))}
    </div>
  )
}
