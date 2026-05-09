'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BrainEntry {
  id: string
  name: string
  domain: string
  type: string
  source: string
  dateAdded: string
  tags: string[]
  status: string
  fullNote: string
}

const DOMAINS = ['SWS', 'Content', 'School', 'Personal', 'Life', 'Training']

const DOMAIN_COLORS: Record<string, string> = {
  SWS: 'bg-blue-500/20 text-blue-400',
  Content: 'bg-purple-500/20 text-purple-400',
  School: 'bg-yellow-500/20 text-yellow-400',
  Personal: 'bg-green-500/20 text-green-400',
  Life: 'bg-orange-500/20 text-orange-400',
  Training: 'bg-red-500/20 text-red-400',
}

const TYPE_COLORS: Record<string, string> = {
  Lesson: 'text-blue-400',
  Framework: 'text-purple-400',
  Decision: 'text-orange-400',
  Insight: 'text-green-400',
  Idea: 'text-yellow-400',
  Reference: 'text-gray-400',
  'Client Note': 'text-pink-400',
}

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BrainView() {
  const [entries, setEntries] = useState<BrainEntry[]>([])
  const [syntheses, setSyntheses] = useState<BrainEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDomain, setActiveDomain] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeDomain) params.set('domain', activeDomain)
      params.set('limit', '50')

      const [entriesRes, synthRes] = await Promise.all([
        fetch(`/api/brain?${params}`),
        fetch('/api/brain?syntheses=true&limit=5'),
      ])

      const entriesData = await entriesRes.json()
      const synthData = await synthRes.json()

      // Filter out syntheses from main entries
      const synthIds = new Set((synthData.entries || []).map((e: BrainEntry) => e.id))
      setEntries((entriesData.entries || []).filter((e: BrainEntry) => !synthIds.has(e.id)))
      setSyntheses(synthData.entries || [])
    } catch (e) {
      console.error('Failed to fetch brain data:', e)
    } finally {
      setLoading(false)
    }
  }, [activeDomain])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCount = entries.length + syntheses.length

  return (
    <div className="space-y-5 pt-2">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">🧠 Brain</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          {loading ? 'Loading...' : `${totalCount} knowledge entries`}
        </p>
      </div>

      {/* Domain filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        <button
          onClick={() => setActiveDomain(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !activeDomain ? 'bg-[var(--accent)] text-white' : 'glass-card text-[var(--text-muted)]'
          }`}
        >
          All
        </button>
        {DOMAINS.map(d => (
          <button
            key={d}
            onClick={() => setActiveDomain(activeDomain === d ? null : d)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeDomain === d ? 'bg-[var(--accent)] text-white' : 'glass-card text-[var(--text-muted)]'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-2/3 mb-3" />
              <div className="h-3 bg-white/5 rounded w-full mb-2" />
              <div className="h-3 bg-white/5 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Weekly Syntheses — Featured */}
          {syntheses.length > 0 && !activeDomain && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Weekly Syntheses</h2>
              {syntheses.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card gradient-border p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-snug">{s.name}</h3>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatDate(s.dateAdded)}</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{s.fullNote}</p>
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {s.tags.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[var(--text-muted)]">{t}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* All Entries */}
          <div className="space-y-3">
            {(syntheses.length > 0 && !activeDomain) && (
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Knowledge Entries</h2>
            )}

            <AnimatePresence mode="popLayout">
              {entries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  className="glass-card p-4 space-y-2 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-snug flex-1">{entry.name}</h3>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatDate(entry.dateAdded)}</span>
                  </div>

                  {/* Domain + Type badges */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DOMAIN_COLORS[entry.domain] || 'bg-white/5 text-gray-400'}`}>
                      {entry.domain}
                    </span>
                    <span className={`text-[10px] font-medium ${TYPE_COLORS[entry.type] || 'text-gray-400'}`}>
                      {entry.type}
                    </span>
                  </div>

                  {/* Full Note — shown on expand or always for short notes */}
                  <AnimatePresence>
                    {(expanded === entry.id || entry.fullNote.length < 120) ? (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-sm text-[var(--text-muted)] leading-relaxed"
                      >
                        {entry.fullNote}
                      </motion.p>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)] leading-relaxed line-clamp-2">
                        {entry.fullNote}
                      </p>
                    )}
                  </AnimatePresence>

                  {/* Tags */}
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {entry.tags.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[var(--text-muted)]">{t}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {entries.length === 0 && !loading && (
              <div className="glass-card p-6 text-center">
                <p className="text-[var(--text-muted)]">
                  {activeDomain ? `No ${activeDomain} entries yet` : 'No brain entries yet'}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Capture ideas with your back-tap shortcut — they'll appear here after processing.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
