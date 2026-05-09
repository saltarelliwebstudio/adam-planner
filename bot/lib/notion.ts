const NOTION_API_KEY = process.env.NOTION_API_KEY || ''
const NOTION_INBOX_DB = process.env.NOTION_INBOX_DB || 'c739185778e54dd7836615b63a17b74f'
const NOTION_BRAIN_DB = process.env.NOTION_BRAIN_DB || '6e55e3eae22e407bb5a3cbc7997399a5'

interface InboxItem {
  id: string
  title: string
  status: string
  created: string
}

export interface BrainEntryInput {
  name: string
  domain: string
  type: string
  source: string
  tags: string[]
  fullNote: string
  inboxPageId?: string
}

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
  if (!res.ok) throw new Error(`Notion API ${path} failed: ${res.status}`)
  return res.json()
}

export function isNotionConfigured(): boolean {
  return NOTION_API_KEY.length > 0
}

export async function getNewInboxItems(): Promise<InboxItem[]> {
  if (!NOTION_API_KEY) return []

  const data = await notionRequest('POST', `/databases/${NOTION_INBOX_DB}/query`, {
    filter: {
      or: [
        { property: 'Status', status: { equals: 'New' } },
        { property: 'Status', status: { is_empty: true } },
      ],
    },
    sorts: [{ property: 'Created', direction: 'ascending' }],
  })

  return (data.results || []).map((page: any) => ({
    id: page.id,
    title: page.properties?.Capture?.title?.[0]?.plain_text || page.properties?.Name?.title?.[0]?.plain_text || 'Untitled',
    status: page.properties?.Status?.status?.name || 'New',
    created: page.created_time,
  }))
}

export async function markInboxProcessed(pageId: string, brainPageId?: string): Promise<void> {
  if (!NOTION_API_KEY) return

  const properties: Record<string, unknown> = {
    Status: { status: { name: 'Processed' } },
  }
  if (brainPageId) {
    properties['Brain Entry'] = { relation: [{ id: brainPageId }] }
  }

  await notionRequest('PATCH', `/pages/${pageId}`, { properties })
}

export async function createBrainEntry(input: BrainEntryInput): Promise<string> {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY not set')

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: input.name.slice(0, 200) } }] },
    Domain: { select: { name: input.domain } },
    Type: { select: { name: input.type } },
    Source: { select: { name: input.source } },
    Status: { select: { name: 'Active' } },
    Tags: { multi_select: input.tags.slice(0, 10).map((t) => ({ name: t })) },
    'Full Note': { rich_text: [{ text: { content: input.fullNote.slice(0, 2000) } }] },
    'Date Added': { date: { start: new Date().toISOString().slice(0, 10) } },
  }
  if (input.inboxPageId) {
    properties['Inbox Link'] = { relation: [{ id: input.inboxPageId }] }
  }

  const data = await notionRequest('POST', '/pages', {
    parent: { database_id: NOTION_BRAIN_DB },
    properties,
  })

  return data.id as string
}
