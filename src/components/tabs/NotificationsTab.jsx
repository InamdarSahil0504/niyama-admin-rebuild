import React, { useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../supabase.js'

const TEMPLATES = [
  {
    id: 'streak_protection',
    title: "Don't break your streak! 🔥",
    body: "You haven't logged today yet. Keep your streak going!",
    label: 'Streak Protection',
    description: 'Fires at 22:00 for users without today\'s submission',
    icon: '🔥'
  },
  {
    id: 'morning_wake',
    title: 'Good morning! Time to log your wake habit ☀️',
    body: 'Start your day right. Tap to log your morning habits.',
    label: 'Morning Wake',
    description: 'Fires at user\'s wake time',
    icon: '☀️'
  },
  {
    id: 'midday_nudge',
    title: "Halfway through the day — how are your habits going? 💪",
    body: "Check in and log your afternoon habits. You\'re doing great!",
    label: 'Midday Nudge',
    description: 'Fires at 12:00',
    icon: '💪'
  },
  {
    id: 'gift_card',
    title: 'Your reward is ready! 🎁',
    body: 'Your gift card has been delivered. Tap to claim it.',
    label: 'Gift Card Delivered',
    description: 'Fires after payout approved',
    icon: '🎁'
  }
]

const SEGMENTS = [
  { value: 'all', label: 'All Users' },
  { value: 'free', label: 'Free Tier' },
  { value: 'basic', label: 'Basic Tier' },
  { value: 'plus', label: 'Plus Tier' },
  { value: 'premium', label: 'Premium Tier' },
  { value: 'streak_range', label: 'By Streak Range' },
  { value: 'inactive', label: 'By Inactive Days' }
]

const MOCK_HISTORY = [
  { id: 1, date: '2026-05-09', title: "Don't break your streak! 🔥", segment: 'All Users', recipients: 142, deliveryRate: '94%', openRate: '67%' },
  { id: 2, date: '2026-05-08', title: 'Good morning! ☀️', segment: 'Plus + Premium', recipients: 38, deliveryRate: '97%', openRate: '71%' },
  { id: 3, date: '2026-05-07', title: "Halfway through the day 💪", segment: 'All Users', recipients: 142, deliveryRate: '93%', openRate: '52%' },
  { id: 4, date: '2026-05-05', title: 'Your reward is ready! 🎁', segment: 'Plus + Premium', recipients: 7, deliveryRate: '100%', openRate: '100%' },
]

const STATS_DATA = [
  { type: 'Streak', sent: 580, opened: 388 },
  { type: 'Morning', sent: 290, opened: 210 },
  { type: 'Midday', sent: 290, opened: 151 },
  { type: 'Reward', sent: 23, opened: 23 }
]

export default function NotificationsTab({ theme, addToast, logAdminAction }) {
  const C = theme
  const [compose, setCompose] = useState({ segment: 'all', title: '', body: '', minStreak: '', maxStreak: '', inactiveDays: '' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [schedule, setSchedule] = useState({ time: '', segment: 'all', templateId: '', days: [] })
  const [history] = useState(MOCK_HISTORY)

  const prefillTemplate = (template) => {
    setCompose(prev => ({ ...prev, title: template.title, body: template.body }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sendNotification = useCallback(async () => {
    if (!compose.title.trim() || !compose.body.trim()) { addToast('Fill in title and body', 'warning'); return }
    setSending(true)
    try {
      // Get target users
      let query = supabase.from('profiles').select('id')
      if (compose.segment !== 'all' && !['streak_range', 'inactive'].includes(compose.segment)) {
        query = query.eq('tier', compose.segment)
      }
      const { data: users } = await query
      const userIds = (users || []).map(u => u.id)

      // Insert notifications
      const inserts = userIds.map(uid => ({
        user_id: uid,
        body: `${compose.title}\n${compose.body}`,
        is_admin_reply: true,
        is_read: false,
        created_at: new Date().toISOString(),
        notification_type: 'push'
      }))

      if (inserts.length > 0) {
        await supabase.from('contact_messages').insert(inserts)
      }

      addToast(`Notification sent to ${inserts.length} users`, 'success')
      logAdminAction('notification_sent', { segment: compose.segment, count: inserts.length, title: compose.title })
      setCompose(prev => ({ ...prev, title: '', body: '' }))
      setShowConfirm(false)
    } catch (err) {
      addToast('Failed to send notification', 'error')
    } finally {
      setSending(false)
    }
  }, [compose, addToast, logAdminAction])

  const toggleScheduleDay = (day) => {
    setSchedule(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
    }))
  }

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const inputStyle = { padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Notifications</h2>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Sent (30d)', value: MOCK_HISTORY.reduce((a, h) => a + h.recipients, 0) },
          { label: 'Avg Delivery Rate', value: '95%' },
          { label: 'Avg Open Rate', value: '72%' }
        ].map(stat => (
          <div key={stat.label} style={{ flex: 1, minWidth: 120, padding: '16px 18px', background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#4A7A68' }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
        <div style={{ flex: 2, minWidth: 280, background: C.card, borderRadius: 12, padding: '14px 18px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Open Rate by Type</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={STATS_DATA} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: C.textMuted }} domain={[0, 700]} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: C.textMuted }} width={50} />
              <Tooltip contentStyle={{ background: C.card, fontSize: 12 }} />
              <Bar dataKey="sent" fill={C.border} name="Sent" radius={[0, 4, 4, 0]} />
              <Bar dataKey="opened" fill="#4A7A68" name="Opened" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Compose */}
        <div style={sectionStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Compose Notification</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target Segment</label>
              <select value={compose.segment} onChange={e => setCompose(prev => ({ ...prev, segment: e.target.value }))} style={selectStyle}>
                {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {compose.segment === 'streak_range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Min Streak Days</label>
                  <input type="number" value={compose.minStreak} onChange={e => setCompose(prev => ({ ...prev, minStreak: e.target.value }))} style={inputStyle} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Max Streak Days</label>
                  <input type="number" value={compose.maxStreak} onChange={e => setCompose(prev => ({ ...prev, maxStreak: e.target.value }))} style={inputStyle} placeholder="30" />
                </div>
              </div>
            )}
            {compose.segment === 'inactive' && (
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Last active &gt; N days ago</label>
                <input type="number" value={compose.inactiveDays} onChange={e => setCompose(prev => ({ ...prev, inactiveDays: e.target.value }))} style={inputStyle} placeholder="7" />
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Title <span style={{ color: compose.title.length > 50 ? '#EF4444' : C.textMuted }}>{compose.title.length}/50</span></label>
              <input value={compose.title} onChange={e => setCompose(prev => ({ ...prev, title: e.target.value.slice(0, 50) }))} placeholder="Notification title..." style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Body <span style={{ color: compose.body.length > 150 ? '#EF4444' : C.textMuted }}>{compose.body.length}/150</span></label>
              <textarea value={compose.body} onChange={e => setCompose(prev => ({ ...prev, body: e.target.value.slice(0, 150) }))} placeholder="Notification body..." rows={3} style={{ ...inputStyle, resize: 'none' }} />
            </div>

            {/* Preview */}
            {(compose.title || compose.body) && (
              <div style={{ padding: 14, background: '#1A1A2E', borderRadius: 14, marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6 }}>📱 Preview</div>
                <div style={{ background: '#FFFFFF', borderRadius: 10, padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 3 }}>Niyama · now</div>
                  {compose.title && <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{compose.title}</div>}
                  {compose.body && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{compose.body}</div>}
                </div>
              </div>
            )}

            {showConfirm ? (
              <div style={{ padding: 14, background: '#FEF3C7', borderRadius: 10, border: '1px solid #FCD34D' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>Confirm Send</div>
                <p style={{ fontSize: 13, color: '#92400E', margin: '0 0 12px' }}>Send "{compose.title}" to {SEGMENTS.find(s => s.value === compose.segment)?.label}?</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={sendNotification} disabled={sending} style={{ flex: 1, padding: '9px', background: sending ? '#9CA3AF' : '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>
                    {sending ? 'Sending...' : 'Confirm Send'}
                  </button>
                  <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '9px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!compose.title.trim() || !compose.body.trim()}
                style={{ padding: '11px', background: compose.title.trim() && compose.body.trim() ? '#4A7A68' : '#9CA3AF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: compose.title.trim() && compose.body.trim() ? 'pointer' : 'not-allowed' }}
              >
                Send Notification
              </button>
            )}
          </div>
        </div>

        {/* Templates */}
        <div>
          <div style={sectionStyle}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Quick Templates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TEMPLATES.map(t => (
                <div key={t.id} style={{ padding: '14px 16px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => prefillTemplate(t)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#4A7A68'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t.icon} {t.label}</div>
                    <span style={{ fontSize: 11, color: '#4A7A68', fontWeight: 600 }}>Use →</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{t.description}</div>
                  <div style={{ fontSize: 12, color: C.text, marginTop: 6, fontStyle: 'italic' }}>{t.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule Recurring */}
          <div style={sectionStyle}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Schedule Recurring</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Time</label>
                  <input type="time" value={schedule.time} onChange={e => setSchedule(prev => ({ ...prev, time: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Segment</label>
                  <select value={schedule.segment} onChange={e => setSchedule(prev => ({ ...prev, segment: e.target.value }))} style={selectStyle}>
                    {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Template</label>
                <select value={schedule.templateId} onChange={e => setSchedule(prev => ({ ...prev, templateId: e.target.value }))} style={selectStyle}>
                  <option value="">Select template...</option>
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 6 }}>Days of Week</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map(day => (
                    <button key={day} onClick={() => toggleScheduleDay(day)} style={{ padding: '5px 10px', background: schedule.days.includes(day) ? '#4A7A68' : C.bg, color: schedule.days.includes(day) ? '#fff' : C.text, border: `1px solid ${schedule.days.includes(day) ? '#4A7A68' : C.border}`, borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => addToast('Recurring notification scheduled (demo)', 'success')} style={{ padding: '10px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Notification History</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Date', 'Title', 'Segment', 'Recipients', 'Delivery', 'Open Rate'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '12px', color: C.textMuted }}>{h.date}</td>
                <td style={{ padding: '12px', color: C.text, fontWeight: 500 }}>{h.title}</td>
                <td style={{ padding: '12px', color: C.textMuted }}>{h.segment}</td>
                <td style={{ padding: '12px', color: C.text }}>{h.recipients}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#10B981', fontWeight: 600 }}>{h.deliveryRate}</span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#C9973A', fontWeight: 600 }}>{h.openRate}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
