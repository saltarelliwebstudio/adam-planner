import { supabase } from './supabase'
import { ScheduleBlock, ScheduleOverride, ResolvedBlock } from './types'

// ── In-memory cache ──
let blocksCache: ScheduleBlock[] = []
let blocksCacheLoaded = false
let overridesCache: ScheduleOverride[] = []

// ── Row mappers ──

function rowToBlock(r: Record<string, unknown>): ScheduleBlock {
  return {
    id: r.id as string,
    label: r.label as string,
    emoji: r.emoji as string,
    dayOfWeek: r.day_of_week as number,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    locked: r.locked as boolean,
    skippable: r.skippable as boolean,
    category: (r.category as string) || undefined,
    sortOrder: r.sort_order as number,
  }
}

function rowToOverride(r: Record<string, unknown>): ScheduleOverride {
  return {
    id: r.id as string,
    date: r.date as string,
    blockId: (r.block_id as string) || undefined,
    overrideType: r.override_type as ScheduleOverride['overrideType'],
    label: (r.label as string) || undefined,
    emoji: (r.emoji as string) || undefined,
    startTime: (r.start_time as string) || undefined,
    endTime: (r.end_time as string) || undefined,
    locked: r.locked as boolean,
  }
}

// ── Load from Supabase ──

export async function loadScheduleBlocks(): Promise<void> {
  const { data } = await supabase
    .from('schedule_blocks')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true })
  if (data) {
    blocksCache = data.map(rowToBlock)
    blocksCacheLoaded = true
  }
}

export async function loadOverridesForRange(startDate: string, endDate: string): Promise<void> {
  const { data } = await supabase
    .from('schedule_overrides')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('created_at', { ascending: true })
  if (data) {
    // Merge into cache (don't duplicate)
    const existingIds = new Set(overridesCache.map(o => o.id))
    const newOverrides = data.map(rowToOverride).filter(o => !existingIds.has(o.id))
    overridesCache = [...overridesCache.filter(o => o.date < startDate || o.date > endDate), ...data.map(rowToOverride)]
  }
}

// ── Getters ──

export function getScheduleBlocks(): ScheduleBlock[] {
  return [...blocksCache]
}

