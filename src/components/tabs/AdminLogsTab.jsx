import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

const ACTION_TYPES = ['all', 'login', 'tier_change', 'broadcast', 'fraud_action', 'reward_approval', 'gdpr_request', 'note_added', 'user_deleted', 'report_generated', 'cron_trigger', 'export_csv']

const ACTION_COLORS = {
  login: '#3B82F6',
  tier_change: '#8B5CF6',
  broadcast: '#C96A52',
  fraud_action: '#EF4444',
  reward_approval: '#10B981',
  gdpr_request: '#F59E0B',
  note_added: '#6B7280',
  user_deleted: '#EF4444',
  report_generated: '#4A7A68',
  cron_trigger: '#C9973A',
  export_csv: '#3B82F6'
}

export default function AdminLogsTab({ theme, addToast }) {
  const C = theme
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [localAuditLog, setLocalAuditLog] = useState([])

  const sessionId = sessionStorage.getItem('niyama_session_id') || 'unknown'
  const loginTime = sessionStorage.getItem('niyama_login_time')
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'sahil@niyamalife.com'

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('admin_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setSessions(data || [])
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    // Load local audit log
    const stored = localStorage.getItem('niyama_audit_log')
    if (stored) {
      try { setLocalAuditLog(JSON.parse(stored)) } catch { setLocalAuditLog([]) }
    }
  }, [fetchData])

  const exportAuditLog = () => {
    const allEntries = [...localAuditLog, ...sessions.map(s => ({
      timestamp: s.created_at,
      action: s.action_type || 'session',
      description: s.details || 'Admin session',
      admin: s.admin_email || adminEmail,
      affectedUser: s.affected_user_id || '—'
    }))]
    const headers = ['Timestamp', 'Action', 'Description', 'Admin', 'Affected User']
    const rows = allEntries.map(e => [
      e.timestamp, e.action, e.description, e.admin || adminEmail, e.affectedUser || '—'
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'niyama-audit-log.csv'; a.click()
    URL.revokeObjectURL(url)
    addToast('Audit log exported', 'success')
  }

  const actionCount = localAuditLog.length

  const filteredLog = localAuditLog
    .filter(entry => actionFilter === 'all' || entry.action === actionFilter)
    .filter(entry => !search || JSON.stringify(entry).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const inputStyle = { padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif' }
  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Admin Logs</h2>

      {/* Current Session */}
      <div style={{ ...sectionStyle, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>Current Session</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { label: 'Admin', value: 'Sahil Inamdar' },
            { label: 'Email', value: adminEmail },
            { label: 'Session ID', value: sessionId.slice(0, 16) + '...' },
            { label: 'Login Time', value: loginTime ? formatDateTime(loginTime) : 'Unknown' },
            { label: 'Actions This Session', value: actionCount },
            { label: 'Status', value: '🟢 Active' }
          ].map(item => (
            <div key={item.label} style={{ padding: '12px 14px', background: '#fff', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Session History */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Session History</h3>
        {loading ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No session history found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {['Login Time', 'Duration', 'Admin', 'Actions', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const duration = s.logout_time
                  ? Math.round((new Date(s.logout_time) - new Date(s.created_at)) / 60000) + ' min'
                  : 'Active'
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '12px', color: C.text }}>{formatDateTime(s.created_at)}</td>
                    <td style={{ padding: '12px', color: C.textMuted }}>{duration}</td>
                    <td style={{ padding: '12px', color: C.text }}>{s.admin_email || adminEmail}</td>
                    <td style={{ padding: '12px', color: C.text }}>{s.action_count || 0}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: s.logout_time ? '#F3F4F6' : '#D1FAE5',
                        color: s.logout_time ? '#6B7280' : '#065F46'
                      }}>
                        {s.logout_time ? 'Ended' : 'Active'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Full Audit Log */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Full Audit Log ({localAuditLog.length} entries)</h3>
          <button onClick={exportAuditLog} style={{ padding: '7px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Export CSV
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs..." style={{ ...inputStyle, minWidth: 220 }} />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {ACTION_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Actions' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {filteredLog.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {localAuditLog.length === 0
              ? 'No admin actions logged yet this session. Actions like tier changes, broadcasts, and reward approvals will appear here.'
              : 'No matching log entries'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {['Timestamp', 'Action Type', 'Description', 'Admin', 'Affected User'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLog.slice(0, 100).map((entry, i) => {
                const color = ACTION_COLORS[entry.action] || '#6B7280'
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 12px', color: C.textMuted, whiteSpace: 'nowrap' }}>{formatDateTime(entry.timestamp)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: color + '20', color }}>
                        {entry.action?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: C.text }}>{entry.description || '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.textMuted }}>{entry.admin || adminEmail}</td>
                    <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12 }}>{entry.affectedUser || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
