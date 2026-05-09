const NOTION_API_KEY = process.env.NOTION_API_KEY || ''
const NOTION_BRAIN_DB = process.env.NOTION_BRAIN_DB || '6e55e3eae22e407bb5a3cbc7997399a5'

export interface BrainEntry {
  id: string
  name: string
  domain: string
  type: string
  source: string
  dateAdded: string
  tags: string[]
  status: string
  fullNote: string
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

function extractEntry(page: any): BrainEntry {
  const props = page.properties || {}
  return {
    id: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Untitled',
    domain: props.Domain?.select?.name || '',
    type: props.Type?.select?.name || '',
    source: props.Source?.select?.name || '',
    dateAdded: props['Date Added']?.date?.start || page.created_time?.split('T')[0] || '',
    tags: (props.Tags?.multi_select || []).map((t: any) => t.name),
    status: props.Status?.select?.name || '',
    fullNote: props['Full Note']?.rich_text?.[0]?.plain_text || '',
  }
}

export async function getBrainEntries(options?: {
  domain?: string
  type?: string
  tag?: string
  limit?: number
  synthesesOnly?: boolean
}): Promise<BrainEntry[]> {
  if (!NOTION_API_KEY) return []

  const filters: any[] = [
    { property: 'Status', select: { equals: 'Active' } },
  ]

  if (options?.domain) {
    filters.push({ property: 'Domain', select: { equals: options.domain } })
  }
  if (options?.type) {
    filters.push({ property: 'Type', select: { equals: options.type } })
  }
  if (options?.tag) {
    filters.push({ property: 'Tags', multi_select: { contains: options.tag } })
  }
  if (options?.synthesesOnly) {
    filters.push({ property: 'Type', select: { equals: 'Reference' } })
    filters.push({ property: 'Tags', multi_select: { contains: 'weekly-synthesis' } })
  }

  const data = await notionRequest('POST', `/databases/${NOTION_BRAIN_DB}/query`, {
    filter: filters.length === 1 ? filters[0] : { and: filters },
    sorts: [{ property: 'Date Added', direction: 'descending' }],
    page_size: options?.limit || 50,
  })

  return (data.results || []).map(extractEntry)
}
