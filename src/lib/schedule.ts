import { TimeBlock, ResolvedBlock } from './types'
import {
  getResolvedSchedule as _getResolvedSchedule,
  getFreeHoursForDate,
  getBlocksForDayOfWeek,
} from './schedule-store'

// ── Backward-compatible wrappers ──
// These functions maintain the same interface as before so existing
// code (page.tsx, WeekGrid, etc.) continues to work.

/** Get resolved blocks for a specific date (DB-driven with overrides) */
export function getResolvedSchedule(date: string): ResolvedBlock[] {
  return _getResolvedSchedule(date)
}

/** Get blocks for a day-of-week (recurring only, no overrides) */
export function getBlocksForDay(dayOfWeek: number): TimeBlock[] {
  return getBlocksForDayOfWeek(dayOfWeek).map(b => ({
    id: b.id,
    start: b.startTime,
    end: b.endTime,
    label: b.label,
    emoji: b.emoji,
    locked: b.locked,
    dayOfWeek: b.dayOfWeek,
  }))
}

/** Get free hours for a specific date (respects overrides) */
export function getFreeHours(dateOrDow: string | number): number {
  if (typeof dateOrDow === 'number') {
    // Legacy: day-of-week — use today's date for that dow
    // This path is used when no specific date is available
    const blocks = getBlocksForDay(dateOrDow).filter(b => !b.locked)
    return blocks.reduce((sum, b) => {
      const [sh, sm] = b.start.split(':').map(Number)
      const [eh, em] = b.end.split(':').map(Number)
      return sum + (eh + em / 60) - (sh + sm / 60)
    }, 0)
  }
  return getFreeHoursForDate(dateOrDow)
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
