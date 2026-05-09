import * as api from '../lib/planner-api.js'

export async function handleAddTask(title: string, scheduledDate: string, priority?: string, category?: string): Promise<string> {
  await api.addTask(title, scheduledDate, priority, category)
  const pEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡'
  return `✅ Added task: ${pEmoji} *${title}*\n📅 Scheduled for ${scheduledDate}`
}

export async function handleCompleteTask(taskTitle: string, scheduleData: any): Promise<string> {
  const allTasks = [...(scheduleData.tasks?.todo || []), ...(scheduleData.tasks?.overdue || [])]
  const task = allTasks.find((t: any) =>
    t.title.toLowerCase().includes(taskTitle.toLowerCase())
  )

  if (!task) {
    return `❌ Couldn't find a task matching "${taskTitle}".`
  }

  if (!task.id) {
    return `❌ Found *${task.title}* but it has no ID — can't mark it complete.`
  }

  await api.completeTask(task.id)

  // Check for remaining tasks
  const remaining = allTasks.filter((t: any) => t.title !== task.title)
  if (remaining.length > 0) {
    return `✅ *${task.title}* — done!\n\n${remaining.length} task(s) remaining. Next up: ${remaining[0].title}`
  }

  return `✅ *${task.title}* — done! 🎉 All tasks complete.`
}

export async function handleMoveTask(taskTitle: string, scheduledDate: string, scheduleData: any): Promise<string> {
  const allTasks = [...(scheduleData.tasks?.todo || []), ...(scheduleData.tasks?.overdue || [])]
  const task = allTasks.find((t: any) =>
    t.title.toLowerCase().includes(taskTitle.toLowerCase())
  )

  if (!task) {
    return `❌ Couldn't find a task matching "${taskTitle}".`
  }

  if (!task.id) {
    return `❌ Found *${task.title}* but it has no ID — can't move it.`
  }

  await api.moveTask(task.id, scheduledDate)
  return `📅 Moved *${task.title}* to ${scheduledDate}`
}
