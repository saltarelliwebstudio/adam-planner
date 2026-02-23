'use client'

import { useState, useRef, useEffect } from 'react'
import { addTask, getTasks, today } from '@/lib/store'
import { getBlocksForDay } from '@/lib/schedule'

interface ParsedItem {
  title: string
  priority: 'high' | 'medium' | 'low'
  category: 'business' | 'client' | 'school' | 'personal' | 'health'
  scheduledDate: string
  scheduledTime?: string
  deadline?: string
  conflict?: string
  approved: boolean
}

interface ParseResult {
  items: ParsedItem[]
  conflicts: string[]
  summary: string
}

function fmt12(time24: string) {
  const [h, m] = time24.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${ap}`
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const CAT_EMOJI: Record<string, string> = {
  business: '💼', client: '🤝', school: '📚', personal: '🏠', health: '💪'
}

export default function BrainDump({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'idle' | 'listening' | 'processing' | 'review' | 'saving'>('idle')
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [duration, setDuration] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }

    const r = new SR()
    recognitionRef.current = r
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-CA'

    let processedUpTo = 0
    let finalText = ''
    r.onresult = (e: SpeechRecognitionEvent) => {
      // Only process new results to avoid duplication
      let newFinal = ''
      let interim = ''
      for (let i = processedUpTo; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newFinal += e.results[i][0].transcript + ' '
          processedUpTo = i + 1
        } else {
          interim += e.results[i][0].transcript
        }
      }
      finalText += newFinal
      setTranscript(finalText + interim)
    }

    r.onend = () => {
      if (step === 'listening') try { r.start() } catch { /* */ }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => { if (e.error !== 'no-speech') console.error(e.error) }

    r.start()
    setStep('listening')
    setTranscript('')
    setDuration(0)
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  function stopAndProcess() {
    recognitionRef.current?.stop()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (transcript.trim()) processTranscript()
    else setStep('idle')
  }

  async function processTranscript() {
    setStep('processing')

    const todayDate = today()
    const dayOfWeek = new Date(todayDate + 'T12:00:00').getDay()
    const blocks = getBlocksForDay(dayOfWeek)
    const existingTasks = getTasks().filter(t => t.status !== 'done')

    try {
      const res = await fetch('/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          today: todayDate,
          existingTasks: existingTasks.map(t => ({
            title: t.title,
            scheduledDate: t.scheduledDate,
            scheduledTime: t.scheduledTime,
            category: t.category,
          })),
          schedule: blocks.map(b => ({
            start: b.start, end: b.end, label: b.label, locked: b.locked,
          })),
        }),
      })
      const data: ParseResult = await res.json()
      if (data.items) {
        data.items = data.items.map(item => ({ ...item, approved: true }))
      }
      setResult(data)
      setStep('review')
    } catch {
      setResult({ items: [], conflicts: ['Failed to process. Try again.'], summary: '' })
      setStep('review')
    }
  }

  async function saveApproved() {
    if (!result) return
    setStep('saving')
    let count = 0
    for (const item of result.items) {
      if (item.approved) {
        addTask({
          title: item.title,
          priority: item.priority,
          category: item.category,
          scheduledDate: item.scheduledDate,
          scheduledTime: item.scheduledTime,
          deadline: item.deadline,
          status: 'todo',
        })
        count++
      }
    }
    setStep('idle')
    setTranscript('')
    setResult(null)
    setIsOpen(false)
    onDone()
    if (count > 0) alert(`✅ Added ${count} tasks!`)
  }

  function toggleItem(idx: number) {
    if (!result) return
    const items = [...result.items]
    items[idx] = { ...items[idx], approved: !items[idx].approved }
    setResult({ ...result, items })
  }

  const pad = (n: number) => n.toString().padStart(2, '0')

  // Floating button
  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-16 h-16 rounded-full bg-[var(--accent)] shadow-xl flex items-center justify-center active:scale-90 transition-transform">
        <span className="text-3xl">🎤</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-bold text-lg">Brain Dump</h2>
          <p className="text-xs text-[var(--text-muted)]">Talk it out — I&apos;ll organize it</p>
        </div>
        <button onClick={() => { setIsOpen(false); setStep('idle') }} className="text-2xl text-[var(--text-muted)] p-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Idle */}
        {step === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-6 -mt-12">
            <div className="text-6xl">🧠</div>
            <h3 className="text-xl font-bold text-center">What&apos;s on your mind?</h3>
            <p className="text-sm text-[var(--text-muted)] text-center max-w-xs">
              Hit record and dump everything — meetings, tasks, ideas, whatever. I&apos;ll sort it into your schedule.
            </p>
            <button onClick={startListening}
              className="w-20 h-20 rounded-full bg-[var(--accent)] flex items-center justify-center active:scale-90 transition-transform shadow-lg">
              <span className="text-4xl">🎤</span>
            </button>
            <p className="text-xs text-[var(--text-muted)]">Works best in Chrome</p>
          </div>
        )}

        {/* Listening */}
        {step === 'listening' && (
          <div className="flex flex-col items-center gap-5 pt-8">
            <div className="w-24 h-24 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
              <span className="text-4xl">🎤</span>
            </div>
            <p className="text-2xl font-mono font-bold text-[var(--accent)]">{pad(Math.floor(duration / 60))}:{pad(duration % 60)}</p>
            <p className="text-sm text-[var(--text-muted)]">Listening... just talk naturally</p>
            
            <div className="w-full bg-[var(--card)] rounded-xl p-4 max-h-48 overflow-y-auto">
              <p className="text-[15px] leading-relaxed">
                {transcript || <span className="text-[var(--text-muted)] italic">Waiting for speech...</span>}
              </p>
            </div>

            <button onClick={stopAndProcess}
              className="w-full py-4 rounded-2xl bg-[var(--success)] text-white font-bold text-lg active:scale-95">
              ✅ Done — Organize It
            </button>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 -mt-12">
            <div className="text-5xl animate-bounce">🧠</div>
            <h3 className="text-lg font-bold">Organizing your brain dump...</h3>
            <p className="text-sm text-[var(--text-muted)] text-center">
              Figuring out priorities, checking your schedule for conflicts, slotting things in...
            </p>
            <div className="w-full bg-[var(--card)] rounded-xl p-3 max-h-24 overflow-y-auto mt-4">
              <p className="text-xs text-[var(--text-muted)]">&ldquo;{transcript.slice(0, 150)}{transcript.length > 150 ? '...' : ''}&rdquo;</p>
            </div>
          </div>
        )}

        {/* Review */}
        {step === 'review' && result && (
          <div className="space-y-4">
            {/* Summary */}
            {result.summary && (
              <div className="bg-[var(--card)] rounded-xl p-4">
                <p className="text-[15px]">{result.summary}</p>
              </div>
            )}

            {/* Conflicts */}
            {result.conflicts && result.conflicts.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-red-400 mb-2">⚠️ Scheduling Conflicts</h3>
                {result.conflicts.map((c, i) => (
                  <p key={i} className="text-sm text-[var(--text-muted)] py-0.5">• {c}</p>
                ))}
              </div>
            )}

            {/* Items */}
            <h3 className="text-sm font-semibold text-[var(--text-muted)]">
              {result.items.length} TASKS FOUND — tap to deselect
            </h3>
            {result.items.map((item, i) => (
              <div key={i} onClick={() => toggleItem(i)}
                className={`bg-[var(--card)] rounded-xl p-4 transition-all cursor-pointer ${
                  !item.approved ? 'opacity-40' : ''
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                    item.approved ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--border)]'
                  }`}>
                    {item.approved && <span className="text-xs text-[var(--accent)]">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-medium">{item.title}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs text-[var(--text-muted)]">
                        📅 {fmtDate(item.scheduledDate)}
                      </span>
                      {item.scheduledTime && (
                        <span className="text-xs text-[var(--text-muted)]">
                          🕐 {fmt12(item.scheduledTime)}
                        </span>
                      )}
                      <span className="text-xs">
                        {CAT_EMOJI[item.category] || '📌'} {item.category}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        item.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                        item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>{item.priority}</span>
                    </div>
                    {item.conflict && (
                      <p className="text-xs text-[var(--warning)] mt-1">⚠️ {item.conflict}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={saveApproved}
                disabled={!result.items.some(i => i.approved)}
                className="flex-1 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-base active:scale-95 disabled:opacity-30">
                ✅ Add {result.items.filter(i => i.approved).length} Tasks
              </button>
              <button onClick={() => { setStep('idle'); setTranscript('') }}
                className="py-4 px-6 rounded-2xl border border-[var(--border)] text-sm font-medium">
                🎤 Redo
              </button>
            </div>

            {/* Original transcript */}
            <details className="text-xs">
              <summary className="text-[var(--text-muted)] cursor-pointer">View original transcript</summary>
              <p className="bg-[var(--card)] rounded-lg p-3 mt-1 text-[var(--text-muted)]">{transcript}</p>
            </details>
          </div>
        )}

        {/* Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="text-4xl animate-spin">⏳</div>
            <p className="font-medium">Adding tasks...</p>
          </div>
        )}
      </div>
    </div>
  )
}
