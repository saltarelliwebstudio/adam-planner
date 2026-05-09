import { NextRequest, NextResponse } from 'next/server'
import { getBrainEntries } from '@/lib/notion'

function isAuthed(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes('adam-planner.vercel.app') || referer.includes('localhost')
  return isSameOrigin || secret === process.env.CRON_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const domain = req.nextUrl.searchParams.get('domain') || undefined
  const type = req.nextUrl.searchParams.get('type') || undefined
  const tag = req.nextUrl.searchParams.get('tag') || undefined
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)
  const synthesesOnly = req.nextUrl.searchParams.get('syntheses') === 'true'

  try {
    const entries = await getBrainEntries({ domain, type, tag, limit, synthesesOnly })
    return NextResponse.json({ entries })
  } catch (e: any) {
    console.error('Brain API error:', e)
    return NextResponse.json({ error: e.message || 'Failed to fetch brain entries' }, { status: 500 })
  }
}
