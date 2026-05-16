import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase.js'

function debounce(fn, delay) {
  let timer
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay) }
}

export function GlobalSearch({ isOpen, onClose, onNavigate, theme }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ users: [], messages: [], events: [] })
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const C = theme

  const search = useCallback(debounce(async (q) => {
    if (!q.trim()) { setResults({ users: [], messages: [], events: [] }); return }
    setLoading(true)
    try {
      const [usersRes, messagesRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, tier, status, is_minor').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
        supabase.from('contact_messages').select('id, user_id, body, created_at, profiles(full_name, email)').ilike('body', `%${q}%`).limit(3),
        supabase.from('app_events').select('id, user_id, event_type, created_at, profiles(full_name, email)').ilike('event_type', `%${q}%`).limit(3)
      ])
      setResults({
        users: usersRes.data || [],
        messages: messagesRes.data || [],
        events: eventsRes.data || []
      })
    } catch {
      setResults({ users: [], messages: [], events: [] })
    } finally {
      setLoading(false)
    }
  }, 300), [])

  useEffect(() => { search(query) }, [query, search])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setResults({ users: [], messages: [], events: [] })
      setSelectedIndex(0)
    }
  }, [isOpen])

  const allResults = [
    ...results.users.map(u => ({ type: 'user', id: u.id, title: u.full_name || 'Unknown', subtitle: u.email, meta: u.tier, tabId: 'users', raw: u })),
    ...results.messages.map(m => ({ type: 'message', id: m.id, title: m.body?.slice(0, 60) + (m.body?.length > 60 ? '…' : ''), subtitle: m.profiles?.full_name || m.profiles?.email || 'Unknown', meta: new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }), tabId: 'messages' })),
    ...results.events.map(e => ({ type: 'event', id: e.id, title: e.event_type?.replace(/_/g, ' '), subtitle: e.profiles?.full_name || e.profiles?.email || 'Unknown', meta: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }), tabId: 'activity' }))
  ]

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allResults.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && allResults[selectedIndex]) handleSelect(allResults[selectedIndex])
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, allResults, selectedIndex, onClose])

  const handleSelect = (item) => {
    onNavigate(item.tabId)
    onClose()
  }

  const typeIcon = { user: '👤', message: '💬', event: '⚡' }
  const typeLabel = { user: 'Users', message: 'Messages', event: 'Events' }
  const typeColor = { user: '#4A7A68', message: '#3B82F6', event: '#C9973A' }

  const groupedTypes = ['user', 'message', 'event']

  if (!isOpen) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: C.card, borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <span style={{ fontSize: 18, color: C.textMuted }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="Search users, messages, events..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, background: 'transparent', color: C.text, fontFamily: 'Inter, sans-serif' }}
          />
          {loading && <span style={{ fontSize: 12, color: C.textMuted }}>Searching...</span>}
          <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px', fontSize: 11, color: C.textMuted }}>ESC</kbd>
        </div>

        {/* Empty state */}
        {allResults.length === 0 && !query && !loading && (
          <div style={{ padding: 24 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textMuted }}>Search users by name or email, messages by content, or events by type.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['↑↓ Navigate', '↵ Select', 'ESC Close'].map(tip => (
                <kbd key={tip} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, color: C.textMuted }}>{tip}</kbd>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {allResults.length === 0 && query && !loading && (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
            No results found for "<strong>{query}</strong>"
          </div>
        )}

        {/* Results grouped by type */}
        {allResults.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {groupedTypes.map(type => {
              const items = allResults.filter(r => r.type === type)
              if (items.length === 0) return null
              return (
                <div key={type}>
                  <div style={{ padding: '8px 18px 4px', fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, background: C.bg }}>
                    {typeIcon[type]} {typeLabel[type]}
                  </div>
                  {items.map((item) => {
                    const globalIdx = allResults.indexOf(item)
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        style={{
                          padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                          background: selectedIndex === globalIdx ? C.bg : 'transparent',
                          borderBottom: `1px solid ${C.border}`, transition: 'background 0.1s'
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: typeColor[item.type] + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          {typeIcon[item.type]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {item.meta && <span style={{ fontSize: 11, background: typeColor[item.type] + '20', color: typeColor[item.type], padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{item.meta}</span>}
                          <span style={{ fontSize: 11, color: C.textMuted }}>→ {typeLabel[item.type]}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
