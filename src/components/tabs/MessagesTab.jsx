import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../supabase.js'

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  const now = new Date()
  const diff = now - dt
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MessagesTab({ theme, addToast, logAdminAction, onUnreadCountChange }) {
  const C = theme
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingReply, setSendingReply] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastConfirm, setBroadcastConfirm] = useState('')
  const [broadcastStep, setBroadcastStep] = useState(1)
  const [totalUserCount, setTotalUserCount] = useState(0)
  const threadRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('contact_messages')
        .select('id, user_id, body, created_at, is_read, is_admin_reply, is_resolved, subject, profiles(full_name, email)')
        .order('created_at', { ascending: false })
      if (filter === 'unread') query = query.eq('is_read', false).eq('is_admin_reply', false)
      if (filter === 'resolved') query = query.eq('is_resolved', true)
      if (search) query = query.ilike('body', `%${search}%`)
      const { data } = await query.limit(50)
      const msgs = data || []
      // Group by user_id
      const groups = {}
      msgs.forEach(m => {
        const uid = m.user_id || 'unknown'
        if (!groups[uid]) {
          groups[uid] = { user_id: uid, profile: m.profiles, messages: [], lastMessage: m, unreadCount: 0 }
        }
        groups[uid].messages.push(m)
        if (!m.is_read && !m.is_admin_reply) groups[uid].unreadCount++
        if (new Date(m.created_at) > new Date(groups[uid].lastMessage.created_at)) groups[uid].lastMessage = m
      })
      const convList = Object.values(groups).sort((a, b) => {
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
        return new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)
      })
      setConversations(convList)
      const unread = convList.reduce((sum, c) => sum + c.unreadCount, 0)
      onUnreadCountChange && onUnreadCountChange(unread)

      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
      setTotalUserCount(count || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filter, search, onUnreadCountChange])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const selectConversation = async (conv) => {
    setSelectedConv(conv)
    setMessages(conv.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
    // Mark as read
    const unreadIds = conv.messages.filter(m => !m.is_read && !m.is_admin_reply).map(m => m.id)
    if (unreadIds.length > 0) {
      await supabase.from('contact_messages').update({ is_read: true }).in('id', unreadIds)
      fetchConversations()
    }
    setTimeout(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
    }, 100)
  }

  const sendReply = async () => {
    if (!reply.trim() || !selectedConv) return
    setSendingReply(true)
    try {
      const { data } = await supabase.from('contact_messages').insert({
        user_id: selectedConv.user_id,
        body: reply,
        is_admin_reply: true,
        is_read: true,
        created_at: new Date().toISOString()
      }).select().single()
      const newMsg = data || { id: Date.now(), body: reply, is_admin_reply: true, created_at: new Date().toISOString() }
      setMessages(prev => [...prev, newMsg])
      setReply('')
      addToast('Reply sent', 'success')
      logAdminAction('message_sent', { userId: selectedConv.user_id })
      setTimeout(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, 100)
    } catch { addToast('Failed to send', 'error') }
    setSendingReply(false)
  }

  const markResolved = async () => {
    if (!selectedConv) return
    const ids = selectedConv.messages.map(m => m.id)
    try {
      await supabase.from('contact_messages').update({ is_resolved: true }).in('id', ids)
      addToast('Conversation resolved', 'success')
      logAdminAction('message_resolved', { userId: selectedConv.user_id })
      fetchConversations()
      setSelectedConv(null)
    } catch { addToast('Failed to resolve', 'error') }
  }

  const sendBroadcast = async () => {
    if (broadcastConfirm !== 'BROADCAST') return
    try {
      const { data: allUsers } = await supabase.from('profiles').select('id')
      const inserts = (allUsers || []).map(u => ({
        user_id: u.id, body: broadcastText, is_broadcast: true, is_admin_reply: true, is_read: true, created_at: new Date().toISOString()
      }))
      await supabase.from('contact_messages').insert(inserts)
      addToast(`Broadcast sent to ${inserts.length} users`, 'success')
      logAdminAction('broadcast_sent', { count: inserts.length, message: broadcastText.slice(0, 50) })
      setBroadcastText(''); setBroadcastConfirm(''); setBroadcastStep(1); setShowBroadcast(false)
    } catch { addToast('Broadcast failed', 'error') }
  }

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'read', label: 'Read' },
    { key: 'resolved', label: 'Resolved' }
  ]

  return (
    <div style={{ display: 'flex', height: '100%', background: C.bg }}>
      {/* Left panel */}
      <div style={{ width: 320, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.card, flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Messages</h3>
            <button
              onClick={() => setShowBroadcast(!showBroadcast)}
              style={{ padding: '6px 10px', background: showBroadcast ? '#4A7A68' : C.bg, color: showBroadcast ? '#fff' : C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            >
              📢 Broadcast
            </button>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages..."
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', marginBottom: 10, boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
          />
          <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 0 }}>
            {filterTabs.map(ft => (
              <button key={ft.key} onClick={() => setFilter(ft.key)} style={{
                padding: '7px 10px', background: 'none', border: 'none', fontSize: 12,
                color: filter === ft.key ? '#4A7A68' : C.textMuted,
                borderBottom: filter === ft.key ? '2px solid #4A7A68' : '2px solid transparent',
                cursor: 'pointer', fontWeight: filter === ft.key ? 600 : 400
              }}>{ft.label}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 13 }}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No conversations found</div>
          ) : conversations.map(conv => {
            const profile = conv.profile
            const name = profile?.full_name || profile?.email || 'Unknown'
            const isActive = selectedConv?.user_id === conv.user_id
            return (
              <div
                key={conv.user_id}
                onClick={() => selectConversation(conv)}
                style={{
                  padding: '13px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                  background: isActive ? C.bg : 'transparent',
                  display: 'flex', gap: 10, alignItems: 'flex-start'
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#4A7A68', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: conv.unreadCount > 0 ? 700 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{name}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{formatDate(conv.lastMessage.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessage.body?.slice(0, 50)}
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#4A7A68', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {showBroadcast ? (
          <div style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
            <div style={{ maxWidth: 560 }}>
              <h3 style={{ margin: '0 0 6px', color: C.text, fontSize: 18, fontWeight: 700 }}>📢 Broadcast Message</h3>
              <p style={{ margin: '0 0 20px', color: C.textMuted, fontSize: 13 }}>Send a message to all {totalUserCount} users. This cannot be undone.</p>
              {broadcastStep === 1 && (
                <>
                  <textarea
                    value={broadcastText}
                    onChange={e => setBroadcastText(e.target.value)}
                    placeholder="Write your broadcast message..."
                    rows={6}
                    style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.card, color: C.text, fontFamily: 'Inter, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <button
                    disabled={!broadcastText.trim()}
                    onClick={() => setBroadcastStep(2)}
                    style={{ marginTop: 12, padding: '10px 20px', background: broadcastText.trim() ? '#4A7A68' : '#9CA3AF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: broadcastText.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    Next: Confirm
                  </button>
                </>
              )}
              {broadcastStep === 2 && (
                <div style={{ padding: 20, background: '#FEF3C7', borderRadius: 12, border: '1px solid #FCD34D' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#92400E' }}>⚠️ Final Confirmation</h4>
                  <div style={{ background: C.card, padding: 14, borderRadius: 8, marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>"{broadcastText}"</div>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#92400E' }}>This will be sent to <strong>{totalUserCount}</strong> users. Type <strong>BROADCAST</strong> to confirm:</p>
                  <input value={broadcastConfirm} onChange={e => setBroadcastConfirm(e.target.value)} placeholder="BROADCAST" style={{ width: '100%', padding: '10px 12px', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 14, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={broadcastConfirm !== 'BROADCAST'}
                      onClick={sendBroadcast}
                      style={{ padding: '10px 20px', background: broadcastConfirm === 'BROADCAST' ? '#C96A52' : '#FCA5A5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: broadcastConfirm === 'BROADCAST' ? 'pointer' : 'not-allowed' }}
                    >
                      Send Broadcast
                    </button>
                    <button onClick={() => { setBroadcastStep(1); setBroadcastConfirm('') }} style={{ padding: '10px 20px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, cursor: 'pointer', color: C.text }}>Back</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : selectedConv ? (
          <>
            {/* Thread header */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.card, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                  {selectedConv.profile?.full_name || 'Unknown User'}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{selectedConv.profile?.email}</div>
              </div>
              <button onClick={markResolved} style={{ padding: '7px 14px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ✓ Mark Resolved
              </button>
            </div>
            {/* Thread */}
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.is_admin_reply ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '72%', padding: '10px 14px', borderRadius: 14,
                    background: m.is_admin_reply ? '#4A7A68' : C.card,
                    color: m.is_admin_reply ? '#fff' : C.text,
                    border: m.is_admin_reply ? 'none' : `1px solid ${C.border}`,
                    fontSize: 14, lineHeight: 1.5
                  }}>
                    <div>{m.body}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 5, textAlign: m.is_admin_reply ? 'right' : 'left' }}>
                      {m.is_admin_reply ? 'Admin · ' : ''}{formatDate(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Reply box */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Type a reply..."
                  rows={3}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) sendReply() }}
                  style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', outline: 'none', resize: 'none' }}
                />
                <button
                  onClick={sendReply}
                  disabled={sendingReply || !reply.trim()}
                  style={{ padding: '10px 18px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' }}
                >
                  Send
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Cmd+Enter to send</div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Select a conversation</div>
            <div style={{ fontSize: 13 }}>Choose a message from the left panel</div>
          </div>
        )}
      </div>
    </div>
  )
}
