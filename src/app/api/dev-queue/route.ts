import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function authorize(req: NextRequest) {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

// GET — list pending/in_progress tasks
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = req.nextUrl.searchParams.get('status') || 'pending,in_progress'
  const statuses = status.split(',')

  const { data, error } = await supabase
    .from('dev_queue')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data })
}

// POST — add a new dev task
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { description, project, priority } = body

  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('dev_queue')
    .insert({
      description,
      project: project || null,
      priority: priority || 'medium',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// PATCH — update task status (for Claude Code to mark in_progress/done)
export async function PATCH(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, status, result } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  if (result) update.result = result
  if (status === 'done') update.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('dev_queue')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
