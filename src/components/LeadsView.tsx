'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Client {
  id: string
  name: string
  business_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string
}

export default function LeadsView() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', business_name: '', phone: '', email: '', notes: '' })

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      if (data.clients) setClients(data.clients)
    } catch (e) {
      console.error('Failed to fetch clients:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  async function addClient() {
    if (!form.name.trim()) return
    await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ name: '', business_name: '', phone: '', email: '', notes: '' })
    setShowAdd(false)
    fetchClients()
  }

  async function updateClient(id: string, updates: Partial<Client>) {
    await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    setEditing(null)
    fetchClients()
  }

  async function removeClient(id: string) {
    await fetch('/api/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchClients()
  }

  function startEdit(c: Client) {
    setEditing(c.id)
    setForm({
      name: c.name,
      business_name: c.business_name || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '',
    })
  }

  return (
    <div className="space-y-4">
      <div className="pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {clients.length} active client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditing(null); setForm({ name: '', business_name: '', phone: '', email: '', notes: '' }) }}
          className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] active:scale-95 transition-transform"
        >
          + Add
        </button>
      </div>

      {/* Add / Edit form */}
      <AnimatePresence>
        {(showAdd || editing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass-card px-4 py-3 space-y-2 overflow-hidden"
          >
            <input
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name *" className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
              placeholder="Business name" className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone" className="bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email" className="bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Notes" className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-1">
              {editing ? (
                <>
                  <button onClick={() => updateClient(editing, form)}
                    className="flex-1 text-sm font-semibold py-2 rounded-lg bg-[var(--accent)] text-white active:scale-95 transition-transform">
                    Save
                  </button>
                  <button onClick={() => { removeClient(editing) }}
                    className="text-sm font-semibold px-4 py-2 rounded-lg bg-red-500/20 text-red-400 active:scale-95 transition-transform">
                    Remove
                  </button>
                  <button onClick={() => { setEditing(null); setForm({ name: '', business_name: '', phone: '', email: '', notes: '' }) }}
                    className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-muted)] active:scale-95 transition-transform">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={addClient}
                    className="flex-1 text-sm font-semibold py-2 rounded-lg bg-[var(--accent)] text-white active:scale-95 transition-transform">
                    Add Client
                  </button>
                  <button onClick={() => setShowAdd(false)}
                    className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-muted)] active:scale-95 transition-transform">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--text-muted)]">Loading clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm text-[var(--text-muted)]">No active clients yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Add people you&apos;re currently working with</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map(client => (
            <motion.div key={client.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card px-4 py-3 space-y-1.5 active:scale-[0.99] transition-transform"
              onClick={() => { if (!editing) startEdit(client) }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] truncate">{client.name}</p>
                  {client.business_name && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{client.business_name}</p>
                  )}
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 shrink-0">
                  Active
                </span>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                {client.phone && (
                  <a href={`tel:${client.phone}`} onClick={e => e.stopPropagation()} className="text-[var(--accent)] active:opacity-70">
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} onClick={e => e.stopPropagation()} className="text-[var(--accent)] active:opacity-70">
                    {client.email}
                  </a>
                )}
                {client.notes && <span>{client.notes}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
