import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { getHabitLabel } from '../../config.js'

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

const EVENT_ICONS = {
  login: '🔑',
  logout: '🚪',
  signup: '📝',
  habit_complete: '✅',
  reward_request: '💰',
  reward_paid: '🎁',
  fraud_flag: '⚠️',
  tier_change: '⬆️',
  milestone: '🏆',
  push_notification: '🔔',
  delete_account: '🗑️',
  default: '📌'
}

const EVENT_COLORS = {
  login: '#3B82F6',
  logout: '#6B7280',
  signup: '#10B981',
  habit_complete: '#4A7A68',
  reward_request: '#C9973A',
  reward_paid: '#10B981',
  fraud_flag: '#EF4444',
  tier_change: '#8B5CF6',
  milestone: '#F59E0B',
  default: '#6B7280'
}

const EVENT_TYPES = ['all', 'login', 'logout', 'signup', 'habit_complete', 'reward_request', 'fraud_flag', 'tier_change', 'milestone']

export default function ActivityTab({ theme, addToast }) {
  const C = theme
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [summaryStats, setSummaryStats] = useState([])
  const PER_PAGE = 50

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('app_events')
        .select('id, event_type, user_id, event_data, created_at, profiles(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (typeFilter !== 'all') query = query.eq('event_type', typeFilter)
      query = query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
      const { data, count, error } = await query
      if (error) throw error
      setEvents(data || [])
      setTotalCount(count || 0)

      // Summary stats
      const { data: statsData } = await supabase
        .from('app_events')
        .select('event_type')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      const statMap = {}
      if (statsData) statsData.forEach(e => { statMap[e.event_type] = (statMap[e.event_type] || 0) + 1 })
      const statsArr = Object.entries(statMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({ type, count }))
      setSummaryStats(statsArr)
    } catch (err) {
      console.error(err)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter, page])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const totalPages = Math.ceil(totalCount / PER_PAGE)

  const inputStyle = { padding: '9px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.card, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Activity Feed</h2>

      {/* Summary cards */}
      {summaryStats.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {summaryStats.map(stat => (
            <div key={stat.type} style={{ flex: 1, minWidth: 110, background: C.card, borderRadius: 12, padding: '14px 16px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{EVENT_ICONS[stat.type] || EVENT_ICONS.default}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{stat.count.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, marginTop: 2 }}>{stat.type.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search by user or event..." style={{ ...inputStyle, minWidth: 220 }} />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {EVENT_TYPES.map(t => (
            <option key={t} value={t}>{t === 'all' ? 'All Event Types' : t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Feed */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>Loading events...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>No events found</div>
            <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
          </div>
        ) : (
          <>
            {events
              .filter(e => !search || (e.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase()) || (e.profiles?.email || '').toLowerCase().includes(search.toLowerCase()))
              .map((event, i) => {
                const icon = EVENT_ICONS[event.event_type] || EVENT_ICONS.default
                const color = EVENT_COLORS[event.event_type] || EVENT_COLORS.default
                const profile = event.profiles || {}
                const meta = event.event_data || {}
                let description = ''
                if (event.event_type === 'habit_complete') description = `Completed ${getHabitLabel(meta.habit_id) || 'a habit'} for ${meta.points || 0} pts`
                else if (event.event_type === 'reward_request') description = `Requested reward of $${Number(meta.amount || 0).toFixed(2)}`
                else if (event.event_type === 'tier_change') description = `Changed tier from ${meta.from || '?'} to ${meta.to || '?'}`
                else if (event.event_type === 'signup') description = 'Created account'
                else if (event.event_type === 'login') description = `Logged in${meta.device ? ` from ${meta.device}` : ''}`
                else if (event.event_type === 'fraud_flag') description = `Fraud score: ${meta.score || 0}`
                else description = JSON.stringify(meta).slice(0, 60)

                return (
                  <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < events.length - 1 ? `1px solid ${C.border}` : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: color + '20', color, flexShrink: 0 }}>
                          {event.event_type?.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {profile.full_name || profile.email || `User ${event.user_id?.slice(0, 8) || '?'}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>{description || 'No details'}</div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>{formatDateTime(event.created_at)}</div>
                  </div>
                )
              })}
          </>
        )}

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <span style={{ fontSize: 13, color: C.textMuted }}>
            {Math.min((page - 1) * PER_PAGE + 1, totalCount)}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount.toLocaleString()} events
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? C.textMuted : C.text }}>← Prev</button>
            <span style={{ padding: '6px 10px', fontSize: 13, color: C.text }}>Page {page} of {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: page >= totalPages ? C.textMuted : C.text }}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
