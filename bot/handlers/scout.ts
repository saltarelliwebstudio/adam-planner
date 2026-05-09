import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function handleScoutDigest(): Promise<string> {
  // Fetch recent AI/tech stories from HN Algolia API
  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const hnUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI+tool&numericFilters=created_at_i>${weekAgo}&hitsPerPage=20`

  let stories: Array<{ title: string; url: string; points: number }> = []

  try {
    const res = await fetch(hnUrl)
    const data = await res.json()
    stories = (data.hits || []).map((h: any) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points || 0,
    }))
  } catch {
    // HN API unavailable
  }

  if (stories.length === 0) {
    return 'No AI stories found this week. Try "research [topic]" for a specific search.'
  }

  // Filter with Haiku for relevance
  const storyList = stories
    .sort((a, b) => b.points - a.points)
    .slice(0, 15)
    .map((s, i) => `${i + 1}. ${s.title} (${s.points} pts) — ${s.url}`)
    .join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a tech scout for a solo web dev agency (Saltarelli Web Studio) that builds with Next.js, Supabase, AI automation, voice agents (Retell), and Telegram bots.

From these stories, pick the TOP 5 most relevant. For each, give:
- Name/title (bold with *)
- One-line summary of what it does
- Why it matters for SWS (one sentence)
- Link

Stories:
${storyList}

Format as a clean Telegram message with Markdown. Start with "🔬 *Weekly AI Scout*" header.`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text || 'Scout couldn\'t generate a digest. Try again later.'
}

export async function handleContentIdeas(topic?: string): Promise<string> {
  const topicStr = topic || 'AI tools and automation for small businesses'

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a content strategist for The Tech Frontier podcast and Instagram Reels by Adam Saltarelli (17, solo founder of Saltarelli Web Studio). His audience: small business owners interested in AI, automation, and modern web tools.

Generate 10 content ideas about: ${topicStr}

For each idea, give:
- Title (catchy, short)
- Format: Podcast / Reel / Both
- Hook (first sentence to grab attention)

Format as a numbered list with Telegram Markdown. Start with "🎙 *Content Ideas: ${topicStr}*" header.`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text || 'Couldn\'t generate content ideas. Try again.'
}

export async function handleScoutResearch(topic: string): Promise<string> {
  // For now, do a quick Haiku-powered summary.
  // Deep research gets queued for laptop Claude Code processing.
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Give a brief research overview on: ${topic}

Context: This is for Adam Saltarelli, solo web dev agency owner who builds with Next.js, Supabase, Retell AI, Modal, and Telegram bots. Focus on practical relevance.

Include:
- What it is (2-3 sentences)
- Key players/tools
- Relevance to a solo dev agency
- Quick verdict: worth exploring or skip?

Use Telegram Markdown formatting. Keep it under 300 words.`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text || 'Research unavailable. Queue for laptop with "dev: research [topic]".'
}
