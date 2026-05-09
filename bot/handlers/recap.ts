import * as api from '../lib/planner-api.js'

export async function weeklyRecap(): Promise<string> {
  const data = await api.getRecap()
  return data.telegramMessage || '📊 No recap data available for this week.'
}
