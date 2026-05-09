import { createClient } from '@supabase/supabase-js'

const HUB_URL = process.env.HUB_SUPABASE_URL
const HUB_KEY = process.env.HUB_SUPABASE_SERVICE_KEY

if (!HUB_URL || !HUB_KEY) {
  console.warn('⚠️ HUB_SUPABASE_URL or HUB_SUPABASE_SERVICE_KEY not set — CRM features disabled')
}

const hub = HUB_URL && HUB_KEY ? createClient(HUB_URL, HUB_KEY) : null

export function getHubClient() {
  if (!hub) throw new Error('Saltarelli Hub Supabase not configured')
  return hub
}

// ── Lead queries ──

export async function getLeadCounts() {
  const db = getHubClient()
  const { data, error } = await db
    .from('admin_leads')
    .select('status, drip_active')

  if (error) throw error

  const counts: Record<string, number> = {}
  let activeDrips = 0

  for (const lead of data || []) {
    counts[lead.status] = (counts[lead.status] || 0) + 1
    if (lead.drip_active) activeDrips++
  }

  return { counts, total: data?.length || 0, activeDrips }
}

export async function searchLead(name: string) {
  const db = getHubClient()
  const { data, error } = await db
    .from('admin_leads')
    .select('*')
    .ilike('name', `%${name}%`)
    .limit(5)

  if (error) throw error
  return data || []
}

export async function getFollowupsDue() {
  const db = getHubClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

  // Leads with next_followup_date <= today, or last_contacted_date > 7 days ago
  const { data, error } = await db
    .from('admin_leads')
    .select('name, business_name, status, phone, next_followup_date, last_contacted_date, drip_step')
    .or(`next_followup_date.lte.${today},last_contacted_date.is.null`)
    .not('status', 'in', '("closed","client","do_not_contact")')
    .order('next_followup_date', { ascending: true, nullsFirst: true })
    .limit(10)

  if (error) throw error
  return data || []
}

export async function pauseLeadDrip(name: string) {
  const db = getHubClient()

  // Find the lead first
  const { data: leads, error: findError } = await db
    .from('admin_leads')
    .select('id, name, drip_active')
    .ilike('name', `%${name}%`)
    .limit(1)

  if (findError) throw findError
  if (!leads || leads.length === 0) return null

  const lead = leads[0]
  const { error } = await db
    .from('admin_leads')
    .update({ drip_active: false, drip_paused_at: new Date().toISOString() })
    .eq('id', lead.id)

  if (error) throw error
  return lead
}

export async function addLead(name: string, phone: string) {
  const db = getHubClient()
  const { data, error } = await db
    .from('admin_leads')
    .insert({ name, phone, status: 'cold', drip_active: true })
    .select()
    .single()

  if (error) throw error
  return data
}

export interface BrainLeadInput {
  name: string
  business_name?: string | null
  phone?: string | null
  email?: string | null
  service_interest: string
  notes: string
}

export async function findLeadByBusinessName(businessName: string) {
  const db = getHubClient()
  const { data, error } = await db
    .from('admin_leads')
    .select('id, notes')
    .ilike('business_name', businessName)
    .limit(1)

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

export async function addLeadFromBrain(input: BrainLeadInput) {
  const db = getHubClient()
  const { data, error } = await db
    .from('admin_leads')
    .insert({
      name: input.name,
      business_name: input.business_name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: 'meta_glasses',
      service_interest: input.service_interest,
      notes: input.notes,
      status: 'cold',
      drip_active: false,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function appendLeadNote(leadId: string, existingNotes: string | null, addition: string) {
  const db = getHubClient()
  const combined = existingNotes ? `${existingNotes}\n${addition}` : addition
  const { error } = await db
    .from('admin_leads')
    .update({ notes: combined })
    .eq('id', leadId)

  if (error) throw error
}

export async function getRecentDripFailures() {
  const db = getHubClient()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('sms_drip_log')
    .select('lead_id, step, error_message, sent_at')
    .eq('status', 'failed')
    .gte('sent_at', yesterday)
    .order('sent_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getRecentReplies() {
  const db = getHubClient()

  const { data, error } = await db
    .from('admin_leads')
    .select('name, business_name, status, last_contacted_date')
    .eq('status', 'replied')
    .order('last_contacted_date', { ascending: false })
    .limit(5)

  if (error) throw error
  return data || []
}
