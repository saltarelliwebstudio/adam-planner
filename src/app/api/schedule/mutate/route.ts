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
    action: 'skip_block' | 'move_block' | 'add_adhoc' | 'remove_override' | 'update_block' | 'replace_day'
    [key: string]: unknown
  }

  switch (action) {
    case 'skip_block': {
      const { blockId, date } = params as { blockId: string; date: string }
      if (!blockId || !date) return NextResponse.json({ error: 'blockId and date required' }, { status: 400 })

      const id = crypto.randomUUID()
      const { error } = await supabase.from('schedule_overrides').insert({
        id,
        date,
        block_id: blockId,
        override_type: 'skip',
        locked: false,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, id, action: 'skip_block' })
    }

    case 'move_block': {
      const { blockId, date, startTime, endTime } = params as {
        blockId: string; date: string; startTime: string; endTime: string
      }
      if (!blockId || !date || !startTime || !endTime) {
        return NextResponse.json({ error: 'blockId, date, startTime, endTime required' }, { status: 400 })
      }

      const id = crypto.randomUUID()
      const { error } = await supabase.from('schedule_overrides').insert({
        id,
        date,
        block_id: blockId,
        override_type: 'move',
        start_time: startTime,
        end_time: endTime,
        locked: false,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, id, action: 'move_block' })
    }

    case 'add_adhoc': {
      const { date, label, startTime, endTime, emoji, locked } = params as {
        date: string; label: string; startTime: string; endTime: string; emoji?: string; locked?: boolean
      }
      if (!date || !label || !startTime || !endTime) {
        return NextResponse.json({ error: 'date, label, startTime, endTime required' }, { status: 400 })
      }

      const id = crypto.randomUUID()
      const { error } = await supabase.from('schedule_overrides').insert({
        id,
        date,
        block_id: null,
        override_type: 'adhoc',
        label,
        emoji: emoji || '📌',
        start_time: startTime,
        end_time: endTime,
        locked: locked ?? true,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, id, action: 'add_adhoc' })
    }

    case 'remove_override': {
      const { overrideId } = params as { overrideId: string }
      if (!overrideId) return NextResponse.json({ error: 'overrideId required' }, { status: 400 })

      const { error } = await supabase.from('schedule_overrides').delete().eq('id', overrideId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'remove_override' })
    }

    case 'update_block': {
      const { blockId, label, emoji, startTime, endTime, locked, skippable } = params as {
        blockId: string; label?: string; emoji?: string; startTime?: string; endTime?: string; locked?: boolean; skippable?: boolean
      }
      if (!blockId) return NextResponse.json({ error: 'blockId required' }, { status: 400 })

      const updates: Record<string, unknown> = {}
      if (label !== undefined) updates.label = label
      if (emoji !== undefined) updates.emoji = emoji
      if (startTime !== undefined) updates.start_time = startTime
      if (endTime !== undefined) updates.end_time = endTime
      if (locked !== undefined) updates.locked = locked
      if (skippable !== undefined) updates.skippable = skippable

      const { error } = await supabase.from('schedule_blocks').update(updates).eq('id', blockId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'update_block' })
    }

    case 'replace_day': {
      const { dayOfWeek, blocks } = params as {
        dayOfWeek: number
        blocks: Array<{
          label: string; emoji: string; startTime: string; endTime: string
          locked?: boolean; skippable?: boolean; category?: string
        }>
      }
      if (dayOfWeek === undefined || !blocks || !Array.isArray(blocks)) {
        return NextResponse.json({ error: 'dayOfWeek and blocks[] required' }, { status: 400 })
      }

      // Get existing block IDs for this day
      const { data: existing } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('day_of_week', dayOfWeek)

      const oldIds = (existing || []).map((b: { id: string }) => b.id)

      // Delete overrides referencing old blocks
      if (oldIds.length > 0) {
        await supabase.from('schedule_overrides').delete().in('block_id', oldIds)
        await supabase.from('schedule_blocks').delete().eq('day_of_week', dayOfWeek)
      }

      // Insert new blocks
      const rows = blocks.map((b, i) => ({
        id: crypto.randomUUID(),
        label: b.label,
        emoji: b.emoji,
        day_of_week: dayOfWeek,
        start_time: b.startTime,
        end_time: b.endTime,
        locked: b.locked ?? false,
        skippable: b.skippable ?? true,
        category: b.category || null,
        sort_order: i,
      }))

      const { error } = await supabase.from('schedule_blocks').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'replace_day', dayOfWeek, blocksCreated: rows.length })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
