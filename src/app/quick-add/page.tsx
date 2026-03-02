'use client'

import { useState } from 'react'

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' ') }

export default function QuickAddPage() {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [category, setCategory] = useState<'business' | 'client' | 'school' | 'personal' | 'health'>('personal')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), priority, category }),
      })

      const data = await res.json()
      if (data.success) {
        setResult(`✅ Added: "${data.task.title}"`)
        setText('')
      } else {
        setResult(`❌ Error: ${data.error}`)
      }
    } catch {
      setResult('❌ Failed to add task')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Quick Add Task</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">Add to your planner instantly</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What do you need to do?"
            className="w-full bg-[var(--card)] rounded-xl px-4 py-4 text-[16px] border border-[var(--border)] outline-none focus:border-[var(--accent)]"
          />

          <div className="flex gap-2">
            {(['high', 'medium', 'low'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-sm capitalize border',
                  priority === p
                    ? p === 'high' ? 'border-red-400 bg-red-500/20 text-red-400' 
                    : p === 'medium' ? 'border-amber-400 bg-amber-500/20 text-amber-400' 
                    : 'border-emerald-400 bg-emerald-500/20 text-emerald-400'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {(['business', 'client', 'school', 'personal', 'health'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'px-3 py-2 rounded-xl text-sm capitalize border',
                  category === c 
                    ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' 
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!text.trim() || loading}
            className="w-full py-4 rounded-xl bg-[var(--accent)] text-white font-bold text-[16px] active:scale-95 disabled:opacity-30"
          >
            {loading ? 'Adding...' : 'Add Task'}
          </button>
        </form>

        {result && (
          <div className="mt-4 p-4 rounded-xl bg-[var(--card)] text-center">
            <p className="text-sm">{result}</p>
          </div>
        )}

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-[var(--accent)] underline">
            ← Back to planner
          </a>
        </div>

        <div className="mt-8 p-4 bg-[var(--card)] rounded-xl">
          <h3 className="text-sm font-bold mb-2">📱 iOS Shortcut Instructions:</h3>
          <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
            <li>Open Shortcuts app on iPhone</li>
            <li>Create new shortcut</li>
            <li>Add "Ask for Input" (Text)</li>
            <li>Add "Get Contents of URL" → POST to: <code className="bg-[var(--bg)] px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : 'https://adam-planner.vercel.app'}/api/quick-add</code></li>
            <li>In Request Body: <code className="bg-[var(--bg)] px-1 rounded">{`{"text": "{{Provided Input}}"}`}</code></li>
            <li>Add to Siri: "Add to my planner"</li>
          </ol>
        </div>
      </div>
    </div>
  )
}