export function getBlocksForDayOfWeek(dayOfWeek: number): ScheduleBlock[] {
  return blocksCache
    .filter(b => b.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getOverridesForDate(date: string): ScheduleOverride[] {
  return overridesCache.filter(o => o.date === date)
}

// ── Core: Resolve schedule for a specific date ──
// Merges recurring blocks + overrides into a final list of blocks for the day

export function getResolvedSchedule(date: string): ResolvedBlock[] {
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay()
  const dayBlocks = getBlocksForDayOfWeek(dow)
  const dayOverrides = getOverridesForDate(date)

  // Build a set of skipped block IDs
  const skippedBlockIds = new Set(
    dayOverrides.filter(o => o.overrideType === 'skip').map(o => o.blockId)
  )

  // Build moved blocks (replace original time with override time)
  const movedBlockMap = new Map<string, ScheduleOverride>()
  for (const o of dayOverrides.filter(o => o.overrideType === 'move')) {
    if (o.blockId) movedBlockMap.set(o.blockId, o)
  }

  const resolved: ResolvedBlock[] = []

  // Add recurring blocks (skip if skipped, apply moves)
  for (const block of dayBlocks) {
    if (skippedBlockIds.has(block.id)) continue

    const move = movedBlockMap.get(block.id)
    if (move) {
      resolved.push({
        id: move.id,
        start: move.startTime || block.startTime,
        end: move.endTime || block.endTime,
        label: move.label || block.label,
        emoji: move.emoji || block.emoji,
        locked: block.locked,
        skippable: block.skippable,
        isOverride: true,
        overrideType: 'move',
        blockId: block.id,
      })
    } else {
      resolved.push({
        id: block.id,
        start: block.startTime,
        end: block.endTime,
        label: block.label,
        emoji: block.emoji,
        locked: block.locked,
        skippable: block.skippable,
        isOverride: false,
        blockId: block.id,
      })
    }
  }

  // Add adhoc blocks
  for (const o of dayOverrides.filter(o => o.overrideType === 'adhoc')) {
    if (o.startTime && o.endTime) {
      resolved.push({
        id: o.id,
        start: o.startTime,
        end: o.endTime,
        label: o.label || 'Ad-hoc',
        emoji: o.emoji || '📌',
        locked: o.locked,
        skippable: true,
        isOverride: true,
        overrideType: 'adhoc',
      })
    }
  }

  // Sort by start time
  return resolved.sort((a, b) => a.start.localeCompare(b.start))
}

// ── Calculate free hours for a date ──

export function getFreeHoursForDate(date: string): number {
  const blocks = getResolvedSchedule(date)
  return blocks
    .filter(b => !b.locked)
    .reduce((sum, b) => {
      const [sh, sm] = b.start.split(':').map(Number)
      const [eh, em] = b.end.split(':').map(Number)
      return sum + (eh + em / 60) - (sh + sm / 60)
    }, 0)
}

// ── Mutations ──

export async function addBlock(block: Omit<ScheduleBlock, 'id' | 'sortOrder'>): Promise<ScheduleBlock> {
  const maxSort = blocksCache
    .filter(b => b.dayOfWeek === block.dayOfWeek)
    .reduce((max, b) => Math.max(max, b.sortOrder), 0)

  const newBlock: ScheduleBlock = {
    ...block,
    id: crypto.randomUUID(),
    sortOrder: maxSort + 1,
  }

  blocksCache.push(newBlock)
  await supabase.from('schedule_blocks').insert({
    id: newBlock.id,
    label: newBlock.label,
    emoji: newBlock.emoji,
    day_of_week: newBlock.dayOfWeek,
    start_time: newBlock.startTime,
    end_time: newBlock.endTime,
    locked: newBlock.locked,
    skippable: newBlock.skippable,
    category: newBlock.category || null,
    sort_order: newBlock.sortOrder,
  })

  return newBlock
}

export async function updateBlock(id: string, updates: Partial<ScheduleBlock>): Promise<void> {
  const idx = blocksCache.findIndex(b => b.id === id)
  if (idx >= 0) {
    blocksCache[idx] = { ...blocksCache[idx], ...updates }
  }

  const row: Record<string, unknown> = {}
  if (updates.label !== undefined) row.label = updates.label
  if (updates.emoji !== undefined) row.emoji = updates.emoji
  if (updates.dayOfWeek !== undefined) row.day_of_week = updates.dayOfWeek
  if (updates.startTime !== undefined) row.start_time = updates.startTime
  if (updates.endTime !== undefined) row.end_time = updates.endTime
  if (updates.locked !== undefined) row.locked = updates.locked
  if (updates.skippable !== undefined) row.skippable = updates.skippable
  if (updates.category !== undefined) row.category = updates.category
  if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder

  if (Object.keys(row).length > 0) {
    await supabase.from('schedule_blocks').update(row).eq('id', id)
  }
}

export async function deleteBlock(id: string): Promise<void> {
  blocksCache = blocksCache.filter(b => b.id !== id)
  await supabase.from('schedule_blocks').delete().eq('id', id)
}

export async function skipBlock(blockId: string, date: string): Promise<ScheduleOverride> {
  const override: ScheduleOverride = {
    id: crypto.randomUUID(),
    date,
    blockId,
    overrideType: 'skip',
    locked: false,
  }
  overridesCache.push(override)
  await supabase.from('schedule_overrides').insert({
    id: override.id,
    date: override.date,
    block_id: override.blockId,
    override_type: 'skip',
    locked: false,
  })
  return override
}

export async function moveBlock(blockId: string, date: string, newStart: string, newEnd: string): Promise<ScheduleOverride> {
  const override: ScheduleOverride = {
    id: crypto.randomUUID(),
    date,
    blockId,
    overrideType: 'move',
    startTime: newStart,
    endTime: newEnd,
    locked: false,
  }
  overridesCache.push(override)
  await supabase.from('schedule_overrides').insert({
    id: override.id,
    date: override.date,
    block_id: override.blockId,
    override_type: 'move',
    start_time: newStart,
    end_time: newEnd,
    locked: false,
  })
  return override
}

export async function addAdhocBlock(
  date: string,
  label: string,
  startTime: string,
  endTime: string,
  emoji = '📌',
  locked = true
): Promise<ScheduleOverride> {
  const override: ScheduleOverride = {
    id: crypto.randomUUID(),
    date,
    overrideType: 'adhoc',
    label,
    emoji,
    startTime,
    endTime,
    locked,
  }
  overridesCache.push(override)
  await supabase.from('schedule_overrides').insert({
    id: override.id,
    date: override.date,
    block_id: null,
    override_type: 'adhoc',
    label,
    emoji,
    start_time: startTime,
    end_time: endTime,
    locked,
  })
  return override
}

export async function removeOverride(id: string): Promise<void> {
  overridesCache = overridesCache.filter(o => o.id !== id)
  await supabase.from('schedule_overrides').delete().eq('id', id)
}
