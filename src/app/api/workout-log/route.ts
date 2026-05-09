import { NextRequest, NextResponse } from 'next/server'
import { getWorkoutEntries } from '@/lib/notion-workout'

function isAuthed(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes('adam-planner.vercel.app') || referer.includes('localhost')
  return isSameOrigin || secret === process.env.CRON_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10)

  try {
    const entries = await getWorkoutEntries(limit)
    return NextResponse.json({ entries })
  } catch (e: any) {
    console.error('Workout log error:', e)
    return NextResponse.json({ error: e.message || 'Failed to fetch workouts' }, { status: 500 })
  }
}
