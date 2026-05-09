import { getNewInboxItems, markInboxProcessed, createBrainEntry } from '../lib/notion.js'
import { classifyInboxItem } from '../lib/claude.js'
import {
  findLeadByBusinessName,
  addLeadFromBrain,
  appendLeadNote,
} from '../lib/hub-supabase.js'

export interface InboxLike {
  id: string
  title: string
}

export interface LeadExtractionSummary {
  newLeads: string[]
  reSeen: string[]
  errors: string[]
}

export interface LeadExtractionResult {
  leadItemIds: Set<string>
  summary: LeadExtractionSummary
}

export async function extractLeadsFromInbox(items: InboxLike[]): Promise<LeadExtractionResult> {
  const summary: LeadExtractionSummary = { newLeads: [], reSeen: [], errors: [] }
  const leadItemIds = new Set<string>()

  for (const item of items) {
    try {
      const classification = await classifyInboxItem(item.title)

      if (!classification.is_lead || !classification.lead) continue

      const lead = classification.lead
      const businessKey = lead.business_name || lead.name

      const brainPageId = await createBrainEntry({
        name: classification.brain.name,
        domain: classification.brain.domain,
        type: classification.brain.type,
        source: classification.brain.source,
        tags: classification.brain.tags,
        fullNote: classification.brain.full_note,
        inboxPageId: item.id,
      })

      try {
        const existing = businessKey ? await findLeadByBusinessName(businessKey) : null

        if (existing) {
          const today = new Date().toISOString().slice(0, 10)
          await appendLeadNote(existing.id, existing.notes, `↻ re-seen ${today}: ${lead.notes}`)
          summary.reSeen.push(businessKey)
        } else {
          await addLeadFromBrain({
            name: lead.name,
            business_name: lead.business_name,
            phone: lead.phone,
            email: lead.email,
            service_interest: lead.service_interest,
            notes: lead.notes,
          })
          summary.newLeads.push(businessKey)
        }
      } catch (hubErr) {
        const msg = hubErr instanceof Error ? hubErr.message : String(hubErr)
        summary.errors.push(`lead sync "${businessKey}": ${msg}`)
      }

      await markInboxProcessed(item.id, brainPageId)
      leadItemIds.add(item.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      summary.errors.push(`"${item.title.slice(0, 40)}": ${message}`)
    }
  }

  return { leadItemIds, summary }
}

export function formatLeadSummary(s: LeadExtractionSummary): string | null {
  const hasAny = s.newLeads.length > 0 || s.reSeen.length > 0 || s.errors.length > 0
  if (!hasAny) return null

  const lines: string[] = []
  if (s.newLeads.length > 0) {
    lines.push(`🎯 *${s.newLeads.length} new lead(s) → CRM:* ${s.newLeads.join(', ')}`)
  }
  if (s.reSeen.length > 0) {
    lines.push(`↻ *${s.reSeen.length} re-seen:* ${s.reSeen.join(', ')}`)
  }
  if (s.errors.length > 0) {
    lines.push(`⚠️ ${s.errors.length} lead sync error(s)`)
    for (const e of s.errors.slice(0, 3)) lines.push(`  • ${e}`)
  }
  return lines.join('\n')
}

export async function processBrainInbox(): Promise<string> {
  const items = await getNewInboxItems()
  if (items.length === 0) {
    return '🧠 *Brain processor*\nNo new Inbox items.'
  }

  const { leadItemIds, summary } = await extractLeadsFromInbox(items)
  const leadLine = formatLeadSummary(summary) ?? '• 0 leads found'
  return `🧠 *Brain processor*\nScanned ${items.length}, extracted ${leadItemIds.size}.\n${leadLine}`
}
