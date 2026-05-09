'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { addTask, getTasks, today } from '@/lib/store'
import { getBlocksForDay } from '@/lib/schedule'
import { motion, AnimatePresence } from 'framer-motion'
import AudioWaveform from './AudioWaveform'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

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

interface EditAction {
  action: 'edit' | 'delete'
  match: string
  updates?: Record<string, string>
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
  business: '💼', client: '🤝', school: '📚', personal: '🏠', health: '💪',
}

// ── Client-side edit intent detection ──
function detectEditIntent(sentence: string, cards: ParsedItem[]): EditAction | null {
  const s = sentence.toLowerCase().trim()

  // "delete/remove the last one"
  if (/^(delete|remove)\s+(the\s+)?last\s+(one|task|item)/.test(s)) {
    return { action: 'delete', match: 'last' }
  }
  // "delete/remove [title fragment]"
  const deleteMatch = s.match(/^(delete|remove)\s+(?:the\s+)?(.+)/)
  if (deleteMatch) {
    return { action: 'delete', match: deleteMatch[2] }
  }

  // "no I meant X" / "actually X" → replace last card title
  const actuallyMatch = s.match(/^(no\s+i\s+meant?|actually|i\s+meant?)\s+(.+)/)
  if (actuallyMatch && cards.length > 0) {
    return { action: 'edit', match: 'last', updates: { title: actuallyMatch[2] } }
  }

  // "change X to Y"
  const changeMatch = s.match(/^change\s+(.+?)\s+to\s+(.+)/)
  if (changeMatch) {
    return { action: 'edit', match: changeMatch[1], updates: { title: changeMatch[2] } }
  }

  // "make X high/medium/low priority"
  const priorityMatch = s.match(/^make\s+(.+?)\s+(high|medium|low)\s*(?:priority)?/)
  if (priorityMatch) {
    return { action: 'edit', match: priorityMatch[1], updates: { priority: priorityMatch[2] } }
  }

  // "move X to tomorrow/today"
  const moveMatch = s.match(/^move\s+(.+?)\s+to\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)
  if (moveMatch) {
    const todayDate = today()
    const todayDt = new Date(todayDate + 'T12:00:00')
    let targetDate = todayDate
    const dayWord = moveMatch[2].toLowerCase()
    if (dayWord === 'tomorrow') {
      const d = new Date(todayDt)
      d.setDate(d.getDate() + 1)
      targetDate = d.toISOString().split('T')[0]
    } else if (dayWord !== 'today') {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDay = dayNames.indexOf(dayWord)
      if (targetDay >= 0) {
        const d = new Date(todayDt)
        const diff = (targetDay - d.getDay() + 7) % 7 || 7
        d.setDate(d.getDate() + diff)
        targetDate = d.toISOString().split('T')[0]
      }
    }
    return { action: 'edit', match: moveMatch[1], updates: { scheduledDate: targetDate } }
  }

  return null
}

function findCardIndex(cards: ParsedItem[], match: string): number {
  if (match === 'last') return cards.length - 1
  const lower = match.toLowerCase()
  const idx = cards.findIndex(c => c.title.toLowerCase().includes(lower))
  return idx >= 0 ? idx : cards.length - 1 // fallback to last
}

function haptic(ms = 50) {
  try { navigator.vibrate?.(ms) } catch { /* not supported */ }
}

