'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { addAdhocBlock } from '@/lib/schedule-store'
import { today } from '@/lib/store'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

const PRESETS = [
  { label: 'Sobeys', emoji: '🏪' },
  { label: 'Errands', emoji: '🏃' },
  { label: 'Meeting', emoji: '📱' },
  { label: 'Deep Work', emoji: '🔨' },
  { label: 'Appointment', emoji: '📋' },
]

export default function AddBlockModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('📌')
  const [date, setDate] = useState(today())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')

  async function handleAdd() {
    if (!label.trim() || !startTime || !endTime) return
    await addAdhocBlock(date, label.trim(), startTime, endTime, emoji, true)
    toast.success(`${emoji} ${label.trim()} added!`, { duration: 1500 })
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--bg)] rounded-t-2xl p-5 space-y-4 pb-[max(env(safe-area-inset-bottom),20px)] glass-card" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">Add Time Block</h3>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { setLabel(p.label); setEmoji(p.emoji) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs border transition-all',
                label === p.label
                  ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)]'
              )}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        {/* Custom label */}
        <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Block label (e.g. Sobeys)"
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)]" />

        {/* Date */}
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full bg-[var(--card)] rounded-xl px-4 py-3 text-sm border border-[var(--border)] outline-none" />

        {/* Time range */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Start</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">End</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm border border-[var(--border)] outline-none" />
          </div>
        </div>

        <button onClick={handleAdd}
          disabled={!label.trim()}
          className="w-full py-3.5 rounded-xl bg-[var(--accent)] font-bold text-sm active:scale-95 disabled:opacity-30 transition-all">
          {emoji} Add Block
        </button>
      </div>
    </div>
  )
}
