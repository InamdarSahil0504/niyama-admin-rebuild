import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../supabase.js'

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const CRON_JOBS = [
  { id: 'daily_points', name: 'Daily Points Rollup', schedule: '00:00 daily', fn: 'daily-points-rollup' },
  { id: 'streak_calc', name: 'Streak Calculator', schedule: '00:05 daily', fn: 'streak-calculator' },
  { id: 'reward_cap', name: 'Reward Cap Checker', schedule: '00:10 daily', fn: 'reward-cap-checker' },
  { id: 'milestone_check', name: 'Milestone Checker', schedule: '00:15 daily', fn: 'milestone-checker' },
  { id: 'churn_detect', name: 'Churn Detector', schedule: 'Mon 06:00', fn: 'churn-detector' },
  { id: 'weekly_email', name: 'Weekly Summary Email', schedule: 'Mon 06:30', fn: 'weekly-summary-email' },
  { id: 'monthly_report', name: 'Monthly Report', schedule: '1st 07:00', fn: 'monthly-report' },
  { id: 'fraud_refresh', name: 'Fraud Score Refresh', schedule: 'Every 4 hours', fn: 'fraud-score-refresh' },
  { id: 'push_scheduler', name: 'Push Notification Scheduler', schedule: '22:00 daily', fn: 'push-scheduler' }
]

