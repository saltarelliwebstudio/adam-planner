'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'agent'
  text: string
  timestamp: Date
}

export default function ChatAgent({ onScheduleChange }: { onScheduleChange?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: "Hey Adam 👋 I'm your schedule agent. Tell me what you need — add tasks, move things around, or just ask what's next. Voice or text, whatever's easier.",
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Voice input via Web Speech API
  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addMessage('agent', "Sorry, your browser doesn't support voice input. Try Chrome on your phone.")
      return
    }

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        } else {
          interim += event.results[i][0].transcript
        }
      }
      setInput(finalTranscript + interim)
    }

    recognition.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim())
        // Auto-send after voice
        handleSend(finalTranscript.trim())
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.start()
    setIsListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  function addMessage(role: 'user' | 'agent', text: string) {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role,
      text,
      timestamp: new Date(),
    }])
  }

  async function handleSend(voiceText?: string) {
    const text = voiceText || input.trim()
    if (!text || isProcessing) return

    addMessage('user', text)
    setInput('')
    setIsProcessing(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).map(m => ({ role: m.role, text: m.text }))
        }),
      })

      const data = await res.json()
      addMessage('agent', data.reply || "Got it, I've updated your schedule.")

      if (data.action) {
        onScheduleChange?.()
      }
    } catch {
      addMessage('agent', "I'm having trouble connecting right now. Try again in a sec.")
    } finally {
      setIsProcessing(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow-lg flex items-center justify-center transition-all active:scale-95"
      >
        <span className="text-2xl">💬</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-semibold">Schedule Agent</h2>
          <p className="text-xs text-[var(--text-muted)]">Voice or text — I'll handle the rest</p>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-[var(--text-muted)] text-xl p-2">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-container">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-[var(--accent)] text-white rounded-br-md'
                : 'bg-[var(--card)] text-[var(--text)] rounded-bl-md'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-[var(--card)] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-[var(--text-muted)]">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-2">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              isListening
                ? 'bg-red-500 animate-pulse'
                : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'
            }`}
          >
            <span className="text-lg">{isListening ? '⏹' : '🎤'}</span>
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening...' : 'Tell me what to change...'}
            className="flex-1 bg-[var(--card)] rounded-xl px-4 py-2.5 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            className="w-10 h-10 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center justify-center flex-shrink-0 disabled:opacity-50 transition-all"
          >
            <span className="text-lg">↑</span>
          </button>
        </div>
      </div>
    </div>
  )
}
