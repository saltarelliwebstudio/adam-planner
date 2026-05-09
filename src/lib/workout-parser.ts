// Voice transcript → structured workout entry parser
// Pure client-side, no API calls

export interface WorkoutEntry {
  exercise: string
  reps: number
  date: string        // YYYY-MM-DD
  side?: 'left' | 'right'
  vestWeight?: number  // pounds
  notes?: string
}

// Aliases sorted longest-first within each group to avoid partial matches
const EXERCISE_MAP: [string[], string][] = [
  [['one arm negative chin up', 'one arm negative', 'one arm negatives', 'one arm', 'negatives'], 'One-arm negative'],
  [['close grip chin up', 'close grip chin ups', 'chin ups', 'chin up', 'chinups', 'chinup', 'chins', 'pull ups', 'pull up', 'pullups'], 'Close-grip chin-up'],
  [['weighted dips', 'weighted dip', 'dips', 'dip'], 'Weighted dip'],
  [['pike push up', 'pike pushup', 'pike pushups', 'pike push ups', 'shoulder pushup', 'shoulder push up', 'pike'], 'Pike push-up'],
  [['hanging leg raise', 'hanging leg raises', 'toes to bar', 'toe to bar', 'ttb'], 'Toes-to-bar'],
  [['hanging knee raise', 'hanging knee raises', 'hanging knee', 'knee raises', 'knee raise'], 'Hanging knee raise'],
  [['single leg squat', 'single leg squats', 'pistol squats', 'pistol squat', 'pistol', 'pistols'], 'Pistol squat'],
]

// Word numbers the Web Speech API might output instead of digits
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
}

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function wordToNumber(text: string): number | null {
  const words = text.toLowerCase().split(/[\s-]+/)
  if (words.length === 1) return WORD_NUMBERS[words[0]] ?? null
  if (words.length === 2) {
    const tens = WORD_NUMBERS[words[0]]
    const ones = WORD_NUMBERS[words[1]]
    if (tens && ones && tens >= 20) return tens + ones
  }
  return null
}

function torontoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function parseDate(text: string): string {
  const lower = text.toLowerCase()

  if (/\btoday\b/.test(lower)) return torontoToday()

  if (/\byesterday\b/.test(lower)) {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }))
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }

  // "April 22" or "Apr 22"
  const monthDay = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/)
  if (monthDay) {
    const month = MONTH_MAP[monthDay[1]]
    const day = parseInt(monthDay[2], 10)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }))
    const year = now.getFullYear()
    const d = new Date(year, month, day)
    return d.toISOString().split('T')[0]
  }

  return torontoToday()
}

function parseReps(text: string): number | null {
  // Try digit form first: "21 reps"
  const digitMatch = text.match(/(\d+)\s*reps?/i)
  if (digitMatch) return parseInt(digitMatch[1], 10)

  // Try word form: "twenty one reps"
  const wordMatch = text.match(/([\w]+(?:\s+[\w]+)?)\s+reps?/i)
  if (wordMatch) {
    const n = wordToNumber(wordMatch[1])
    if (n) return n
  }

  // Standalone number if only one number in transcript
  const allNums = text.match(/\b\d+\b/g)
  if (allNums && allNums.length === 1) return parseInt(allNums[0], 10)

  return null
}

function parseExercise(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [aliases, canonical] of EXERCISE_MAP) {
    for (const alias of aliases) {
      if (lower.includes(alias)) return canonical
    }
  }
  return null
}

export function parseWorkout(transcript: string): WorkoutEntry | null {
  const exercise = parseExercise(transcript)
  const reps = parseReps(transcript)

  if (!exercise || !reps) return null

  const date = parseDate(transcript)

  const sideMatch = transcript.match(/\b(left|right)\b/i)
  const side = sideMatch ? (sideMatch[1].toLowerCase() as 'left' | 'right') : undefined

  const weightMatch = transcript.match(/(\d+)\s*(?:pounds?|lbs?|pound)/i)
  const vestWeight = weightMatch ? parseInt(weightMatch[1], 10) : undefined

  return { exercise, reps, date, side, vestWeight }
}
