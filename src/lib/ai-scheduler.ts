import { ResolvedBlock } from './types'
import { Task } from './types'

export interface ScheduleProposal {
  assignments: {
    taskId: string
    taskTitle: string
    suggestedTime: string // HH:MM
    blockLabel: string
    reason: string
  }[]
  skips: {
    blockId: string
    blockLabel: string
    reason: string
  }[]
  adhocBlocks: {
    label: string
    startTime: string
    endTime: string
    emoji: string
    reason: string
  }[]
  summary: string
}

export function buildScheduleContext(
  date: string,
  blocks: ResolvedBlock[],
  tasks: Task[],
  constraints?: string
): string {
  const dayTasks = tasks.filter(t => t.scheduledDate === date && t.status !== 'done')
  const overdue = tasks.filter(t => t.scheduledDate < date && t.status !== 'done')

  const lines = [
    `Date: ${date}`,
    '',
    'Current schedule blocks:',
    ...blocks.map(b => `  ${b.start}-${b.end}: ${b.emoji} ${b.label} (${b.locked ? 'locked' : 'free'}${b.skippable ? ', skippable' : ''})`),
    '',
    `Tasks for today (${dayTasks.length}):`,
    ...dayTasks.map(t => `  [${t.priority}] ${t.title} (${t.category})${t.scheduledTime ? ` @ ${t.scheduledTime}` : ''}`),
  ]

  if (overdue.length > 0) {
    lines.push('', `Overdue tasks (${overdue.length}):`)
    overdue.slice(0, 10).forEach(t => {
      lines.push(`  [${t.priority}] ${t.title} (since ${t.scheduledDate})`)
    })
  }

  if (constraints) {
    lines.push('', `User constraints: ${constraints}`)
  }

  return lines.join('\n')
}

export function buildRebuildPrompt(context: string): string {
  return `You are Adam's AI scheduling assistant. Rebuild his day optimally.

${context}

Rules:
1. NEVER move locked, non-skippable blocks (Sleep, etc.)
2. High-priority tasks should be scheduled in the most productive time slots
3. Overdue tasks should be fitted in if possible
4. Group similar categories together when possible
5. Leave some buffer between blocks
6. If the user gave constraints, respect them strictly

Respond with JSON only:
{
  "assignments": [
    { "taskId": "...", "taskTitle": "...", "suggestedTime": "HH:MM", "blockLabel": "name of the free block", "reason": "..." }
  ],
  "skips": [
    { "blockId": "...", "blockLabel": "...", "reason": "..." }
  ],
  "adhocBlocks": [
    { "label": "...", "startTime": "HH:MM", "endTime": "HH:MM", "emoji": "...", "reason": "..." }
  ],
  "summary": "One sentence describing the optimized schedule"
}`
}