export default function BrainDump({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'idle' | 'listening' | 'review' | 'saving'>('idle')
  const [transcript, setTranscript] = useState('')
  const [liveCards, setLiveCards] = useState<ParsedItem[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [flashIdx, setFlashIdx] = useState<number | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  // Streaming refs
  const sentenceQueueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  const liveCardsRef = useRef<ParsedItem[]>([])
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Preloaded context
  const contextRef = useRef<{
    today: string
    dayOfWeek: string
    schedule: { start: string; end: string; label: string; locked: boolean }[]
    existingTaskTitles: string[]
  } | null>(null)

  // Keep ref in sync with state
  useEffect(() => { liveCardsRef.current = liveCards }, [liveCards])

  // Preload schedule context on mount
  useEffect(() => {
    const todayDate = today()
    const todayDt = new Date(todayDate + 'T12:00:00')
    const dayOfWeek = todayDt.getDay()
    const blocks = getBlocksForDay(dayOfWeek)
    const existingTasks = getTasks().filter(t => t.status !== 'done')
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]

    contextRef.current = {
      today: todayDate,
      dayOfWeek: dayName,
      schedule: blocks.map(b => ({ start: b.start, end: b.end, label: b.label, locked: b.locked })),
      existingTaskTitles: existingTasks.map(t => t.title),
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Auto-save draft to localStorage on unmount while listening
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (step === 'listening' || step === 'review') {
        localStorage.setItem('braindump-draft', JSON.stringify({
          transcript,
          liveCards: liveCardsRef.current,
          savedAt: Date.now(),
        }))
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [step, transcript])

  // ── Process sentence queue via streaming API ──
  const processQueue = useCallback(async () => {
    if (processingRef.current || sentenceQueueRef.current.length === 0) return
    processingRef.current = true

    const chunk = sentenceQueueRef.current.join(' ')
    sentenceQueueRef.current = []

    try {
      const res = await fetch('/api/brain-dump-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk,
          ...contextRef.current,
          previousCards: liveCardsRef.current.map(c => ({ title: c.title })),
        }),
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n')
          const message = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 2)

          if (message.startsWith('data: ')) {
            const data = message.slice(6)
            if (data === '[DONE]') break

            try {
              const parsed = JSON.parse(data)
              if (parsed.error) continue

              // Handle edit/delete actions from Claude
              if (parsed.action === 'delete') {
                const cardIdx = findCardIndex(liveCardsRef.current, parsed.match)
                if (cardIdx >= 0) {
                  setLiveCards(prev => prev.filter((_, i) => i !== cardIdx))
                  haptic(30)
                }
              } else if (parsed.action === 'edit') {
                const cardIdx = findCardIndex(liveCardsRef.current, parsed.match)
                if (cardIdx >= 0 && parsed.updates) {
                  setLiveCards(prev => prev.map((c, i) =>
                    i === cardIdx ? { ...c, ...parsed.updates } : c
                  ))
                  setFlashIdx(cardIdx)
                  setTimeout(() => setFlashIdx(null), 600)
                  haptic(30)
                }
              } else if (parsed.title) {
                // New task card
                const newCard: ParsedItem = {
                  title: parsed.title,
                  priority: parsed.priority || 'medium',
                  category: parsed.category || 'personal',
                  scheduledDate: parsed.scheduledDate || contextRef.current?.today || today(),
                  scheduledTime: parsed.scheduledTime === 'null' ? undefined : parsed.scheduledTime,
                  conflict: parsed.conflict === 'null' ? undefined : parsed.conflict,
                  approved: true,
                }
                setLiveCards(prev => [...prev, newCard])
                haptic(50)
              }
            } catch {
              // skip parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream processing error:', err)
    }

    processingRef.current = false

    // Process any sentences that queued while we were processing
    if (sentenceQueueRef.current.length > 0) {
      processQueue()
    }
  }, [])

  // ── Queue a sentence and trigger processing after debounce ──
  const queueSentence = useCallback((sentence: string) => {
    // First check for client-side edit intent
    const editIntent = detectEditIntent(sentence, liveCardsRef.current)
    if (editIntent) {
      if (editIntent.action === 'delete') {
        const idx = findCardIndex(liveCardsRef.current, editIntent.match)
        if (idx >= 0) {
          setLiveCards(prev => prev.filter((_, i) => i !== idx))
          haptic(30)
        }
      } else if (editIntent.action === 'edit' && editIntent.updates) {
        const idx = findCardIndex(liveCardsRef.current, editIntent.match)
        if (idx >= 0) {
          setLiveCards(prev => prev.map((c, i) =>
            i === idx ? { ...c, ...editIntent.updates! } : c
          ))
          setFlashIdx(idx)
          setTimeout(() => setFlashIdx(null), 600)
          haptic(30)
        }
      }
      return // Don't send to API
    }

    sentenceQueueRef.current.push(sentence)

    // Debounce 2s to batch nearby sentences
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      processQueue()
    }, 2000)
  }, [processQueue])

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Voice input requires Chrome or Safari'); return }

    // Check for saved draft
    const draft = localStorage.getItem('braindump-draft')
    if (draft) {
      try {
        const { transcript: savedTranscript, liveCards: savedCards, savedAt } = JSON.parse(draft)
        // Only restore if less than 30 minutes old
        if (Date.now() - savedAt < 30 * 60 * 1000 && savedCards?.length > 0) {
          setTranscript(savedTranscript || '')
          setLiveCards(savedCards.map((c: ParsedItem) => ({ ...c, approved: true })))
        }
      } catch { /* ignore */ }
      localStorage.removeItem('braindump-draft')
    }

    const r = new SR()
    recognitionRef.current = r
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'

    let processedUpTo = 0
    let finalText = ''
    let restartTimeout: NodeJS.Timeout | null = null

    r.onresult = (e: SpeechRecognitionEvent) => {
      let newFinal = ''
      let interim = ''
      for (let i = processedUpTo; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const sentenceText = e.results[i][0].transcript.trim()
          newFinal += sentenceText + ' '
          processedUpTo = i + 1
          // Queue each final sentence for streaming processing
          if (sentenceText.length > 2) {
            queueSentence(sentenceText)
          }
        } else {
          interim += e.results[i][0].transcript
        }
      }
      finalText += newFinal
      setTranscript(finalText + interim)

      if (restartTimeout) {
        clearTimeout(restartTimeout)
        restartTimeout = null
      }
    }

    r.onend = () => {
      if (step === 'listening') {
        restartTimeout = setTimeout(() => {
          try {
            if (step === 'listening') r.start()
          } catch (err) {
            console.log('Speech recognition restart failed:', err)
          }
        }, 100)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      console.log('Speech recognition error:', e.error)
      if (e.error === 'not-allowed') {
        alert('Please allow microphone access and try again')
        setStep('idle')
      } else if (e.error === 'network') {
        alert('Network error - check your connection')
        setStep('idle')
      }
      if (!['no-speech', 'audio-capture', 'aborted'].includes(e.error)) {
        console.error('Speech recognition error:', e.error)
      }
    }

    try {
      r.start()
      setStep('listening')
      setTranscript('')
      setDuration(0)
      haptic(100)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch (err) {
      alert('Failed to start voice input. Please check microphone permissions.')
      console.error('Speech recognition start failed:', err)
    }
  }

  function stopAndReview() {
    recognitionRef.current?.stop()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    haptic(50)

    // Flush any remaining sentences
    if (sentenceQueueRef.current.length > 0 && !processingRef.current) {
      processQueue()
    }

    if (liveCards.length > 0) {
      setStep('review')
    } else if (transcript.trim()) {
      // Fallback: if no cards streamed in, do a batch process
      fallbackBatchProcess()
    } else {
      setStep('idle')
    }
  }

  async function fallbackBatchProcess() {
    // Use the original brain-dump endpoint as fallback
    const todayDate = today()
    const todayDt = new Date(todayDate + 'T12:00:00')
    const dayOfWeek = todayDt.getDay()
    const blocks = getBlocksForDay(dayOfWeek)
    const existingTasks = getTasks().filter(t => t.status !== 'done')
    const next7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayDt)
      d.setDate(d.getDate() + i)
      const ds = d.toISOString().split('T')[0]
      const dow = d.getDay()
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]
      return `${ds} (${dayName})`
    }).join(', ')

    try {
      const res = await fetch('/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          today: todayDate,
          next7days: next7,
          existingTasks: existingTasks.map(t => ({
            title: t.title, scheduledDate: t.scheduledDate,
            scheduledTime: t.scheduledTime, category: t.category,
          })),
          schedule: blocks.map(b => ({ start: b.start, end: b.end, label: b.label, locked: b.locked })),
        }),
      })
      const data = await res.json()
      if (data.items) {
        setLiveCards(data.items.map((item: ParsedItem) => ({ ...item, approved: true })))
      }
      setStep('review')
    } catch {
      setLiveCards([])
      setStep('review')
    }
  }

  async function saveApproved() {
    const approved = liveCards.filter(c => c.approved)
    if (approved.length === 0) return
    setStep('saving')
    for (const item of approved) {
      addTask({
        title: item.title,
        priority: item.priority,
        category: item.category,
        scheduledDate: item.scheduledDate,
        scheduledTime: item.scheduledTime,
        deadline: item.deadline,
        status: 'todo',
      })
    }
    localStorage.removeItem('braindump-draft')
    setStep('idle')
    setTranscript('')
    setLiveCards([])
    setIsOpen(false)
    onDone()
    haptic(100)
  }

  function toggleItem(idx: number) {
    setLiveCards(prev => prev.map((c, i) =>
      i === idx ? { ...c, approved: !c.approved } : c
    ))
  }

  function updateItem(idx: number, field: string, value: string) {
    setLiveCards(prev => prev.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    ))
  }

  function removeItem(idx: number) {
    setLiveCards(prev => prev.filter((_, i) => i !== idx))
    setEditingIdx(null)
  }

  const pad = (n: number) => n.toString().padStart(2, '0')

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-bold text-lg">Brain Dump</h2>
          <p className="text-xs text-[var(--text-muted)]">Talk it out — I&apos;ll organize it</p>
        </div>
        <button onClick={() => { setIsOpen(false); setStep('idle'); setLiveCards([]) }} className="text-2xl text-[var(--text-muted)] p-2">✕</button>
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
              className="w-20 h-20 rounded-full bg-[var(--accent)] flex items-center justify-center active:scale-90 transition-transform shadow-lg glow-accent glow-pulse">
              <span className="text-4xl">🎤</span>
            </button>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">
                {typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
                  ? '✅ Voice input ready'
                  : '❌ Voice input not supported'
                }
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Cards appear in real-time as you speak</p>
            </div>
          </div>
        )}

        {/* Listening — split view: waveform + transcript + live cards */}
        {step === 'listening' && (
          <div className="flex flex-col gap-4">
            {/* Waveform + timer */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Recording</span>
                </div>
                <p className="text-lg font-mono font-bold text-[var(--accent)]">{pad(Math.floor(duration / 60))}:{pad(duration % 60)}</p>
              </div>

              {/* Audio waveform */}
              <AudioWaveform isActive={step === 'listening'} height={56} barCount={48} />

              <p className="text-[10px] text-[var(--text-muted)] text-center">say &quot;delete the last one&quot; or &quot;change X to Y&quot; to edit on the fly</p>
            </div>

            {/* Live transcript with typing effect */}
            <div className="glass-card p-3 max-h-28 overflow-y-auto">
              <p className="text-sm leading-relaxed">
                {transcript ? (
                  <>
                    {transcript}
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
                      className="inline-block w-0.5 h-4 bg-[var(--accent)] ml-0.5 align-middle"
                    />
                  </>
                ) : (
                  <span className="text-[var(--text-muted)] italic">Waiting for speech...</span>
                )}
              </p>
            </div>

            {/* Live cards appearing in real-time */}
            {liveCards.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {liveCards.length} TASK{liveCards.length !== 1 ? 'S' : ''} FOUND
                </p>
                <AnimatePresence mode="popLayout">
                  {liveCards.map((item, i) => (
                    <motion.div
                      key={`${item.title}-${i}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -100, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className={cn(
                        'bg-[var(--card)] rounded-xl p-3 flex items-start gap-3 transition-all',
                        flashIdx === i && 'ring-2 ring-[var(--accent)] ring-opacity-80'
                      )}
                    >
                      <span className="text-sm mt-0.5">{CAT_EMOJI[item.category]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[11px] text-[var(--text-muted)]">{fmtDate(item.scheduledDate)}</span>
                          {item.scheduledTime && <span className="text-[11px] text-[var(--text-muted)]">{fmt12(item.scheduledTime)}</span>}
                          <span className={cn('text-[11px] px-1 py-0.5 rounded-full',
                            item.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                            item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          )}>{item.priority}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Done button */}
            <button onClick={stopAndReview}
              className="w-full py-4 rounded-2xl bg-[var(--success)] text-white font-bold text-lg active:scale-95 mt-2">
              ✅ Done — Review {liveCards.length > 0 ? `${liveCards.length} Tasks` : 'It'}
            </button>
          </div>
        )}

        {/* Review — editable cards */}
        {step === 'review' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-muted)]">
              {liveCards.length} TASKS — tap any task to edit details ✏️
            </h3>
            <AnimatePresence mode="popLayout">
              {liveCards.map((item, i) => {
                const isEditing = editingIdx === i
                return (
                  <motion.div
                    key={`${item.title}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -80 }}
                    className={cn(
                      'bg-[var(--card)] rounded-xl overflow-hidden transition-all',
                      !item.approved && 'opacity-40'
                    )}
                  >
                    {/* Header row */}
                    <div className="flex items-start gap-3 p-4">
                      <button onClick={(e) => { e.stopPropagation(); toggleItem(i) }} className="flex-shrink-0 mt-0.5">
                        <div className={cn(
                          'w-6 h-6 rounded-full border-2 flex items-center justify-center',
                          item.approved ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--border)]'
                        )}>
                          {item.approved && <span className="text-xs text-[var(--accent)]">✓</span>}
                        </div>
                      </button>

                      <div className={cn(
                        "flex-1 min-w-0 cursor-pointer transition-all rounded-lg p-2 -m-2",
                        isEditing ? "bg-[var(--accent)]/10" : "hover:bg-[var(--card-hover)]"
                      )} onClick={() => setEditingIdx(isEditing ? null : i)}>
                        <p className="text-[15px] font-medium">{item.title}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          <span className="text-xs text-[var(--text-muted)]">📅 {fmtDate(item.scheduledDate)}</span>
                          {item.scheduledTime && <span className="text-xs text-[var(--text-muted)]">🕐 {fmt12(item.scheduledTime)}</span>}
                          <span className="text-xs">{CAT_EMOJI[item.category]} {item.category}</span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                            item.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                            item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          )}>{item.priority}</span>
                        </div>
                        {item.conflict && <p className="text-xs text-[var(--warning)] mt-1">⚠️ {item.conflict}</p>}
                        {isEditing && <p className="text-xs text-[var(--accent)] mt-1">✏️ Tap fields below to edit</p>}
                      </div>

                      <span className={cn("text-sm mt-1 transition-colors",
                        isEditing ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                      )}>{isEditing ? '▼' : '✏️'}</span>
                    </div>

                    {/* Expanded edit form */}
                    {isEditing && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3">
                        <input value={item.title} onChange={e => updateItem(i, 'title', e.target.value)}
                          className="w-full bg-[var(--bg)] rounded-xl px-4 py-2.5 text-[15px] border border-[var(--border)] outline-none focus:border-[var(--accent)]"
                          placeholder="Task title" />

                        <div className="flex gap-2">
                          <input type="date" value={item.scheduledDate} onChange={e => updateItem(i, 'scheduledDate', e.target.value)}
                            className="flex-1 bg-[var(--bg)] rounded-xl px-3 py-2.5 text-sm border border-[var(--border)] outline-none" />
                          <input type="time" value={item.scheduledTime || ''} onChange={e => updateItem(i, 'scheduledTime', e.target.value)}
                            className="w-32 bg-[var(--bg)] rounded-xl px-3 py-2.5 text-sm border border-[var(--border)] outline-none"
                            placeholder="Time" />
                        </div>

                        <div className="flex gap-2">
                          {(['high', 'medium', 'low'] as const).map(p => (
                            <button key={p} onClick={() => updateItem(i, 'priority', p)}
                              className={cn('flex-1 py-2 rounded-xl text-xs font-medium capitalize border',
                                item.priority === p
                                  ? p === 'high' ? 'border-red-400 bg-red-500/20 text-red-400' : p === 'medium' ? 'border-amber-400 bg-amber-500/20 text-amber-400' : 'border-emerald-400 bg-emerald-500/20 text-emerald-400'
                                  : 'border-[var(--border)] text-[var(--text-muted)]'
                              )}>{p}</button>
                          ))}
                        </div>

                        <div className="flex gap-1.5 flex-wrap">
                          {(['business', 'client', 'school', 'personal', 'health'] as const).map(c => (
                            <button key={c} onClick={() => updateItem(i, 'category', c)}
                              className={cn('px-2.5 py-1.5 rounded-xl text-[11px] capitalize border',
                                item.category === c ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'
                              )}>{CAT_EMOJI[c]} {c}</button>
                          ))}
                        </div>

                        <button onClick={() => removeItem(i)}
                          className="w-full py-2 rounded-xl text-sm text-[var(--danger)] border border-[var(--danger)]/20">
                          🗑 Remove this task
                        </button>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={saveApproved}
                disabled={!liveCards.some(i => i.approved)}
                className="flex-1 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-base active:scale-95 disabled:opacity-30">
                ✅ Add {liveCards.filter(i => i.approved).length} Tasks
              </button>
              <button onClick={() => { setStep('idle'); setLiveCards([]) }}
                className="py-4 px-6 rounded-2xl border border-[var(--border)] text-sm font-medium">
                🎤 Redo
              </button>
            </div>

            {/* Transcript */}
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
