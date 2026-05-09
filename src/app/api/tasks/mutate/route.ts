import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function auth(req: NextRequest): boolean {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { action, ...params } = body as {
    action: 'add' | 'complete' | 'move' | 'delete'
    [key: string]: unknown
  }

  switch (action) {
    case 'add': {
      const { title, priority, category, scheduledDate, scheduledTime, notes } = params as {
        title: string; priority?: string; category?: string; scheduledDate: string
        scheduledTime?: string; notes?: string
      }
      if (!title || !scheduledDate) {
        return NextResponse.json({ error: 'title and scheduledDate required' }, { status: 400 })
      }

      const id = crypto.randomUUID()
      const { error } = await supabase.from('planner_tasks').insert({
        id,
        title,
        priority: priority || 'medium',
        category: category || 'personal',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || null,
        notes: notes || null,
        status: 'todo',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, id, action: 'add' })
    }

    case 'complete': {
      const { taskId } = params as { taskId: string }
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

      const { error } = await supabase.from('planner_tasks').update({
        status: 'done',
        completed_at: new Date().toISOString(),
      }).eq('id', taskId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'complete' })
    }

    case 'move': {
      const { taskId, scheduledDate, scheduledTime } = params as {
        taskId: string; scheduledDate: string; scheduledTime?: string
      }
      if (!taskId || !scheduledDate) {
        return NextResponse.json({ error: 'taskId and scheduledDate required' }, { status: 400 })
      }

      const updates: Record<string, unknown> = { scheduled_date: scheduledDate }
      if (scheduledTime !== undefined) updates.scheduled_time = scheduledTime || null

      const { error } = await supabase.from('planner_tasks').update(updates).eq('id', taskId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'move' })
    }

    case 'delete': {
      const { taskId } = params as { taskId: string }
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

      const { error } = await supabase.from('planner_tasks').delete().eq('id', taskId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'delete' })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
