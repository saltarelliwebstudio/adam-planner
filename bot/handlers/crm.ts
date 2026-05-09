import {
  getLeadCounts,
  searchLead,
  getFollowupsDue,
  pauseLeadDrip,
  addLead,
  getRecentDripFailures,
  getRecentReplies,
} from '../lib/hub-supabase.js'

export async function handleCrmStatus(): Promise<string> {
  const { counts, total, activeDrips } = await getLeadCounts()
  const failures = await getRecentDripFailures()
  const replies = await getRecentReplies()

  const lines = [
    '📊 *CRM Pipeline*',
    `Total leads: *${total}*`,
    '',
  ]

  // Status breakdown
  const statusEmoji: Record<string, string> = {
    cold: '🧊', warm: '🟡', hot: '🔥', replied: '💬',
    followed_up: '📞', demo_booked: '📅', closed: '🤝',
    client: '⭐', do_not_contact: '🚫',
  }
  for (const [status, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${statusEmoji[status] || '•'} ${status}: ${count}`)
  }

  lines.push('')
  lines.push(`📱 *Active drips:* ${activeDrips}`)

  if (failures.length > 0) {
    lines.push(`⚠️ *${failures.length} SMS failure(s) in last 24h*`)
  }

  if (replies.length > 0) {
    lines.push('')
    lines.push('💬 *Recent replies:*')
    for (const r of replies) {
      lines.push(`  • ${r.name}${r.business_name ? ` (${r.business_name})` : ''}`)
    }
  }

  return lines.join('\n')
}

export async function handleLeadDetail(name: string): Promise<string> {
  const leads = await searchLead(name)

  if (leads.length === 0) {
    return `No leads found matching "${name}".`
  }

  const lines: string[] = []

  for (const lead of leads) {
    lines.push(`👤 *${lead.name}*${lead.business_name ? ` — ${lead.business_name}` : ''}`)
    lines.push(`  Status: ${lead.status}`)
    if (lead.phone) lines.push(`  Phone: ${lead.phone}`)
    if (lead.email) lines.push(`  Email: ${lead.email}`)
    if (lead.source) lines.push(`  Source: ${lead.source}`)
    if (lead.service_interest) lines.push(`  Interest: ${lead.service_interest}`)
    lines.push(`  Drip: ${lead.drip_active ? `active (step ${lead.drip_step})` : 'off'}`)
    if (lead.last_contacted_date) lines.push(`  Last contact: ${lead.last_contacted_date}`)
    if (lead.next_followup_date) lines.push(`  Next followup: ${lead.next_followup_date}`)
    if (lead.notes) {
      const shortNotes = lead.notes.length > 100 ? lead.notes.slice(0, 100) + '...' : lead.notes
      lines.push(`  Notes: ${shortNotes}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export async function handleFollowupsDue(): Promise<string> {
  const leads = await getFollowupsDue()

  if (leads.length === 0) {
    return '✅ No follow-ups due right now.'
  }

  const lines = [`📞 *${leads.length} lead(s) need follow-up:*`, '']

  for (const lead of leads) {
    const due = lead.next_followup_date || 'no date set'
    lines.push(`  • *${lead.name}*${lead.business_name ? ` (${lead.business_name})` : ''} — ${lead.status}`)
    lines.push(`    Follow-up: ${due} | Drip step: ${lead.drip_step}`)
  }

  return lines.join('\n')
}

export async function handlePauseDrip(name: string): Promise<string> {
  const lead = await pauseLeadDrip(name)

  if (!lead) {
    return `No lead found matching "${name}".`
  }

  if (!lead.drip_active) {
    return `⏸ Drip was already paused for *${lead.name}*.`
  }

  return `⏸ Drip paused for *${lead.name}*.`
}

export async function handleAddLead(name: string, phone: string): Promise<string> {
  const lead = await addLead(name, phone)
  return `✅ Lead added: *${lead.name}* (${lead.phone}) — drip will start automatically.`
}
