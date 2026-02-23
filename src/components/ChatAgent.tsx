'use client'

import { useState, useRef, useEffect } from 'react'
import { addTask, getTasks, updateTask, today } from '@/lib/store'

interface Message {
  id: string
  role: 'user' | 'agent'
  text: string
  timestamp: Date
}

interface ChatAction {
  type: 'add_task' | 'complete_task' | 'move_task' | 'delete_task' | 'reschedule'
  data: {
    title?: string
    priority?: 'high' | 'medium' | 'low'
    category?: 'business' | 'client' | 'school' | 'personal' | 'health'
    scheduledDate?: string
    scheduledTime?: string
    deadline?: string | null
    taskId?: string
    query?: string
    newDate?: string
  }
}

function executeAction(action: ChatAction): string | null {
  try {
    switch (action.type) {
      case 'add_task': {
        const d = action.data
        const task = addTask({
          title: d.title || 'Untitled task',
          priority: d.priority || 'medium',
          category: d.category || 'personal',
          scheduledDate: d.scheduledDate || today(),
          scheduledTime: d.scheduledTime,
          deadline: d.deadline || undefined,
          status: 'todo',
        })
        return `✅ Added: "${task.title}"`
      }
      case 'complete_task': {
        const tasks = getTasks()
        const q = (action.data.query || action.data.title || '').toLowerCase()
        const match = tasks.find(t => t.status !== 'done' && t.title.toLowerCase().includes(q))
        if (match) {
          updateTask(match.id, { status: 'done', completedAt: new Date().toISOString() })
          return `✅ Completed: "${match.title}"`
        }
        return `⚠️ Couldn't find a task matching "${q}"`
      }
      case 'move_task':
      case 'reschedule': {
        const tasks = getTasks()
        const q = (action.data.query || action.data.title || '').toLowerCase()
        const match = tasks.find(t => t.status !== 'done' && t.title.toLowerCase().includes(q))
        if (match && action.data.newDate) {
          updateTask(match.id, { scheduledDate: action.data.newDate })
          return `📅 Moved "${match.title}" to ${action.data.newDate}`
        }
        if (match && action.data.scheduledDate) {
          updateTask(match.id, { scheduledDate: action.data.scheduledDate })
          return `📅 Moved "${match.title}" to ${action.data.scheduledDate}`
        }
        return `⚠️ Couldn't find/move task`
      }
      case 'delete_task': {
        const tasks = getTasks()
        const q = (action.data.query || action.data.title || '').toLowerCase()
        const match = tasks.find(t => t.title.toLowerCase().includes(q))
        if (match) {
          updateTask(match.id, { status: 'done' })
          return `🗑 Removed: "${match.title}"`
        }
        return `⚠️ Couldn't find task to delete`
      }
      default:
        return null
    }
  } catch {
    return '⚠️ Failed to update'
  }
}

export default function ChatAgent({ onScheduleChange }: { onScheduleChange?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: "What's up? Tell me what to add, move, or check off. 🎤",
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { addMsg('agent', "Voice not supported — try Chrome."); return }

    const r = new SR()
    recognitionRef.current = r
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-CA'

    let finalTranscript = ''

    r.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
        else interim += event.results[i][0].transcript
      }
      setInput(finalTranscript + interim)
    }

    r.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) handleSend(finalTranscript.trim())
    }

    r.onerror = () => setIsListening(false)
    r.start()
    setIsListening(true)
    setInput('')
  }

  function addMsg(role: 'user' | 'agent', text: string) {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, text, timestamp: new Date() }])
  }

  async function handleSend(voiceText?: string) {
    const text = voiceText || input.trim()
    if (!text || isProcessing) return

    addMsg('user', text)
    setInput('')
    setIsProcessing(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).map(m => ({ role: m.role, text: m.text })),
        }),
      })

      const data = await res.json()
      const reply = data.reply || "Done!"

      // Execute action if present
      if (data.action && data.action.type) {
        const result = executeAction(data.action as ChatAction)
        addMsg('agent', reply + (result ? `\n\n${result}` : ''))
        onScheduleChange?.()
      } else {
        addMsg('agent', reply)
      }
    } catch {
      addMsg('agent', "Connection issue — try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-[var(--accent)] shadow-lg flex items-center justify-center active:scale-95 transition-all">
        <span className="text-2xl">💬</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-semibold text-base">Schedule Agent</h2>
          <p className="text-[11px] text-[var(--text-muted)]">Voice or text — changes update instantly</p>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-[var(--text-muted)] text-2xl p-2 -mr-2">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-[var(--accent)] text-white rounded-br-sm'
                : 'bg-[var(--card)] rounded-bl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-[var(--card)] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-[var(--text-muted)]">
              ⏳ Working on it...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="flex items-center gap-2">
          <button
            onClick={isListening ? () => { recognitionRef.current?.stop(); setIsListening(false) } : startListening}
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              isListening ? 'bg-red-500 animate-pulse' : 'bg-[var(--card)]'
            }`}>
            <span className="text-xl">{isListening ? '⏹' : '🎤'}</span>
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={isListening ? 'Listening...' : 'Add meeting at 3pm...'}
            className="flex-1 bg-[var(--card)] rounded-xl px-4 py-3 text-[15px] outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          />
          <button onClick={() => handleSend()} disabled={!input.trim() || isProcessing}
            className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0 disabled:opacity-30 active:scale-95">
            <span className="text-xl">↑</span>
          </button>
        </div>
      </div>
    </div>
  )
}
