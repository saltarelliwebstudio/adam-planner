import { createClient } from '@supabase/supabase-js'

const API_URL = process.env.PLANNER_API_URL || 'https://adam-planner.vercel.app'
const API_SECRET = process.env.PLANNER_API_SECRET || ''

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'x-api-secret': API_SECRET },
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

async function apiPatch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'x-api-secret': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

export async function handleDevQueueAdd(description: string, project?: string): Promise<string> {
  // Post to the API route which inserts into Supabase
  const res = await fetch(`${API_URL}/api/dev-queue`, {
    method: 'POST',
    headers: {
      'x-api-secret': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description, project }),
  })
  if (!res.ok) throw new Error(`Dev queue POST failed: ${res.status}`)
  const data = await res.json()

  const proj = project ? ` (${project})` : ''
  return `🛠 *Queued for dev:*${proj}\n"${description}"\n\nID: \`${data.id}\`\nProcess it when you open your laptop.`
}

export async function handleDevQueueStatus(): Promise<string> {
  const data = await apiGet('/api/dev-queue')

  if (!data.tasks || data.tasks.length === 0) {
    return '✅ Dev queue is empty — nothing pending.'
  }

  const lines = [`🛠 *Dev Queue (${data.tasks.length} pending):*`, '']

  for (const task of data.tasks) {
    const proj = task.project ? ` [${task.project}]` : ''
    const age = timeSince(new Date(task.created_at))
    const statusIcon = task.status === 'in_progress' ? '🔄' : '⏳'
    lines.push(`${statusIcon}${proj} ${task.description}`)
    lines.push(`   _${age} ago — ${task.priority}_`)
  }

  return lines.join('\n')
}

function timeSince(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
