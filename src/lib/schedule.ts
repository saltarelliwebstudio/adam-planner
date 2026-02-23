import { TimeBlock } from './types'

// Adam's locked schedule
export const DEFAULT_SCHEDULE: TimeBlock[] = [
  // MONDAY (1)
  { id: 'mon-followup', start: '06:30', end: '06:50', label: 'Follow-up leads', emoji: '📞', locked: true, dayOfWeek: 1 },
  { id: 'mon-morning', start: '06:50', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 1 },
  { id: 'mon-school', start: '08:00', end: '11:00', label: 'School', emoji: '🏫', locked: true, dayOfWeek: 1 },
  { id: 'mon-free', start: '11:00', end: '19:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 1 },
  { id: 'mon-genius', start: '19:00', end: '20:30', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 1 },
  { id: 'mon-ariana', start: '20:30', end: '22:30', label: 'Ariana', emoji: '💛', locked: true, dayOfWeek: 1 },
  { id: 'mon-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 1 },

  // TUESDAY (2)
  { id: 'tue-morning', start: '06:30', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 2 },
  { id: 'tue-school', start: '08:00', end: '11:00', label: 'School', emoji: '🏫', locked: true, dayOfWeek: 2 },
  { id: 'tue-free', start: '11:00', end: '16:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 2 },
  { id: 'tue-mike', start: '16:00', end: '17:00', label: 'Mike Minter Workout', emoji: '💪', locked: true, dayOfWeek: 2 },
  { id: 'tue-genius', start: '17:00', end: '21:00', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 2 },
  { id: 'tue-wind', start: '21:00', end: '22:30', label: 'Wind down / light tasks', emoji: '🌙', locked: false, dayOfWeek: 2 },
  { id: 'tue-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 2 },

  // WEDNESDAY (3)
  { id: 'wed-morning', start: '06:30', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 3 },
  { id: 'wed-school', start: '08:00', end: '11:00', label: 'School', emoji: '🏫', locked: true, dayOfWeek: 3 },
  { id: 'wed-free', start: '11:00', end: '19:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 3 },
  { id: 'wed-genius', start: '19:00', end: '21:00', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 3 },
  { id: 'wed-wind', start: '21:00', end: '22:30', label: 'Wind down / light tasks', emoji: '🌙', locked: false, dayOfWeek: 3 },
  { id: 'wed-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 3 },

  // THURSDAY (4)
  { id: 'thu-followup', start: '06:30', end: '06:50', label: 'Follow-up leads', emoji: '📞', locked: true, dayOfWeek: 4 },
  { id: 'thu-morning', start: '06:50', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 4 },
  { id: 'thu-school', start: '08:00', end: '11:00', label: 'School', emoji: '🏫', locked: true, dayOfWeek: 4 },
  { id: 'thu-free', start: '11:00', end: '17:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 4 },
  { id: 'thu-genius', start: '17:00', end: '21:00', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 4 },
  { id: 'thu-wind', start: '21:00', end: '22:30', label: 'Wind down / light tasks', emoji: '🌙', locked: false, dayOfWeek: 4 },
  { id: 'thu-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 4 },

  // FRIDAY (5)
  { id: 'fri-morning', start: '06:30', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 5 },
  { id: 'fri-school', start: '08:00', end: '11:00', label: 'School', emoji: '🏫', locked: true, dayOfWeek: 5 },
  { id: 'fri-free', start: '11:00', end: '19:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 5 },
  { id: 'fri-genius', start: '19:00', end: '20:30', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 5 },
  { id: 'fri-free2', start: '20:30', end: '22:30', label: 'Free', emoji: '⬜', locked: false, dayOfWeek: 5 },
  { id: 'fri-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 5 },

  // SATURDAY (6)
  { id: 'sat-free1', start: '06:30', end: '11:30', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 6 },
  { id: 'sat-genius', start: '11:30', end: '13:00', label: 'Genius', emoji: '🥋', locked: true, dayOfWeek: 6 },
  { id: 'sat-free2', start: '13:00', end: '22:30', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 6 },
  { id: 'sat-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 6 },

  // SUNDAY (0)
  { id: 'sun-morning', start: '06:30', end: '08:00', label: 'Morning routine', emoji: '🙏', locked: true, dayOfWeek: 0 },
  { id: 'sun-finance', start: '08:00', end: '09:00', label: 'Financial log', emoji: '💰', locked: true, dayOfWeek: 0 },
  { id: 'sun-review', start: '09:00', end: '09:30', label: 'Week review', emoji: '📋', locked: true, dayOfWeek: 0 },
  { id: 'sun-plan', start: '09:30', end: '10:00', label: 'Build next week schedule', emoji: '📆', locked: true, dayOfWeek: 0 },
  { id: 'sun-free', start: '10:00', end: '22:00', label: 'Free — fill from tasks', emoji: '⬜', locked: false, dayOfWeek: 0 },
  { id: 'sun-reset', start: '22:00', end: '22:30', label: 'Weekly reset — brain dump', emoji: '🔁', locked: true, dayOfWeek: 0 },
  { id: 'sun-sleep', start: '22:30', end: '23:59', label: 'Sleep', emoji: '😴', locked: true, dayOfWeek: 0 },
]

export function getBlocksForDay(dayOfWeek: number): TimeBlock[] {
  return DEFAULT_SCHEDULE.filter(b => b.dayOfWeek === dayOfWeek).sort((a, b) => a.start.localeCompare(b.start))
}

export function getFreeHours(dayOfWeek: number): number {
  const blocks = getBlocksForDay(dayOfWeek).filter(b => !b.locked)
  return blocks.reduce((sum, b) => {
    const [sh, sm] = b.start.split(':').map(Number)
    const [eh, em] = b.end.split(':').map(Number)
    return sum + (eh + em / 60) - (sh + sm / 60)
  }, 0)
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
