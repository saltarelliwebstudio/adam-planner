// Read workout entries from Notion Brain DB and parse into structured data

import { parseWorkout, type WorkoutEntry } from './workout-parser'

const NOTION_API_KEY = process.env.NOTION_API_KEY || ''
const NOTION_BRAIN_DB = process.env.NOTION_BRAIN_DB || '6e55e3eae22e407bb5a3cbc7997399a5'

async function notionRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Notion API ${path} failed: ${res.status} — ${text}`)
  }
  return res.json()
}

export interface WorkoutRow {
  id: string
  exercise: string
  reps: number
  date: string
  side?: 'left' | 'right'
  vestWeight?: number
  notes?: string
  rawName: string
}

export async function getWorkoutEntries(limit = 200): Promise<WorkoutRow[]> {
  if (!NOTION_API_KEY) return []

  // Query Brain for Training/Health domain entries — the parser filters non-workouts
  // This way Adam just speaks naturally, no special tags needed
  const data = await notionRequest('POST', `/databases/${NOTION_BRAIN_DB}/query`, {
    filter: {
      and: [
        { property: 'Status', select: { equals: 'Active' } },
        {
          or: [
            { property: 'Domain', select: { equals: 'Training' } },
            { property: 'Tags', multi_select: { contains: 'workout' } },
            { property: 'Tags', multi_select: { contains: 'strength' } },
            { property: 'Tags', multi_select: { contains: 'calisthenics' } },
          ],
        },
        // Exclude weekly syntheses and references
        { property: 'Type', select: { does_not_equal: 'Reference' } },
      ],
    },
    sorts: [{ property: 'Date Added', direction: 'descending' }],
    page_size: limit,
  })

  const rows: WorkoutRow[] = []

  for (const page of data.results || []) {
    const props = page.properties || {}
    const name = props.Name?.title?.[0]?.plain_text || ''
    const fullNote = props['Full Note']?.rich_text?.[0]?.plain_text || ''
    const dateAdded = props['Date Added']?.date?.start || page.created_time?.split('T')[0] || ''

    // Try to parse the name + note as a workout entry
    const text = `${name} ${fullNote}`.trim()
    const parsed = parseWorkout(text)

    // Only include entries that actually parse as workouts (exercise + reps)
    if (parsed && parsed.reps > 0) {
      rows.push({
        id: page.id,
        exercise: parsed.exercise,
        reps: parsed.reps,
        // Use the parsed date if it differs from today (meaning the user specified a date),
        // otherwise use the Brain entry's Date Added
        date: parsed.date !== todayStr() ? parsed.date : dateAdded,
        side: parsed.side,
        vestWeight: parsed.vestWeight,
        notes: parsed.notes,
        rawName: name,
      })
    }
  }

  return rows
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}