export default function OperationsTab({ theme, addToast, logAdminAction }) {
  const C = theme
  const [health, setHealth] = useState({ dbStatus: 'checking', users: 0, unread: 0, fraudFlags: 0, responseTime: 0 })
  const [pushStats, setPushStats] = useState({ total: 0, active: 0, expired: 0, byPlatform: [] })
  const [cronStatus, setCronStatus] = useState({})
  const [triggeringJobs, setTriggeringJobs] = useState(new Set())
  const [emailTest, setEmailTest] = useState({ recipient: '', subject: '', body: '' })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [auditSearch, setAuditSearch] = useState('')
  const [auditLogs, setAuditLogs] = useState([])
  const [actionFilter, setActionFilter] = useState('all')

  const fetchHealth = useCallback(async () => {
    const start = Date.now()
    try {
      const [countRes, unreadRes, fraudRes, pushRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_read', false).eq('is_admin_reply', false),
        supabase.from('fraud_risk_scores').select('id', { count: 'exact', head: true }).gte('score', 40),
        supabase.from('push_subscriptions').select('id, enabled, platform')
      ])
      const responseTime = Date.now() - start
      const pushData = pushRes.data || []
      const byPlatform = ['ios', 'android', 'web'].map(p => ({
        platform: p.charAt(0).toUpperCase() + p.slice(1),
        count: pushData.filter(s => s.platform === p).length
      }))
      setHealth({
        dbStatus: 'healthy',
        users: countRes.count || 0,
        unread: unreadRes.count || 0,
        fraudFlags: fraudRes.count || 0,
        responseTime
      })
      setPushStats({
        total: pushData.length,
        active: pushData.filter(s => s.enabled).length,
        expired: pushData.filter(s => !s.enabled).length,
        byPlatform
      })
    } catch {
      setHealth(prev => ({ ...prev, dbStatus: 'error', responseTime: Date.now() - start }))
    }
  }, [])

  const fetchAuditLogs = useCallback(async () => {
    try {
      let query = supabase.from('admin_sessions').select('*').order('created_at', { ascending: false }).limit(50)
      const { data } = await query
      setAuditLogs(data || [])
    } catch { setAuditLogs([]) }
  }, [])

  useEffect(() => { fetchHealth(); fetchAuditLogs() }, [fetchHealth, fetchAuditLogs])

  const triggerCron = async (job) => {
    setTriggeringJobs(prev => new Set([...prev, job.id]))
    try {
      await supabase.functions.invoke(job.fn, {})
      setCronStatus(prev => ({ ...prev, [job.id]: { lastRun: new Date().toISOString(), status: 'success' } }))
      addToast(`${job.name} triggered successfully`, 'success')
      logAdminAction('cron_trigger', { jobName: job.name })
    } catch (err) {
      setCronStatus(prev => ({ ...prev, [job.id]: { lastRun: new Date().toISOString(), status: 'error', error: err.message } }))
      addToast(`${job.name} failed: ${err.message}`, 'error')
    } finally {
      setTriggeringJobs(prev => { const s = new Set(prev); s.delete(job.id); return s })
    }
  }

  const sendTestEmail = async () => {
    if (!emailTest.recipient || !emailTest.subject) { addToast('Fill in recipient and subject', 'warning'); return }
    setSendingEmail(true)
    try {
      await supabase.functions.invoke('send-admin-reply', {
        body: { to: emailTest.recipient, subject: emailTest.subject, body: emailTest.body }
      })
      addToast('Test email sent', 'success')
      logAdminAction('test_email_sent', { recipient: emailTest.recipient })
    } catch (err) {
      addToast(`Email failed: ${err.message}`, 'error')
    } finally {
      setSendingEmail(false)
    }
  }

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const inputStyle = { padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }

  const healthCards = [
    { label: 'DB Status', value: health.dbStatus === 'healthy' ? 'Healthy' : health.dbStatus === 'error' ? 'Error' : 'Checking...', color: health.dbStatus === 'healthy' ? '#10B981' : health.dbStatus === 'error' ? '#EF4444' : '#F59E0B', icon: '🗄️' },
    { label: 'Total Users', value: health.users.toLocaleString(), color: C.text, icon: '👤' },
    { label: 'Unread Messages', value: health.unread, color: health.unread > 0 ? '#F59E0B' : '#10B981', icon: '💬' },
    { label: 'Active Fraud Flags', value: health.fraudFlags, color: health.fraudFlags > 0 ? '#EF4444' : '#10B981', icon: '⚠️' },
    { label: 'DB Response Time', value: `${health.responseTime}ms`, color: health.responseTime < 200 ? '#10B981' : health.responseTime < 500 ? '#F59E0B' : '#EF4444', icon: '⚡' }
  ]

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Operations</h2>

      {/* System Health */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>System Health</h3>
          <button onClick={fetchHealth} style={{ padding: '6px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: C.text }}>Refresh</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {healthCards.map(card => (
            <div key={card.label} style={{ flex: 1, minWidth: 110, padding: '14px 16px', background: C.bg, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{card.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cron Jobs */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Cron Jobs</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {['Job Name', 'Schedule', 'Last Run', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRON_JOBS.map(job => {
                const status = cronStatus[job.id]
                const isRunning = triggeringJobs.has(job.id)
                return (
                  <tr key={job.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: C.text }}>{job.name}</td>
                    <td style={{ padding: '12px', color: C.textMuted, fontFamily: 'monospace', fontSize: 12 }}>{job.schedule}</td>
                    <td style={{ padding: '12px', color: C.textMuted }}>{status?.lastRun ? formatDateTime(status.lastRun) : 'Never'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: status?.status === 'success' ? '#D1FAE5' : status?.status === 'error' ? '#FEE2E2' : '#F3F4F6', color: status?.status === 'success' ? '#065F46' : status?.status === 'error' ? '#EF4444' : '#6B7280' }}>
                        {isRunning ? 'Running...' : status?.status || 'Idle'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => triggerCron(job)}
                        disabled={isRunning}
                        style={{ padding: '5px 12px', background: isRunning ? C.bg : '#4A7A68', color: isRunning ? C.textMuted : '#fff', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                      >
                        {isRunning ? '...' : 'Trigger Now'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Email Test Tool */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Email Test Tool</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>Recipient</label>
              <input value={emailTest.recipient} onChange={e => setEmailTest(prev => ({ ...prev, recipient: e.target.value }))} placeholder="test@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>Subject</label>
              <input value={emailTest.subject} onChange={e => setEmailTest(prev => ({ ...prev, subject: e.target.value }))} placeholder="Test Email Subject" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>Body</label>
              <textarea value={emailTest.body} onChange={e => setEmailTest(prev => ({ ...prev, body: e.target.value }))} placeholder="Email body content..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <button onClick={sendTestEmail} disabled={sendingEmail} style={{ padding: '10px', background: sendingEmail ? '#9CA3AF' : '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: sendingEmail ? 'not-allowed' : 'pointer' }}>
              {sendingEmail ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* Push Notification Stats */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Push Subscriptions</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total', value: pushStats.total, color: C.text },
              { label: 'Active', value: pushStats.active, color: '#10B981' },
              { label: 'Expired', value: pushStats.expired, color: '#EF4444' }
            ].map(s => (
              <div key={s.label} style={{ flex: 1, padding: '12px', background: C.bg, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {pushStats.byPlatform.some(p => p.count > 0) ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={pushStats.byPlatform}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: C.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: C.textMuted }} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
                <Bar dataKey="count" fill="#4A7A68" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No push subscription data</div>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Audit Log</h3>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search audit log..." style={{ ...inputStyle, maxWidth: 280 }} />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', cursor: 'pointer' }}>
            <option value="all">All Actions</option>
            <option value="login">Login</option>
            <option value="tier_change">Tier Change</option>
            <option value="broadcast">Broadcast</option>
            <option value="reward_approval">Reward Approval</option>
            <option value="fraud_action">Fraud Action</option>
          </select>
        </div>
        {auditLogs.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No audit logs found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {['Timestamp', 'Action', 'Admin', 'Details'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditLogs
                .filter(log => !auditSearch || JSON.stringify(log).toLowerCase().includes(auditSearch.toLowerCase()))
                .filter(log => actionFilter === 'all' || log.action_type === actionFilter)
                .slice(0, 20)
                .map(log => (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 12px', color: C.textMuted, whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#3B82F6' }}>
                        {log.action_type || 'session'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: C.text }}>{log.admin_email || 'Admin'}</td>
                    <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12 }}>
                      {log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
