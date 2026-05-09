'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ResolvedBlock } from '@/lib/types'
import { Task } from '@/lib/types'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

const HOUR_HEIGHT = 80 // px per hour
const START_HOUR = 6
const END_HOUR = 24

const CAT_COLORS: Record<string, string> = {
  business: '#3b82f6', client: '#a855f7', school: '#f59e0b',
  personal: '#22c55e', health: '#ef4444',
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToY(minutes: number): number {
  return ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12} ${ap}` : `${h12}:${m.toString().padStart(2, '0')} ${ap}`
}

interface ColumnInfo { columnIndex: number; totalColumns: number }

function computeColumns(blocks: { id: string; start: string; end: string }[]): Map<string, ColumnInfo> {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start))
  const placed: { id: string; startMin: number; endMin: number; col: number }[] = []
  const result = new Map<string, ColumnInfo>()

  for (const block of sorted) {
    const startMin = timeToMinutes(block.start)
    const endMin = timeToMinutes(block.end)
    // Find overlapping already-placed blocks
    const overlapping = placed.filter(p => p.startMin < endMin && p.endMin > startMin)
    const usedCols = new Set(overlapping.map(p => p.col))
    let col = 0
    while (usedCols.has(col)) col++
    placed.push({ id: block.id, startMin, endMin, col })
    result.set(block.id, { columnIndex: col, totalColumns: 1 }) // totalColumns updated below
  }

  // Second pass: for each block, set totalColumns = max columns in its overlap cluster
  for (const p of placed) {
    const overlapping = placed.filter(o => o.startMin < p.endMin && o.endMin > p.startMin)
    const maxCol = Math.max(...overlapping.map(o => o.col)) + 1
    for (const o of overlapping) {
      const info = result.get(o.id)!
      if (maxCol > info.totalColumns) info.totalColumns = maxCol
    }
  }

  return result
}

interface TimelineViewProps {
  blocks: ResolvedBlock[]
  tasks: Task[]
  onSkipBlock?: (blockId: string) => void
}

export default function TimelineView({ blocks, tasks, onSkipBlock }: TimelineViewProps) {
  const [currentMinutes, setCurrentMinutes] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const toronto = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
      setCurrentMinutes(toronto.getHours() * 60 + toronto.getMinutes())
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && currentMinutes > START_HOUR * 60) {
      const y = minutesToY(currentMinutes) - 100
      scrollRef.current.scrollTop = Math.max(0, y)
    }
  }, [currentMinutes])

  const nowY = minutesToY(currentMinutes)
  const showNow = currentMinutes >= START_HOUR * 60 && currentMinutes < END_HOUR * 60

  // Filter out free/placeholder blocks when adhoc overrides fill their time range
  const filteredBlocks = blocks.filter(block => {
    // Keep locked blocks and override blocks always
    if (block.locked || block.isOverride) return true
    // For unlocked non-override blocks (free blocks), hide if adhoc blocks exist in their range
    const startMin = timeToMinutes(block.start)
    const endMin = timeToMinutes(block.end)
    const hasAdhocInRange = blocks.some(b =>
      b.isOverride && timeToMinutes(b.start) >= startMin && timeToMinutes(b.start) < endMin
    )
    return !hasAdhocInRange
  })

  const columnMap = computeColumns(filteredBlocks)
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT

  return (
    <div ref={scrollRef} className="relative overflow-y-auto max-h-[70vh] rounded-xl" style={{ scrollbarWidth: 'none' }}>
      <div className="relative" style={{ height: totalHeight, minWidth: '100%' }}>
        {/* Hour lines */}
        {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
          const hour = START_HOUR + i
          const y = i * HOUR_HEIGHT
          return (
            <div key={hour} className="absolute left-0 right-0" style={{ top: y }}>
              <div className="flex items-start">
                <span className="text-[10px] text-[var(--text-muted)] w-12 -mt-1.5 text-right pr-2 flex-shrink-0">
                  {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </span>
                <div className="flex-1 border-t border-[var(--border)]" />
              </div>
            </div>
          )
        })}

        {/* Schedule blocks */}
        {filteredBlocks.map((block) => {
          const startMin = timeToMinutes(block.start)
          const endMin = timeToMinutes(block.end)
          if (startMin < START_HOUR * 60 || endMin > END_HOUR * 60) return null

          const top = minutesToY(startMin)
          const height = ((endMin - startMin) / 60) * HOUR_HEIGHT
          const isCurrent = currentMinutes >= startMin && currentMinutes < endMin
          const colInfo = columnMap.get(block.id) || { columnIndex: 0, totalColumns: 1 }
          const { columnIndex, totalColumns } = colInfo

          // Get tasks assigned to this block
          const blockTasks = tasks.filter(t => {
            if (!t.scheduledTime) return false
            const taskMin = timeToMinutes(t.scheduledTime)
            return taskMin >= startMin && taskMin < endMin
          })

          // Column-based horizontal positioning (like Google Calendar)
          // Available area: from 3.5rem (time labels) to calc(100% - 0.5rem)
          const gap = totalColumns > 1 ? 2 : 0 // px gap between columns

          return (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'absolute rounded-lg px-3 py-1.5 overflow-hidden transition-all',
                block.locked ? 'glass-card' : 'border border-dashed border-[var(--accent)]/20 bg-[var(--accent)]/5',
                isCurrent && 'glow-accent ring-1 ring-[var(--accent)]/30'
              )}
              style={{
                top,
                height: Math.max(height, 28),
                zIndex: isCurrent ? 10 : 1,
                left: `calc(3.5rem + ${columnIndex} * (100% - 4rem) / ${totalColumns})`,
                width: `calc((100% - 4rem) / ${totalColumns} - ${gap}px)`,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{block.emoji}</span>
                <span className={cn('text-xs font-medium truncate', isCurrent && 'text-[var(--accent)]')}>
                  {block.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto flex-shrink-0 text-[9px] text-[var(--accent)] font-bold bg-[var(--accent)]/20 px-1.5 py-0.5 rounded-full">NOW</span>
                )}
                {block.skippable && block.locked && onSkipBlock && block.blockId && (
                  <button
                    onClick={() => onSkipBlock(block.blockId!)}
                    className="ml-auto flex-shrink-0 text-[9px] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                  >
                    skip
                  </button>
                )}
              </div>
              {height > 40 && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  {fmt12(block.start)} – {fmt12(block.end)}
                </span>
              )}
              {/* Tasks in this block — limit based on available space */}
              {(() => {
                // Each task row is ~18px. Header is ~24px, time label ~14px.
                const headerPx = 24 + (height > 40 ? 14 : 0)
                const maxTasks = Math.max(0, Math.floor((Math.max(height, 28) - headerPx) / 18))
                const visible = blockTasks.slice(0, maxTasks)
                const remaining = blockTasks.length - visible.length
                return (
                  <>
                    {visible.map(t => (
                      <div key={t.id} className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CAT_COLORS[t.category] || '#666' }} />
                        <span className={cn(
                          'text-[10px] truncate',
                          t.status === 'done' && 'line-through text-[var(--text-muted)]'
                        )}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {remaining > 0 && (
                      <span className="text-[9px] text-[var(--text-muted)] mt-0.5">+{remaining} more</span>
                    )}
                  </>
                )
              })()}
            </motion.div>
          )
        })}

        {/* Current time indicator */}
        {showNow && (
          <div className="timeline-now-line" style={{ top: nowY }} />
        )}
      </div>
    </div>
  )
}
