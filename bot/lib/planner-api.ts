const API_URL = process.env.PLANNER_API_URL || 'https://adam-planner.vercel.app'
const API_SECRET = process.env.PLANNER_API_SECRET || ''

async function apiGet(path: string, params?: Record<string, string>) {
  const url = new URL(path, API_URL)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { 'x-api-secret': API_SECRET },
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'x-api-secret': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Schedule ──

export async function getSchedule(date?: string) {
  return apiGet('/api/schedule', date ? { date } : undefined)
}

export async function skipBlock(blockId: string, date: string) {
  return apiPost('/api/schedule/mutate', { action: 'skip_block', blockId, date })
}

export async function addAdhocBlock(date: string, label: string, startTime: string, endTime: string, emoji?: string) {
  return apiPost('/api/schedule/mutate', { action: 'add_adhoc', date, label, startTime, endTime, emoji })
}

export async function moveBlock(blockId: string, date: string, startTime: string, endTime: string) {
  return apiPost('/api/schedule/mutate', { action: 'move_block', blockId, date, startTime, endTime })
}

// ── Tasks ──

export async function addTask(title: string, scheduledDate: string, priority?: string, category?: string) {
  return apiPost('/api/tasks/mutate', { action: 'add', title, scheduledDate, priority, category })
}

export async function completeTask(taskId: string) {
  return apiPost('/api/tasks/mutate', { action: 'complete', taskId })
}

export async function moveTask(taskId: string, scheduledDate: string) {
  return apiPost('/api/tasks/mutate', { action: 'move', taskId, scheduledDate })
}

export async function deleteTask(taskId: string) {
  return apiPost('/api/tasks/mutate', { action: 'delete', taskId })
}

// ── Recap ──

export async function getRecap(weekStart?: string) {
  return apiGet('/api/recap', weekStart ? { week: weekStart } : undefined)
}

// ── Calendar ──

export async function getCalendarEvents(date?: string) {
  return apiGet('/api/gcal-proxy', date ? { date } : undefined)
}

// ── Rebuild Day ──

export async function rebuildDay(date: string, constraints?: string) {
  return apiPost('/api/rebuild-day', { date, constraints })
}
