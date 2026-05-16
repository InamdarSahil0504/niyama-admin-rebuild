import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { UserDetailView } from '../shared/UserDetailView.jsx'
import { FRAUD_THRESHOLDS } from '../../config.js'

function FraudScoreCircle({ score }) {
  const r = 22, circ = 2 * Math.PI * r
  const pct = Math.min(score || 0, 100) / 100
  const color = score >= 70 ? '#EF4444' : score >= 40 ? '#F97316' : score >= 20 ? '#EAB308' : '#6B7280'
  return (
    <svg width={56} height={56}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="#E5E7EB" strokeWidth={5} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 28 28)" />
      <text x={28} y={33} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>{score || 0}</text>
    </svg>
  )
}

const SIGNALS = [
  { key: 'rapid_completions', label: 'Rapid Completions' },
  { key: 'perfect_rate', label: 'Perfect Rate' },
  { key: 'multi_device', label: 'Multi-Device' },
  { key: 'same_day_redemption', label: 'Same-Day Redemption' },
  { key: 'identical_times', label: 'Identical Times' }
]

function getRiskLabel(score) {
  if (score >= 70) return 'Critical'
  if (score >= 40) return 'High Risk'
  if (score >= 20) return 'Suspicious'
  if (score > 0) return 'Watch'
  return 'Clean'
}

function getRiskColor(score) {
  if (score >= 70) return '#EF4444'
  if (score >= 40) return '#F97316'
  if (score >= 20) return '#EAB308'
  if (score > 0) return '#6B7280'
  return '#10B981'
}

export default function FraudTab({ theme, addToast, logAdminAction, onFraudCountChange }) {
  const C = theme
  const [fraudUsers, setFraudUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterLevel, setFilterLevel] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showExplanation, setShowExplanation] = useState(false)

  const fetchFraud = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('fraud_risk_scores')
        .select('*, profiles(id, full_name, email, tier, monthly_points, successful_days, last_active_date, subscription_status, pause_active, deleted, is_minor)')
        .gt('score', 0)
        .order('score', { ascending: false })
      // Exclude minor users — they cannot redeem rewards so fraud risk is irrelevant
      const items = (data || []).filter(d => !d.profiles?.is_minor).map(d => ({
        ...d,
        profile: d.profiles || {}
      }))
      setFraudUsers(items)
      const criticalCount = items.filter(i => i.score >= FRAUD_THRESHOLDS.critical).length
      onFraudCountChange && onFraudCountChange(criticalCount)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [onFraudCountChange])

  useEffect(() => { fetchFraud() }, [fetchFraud])

  const counts = {
    all: fraudUsers.length,
    critical: fraudUsers.filter(u => u.score >= 70).length,
    high: fraudUsers.filter(u => u.score >= 40 && u.score < 70).length,
    suspicious: fraudUsers.filter(u => u.score >= 20 && u.score < 40).length,
    watch: fraudUsers.filter(u => u.score > 0 && u.score < 20).length
  }

  const filtered = filterLevel === 'all' ? fraudUsers
    : filterLevel === 'critical' ? fraudUsers.filter(u => u.score >= 70)
    : filterLevel === 'high' ? fraudUsers.filter(u => u.score >= 40 && u.score < 70)
    : filterLevel === 'suspicious' ? fraudUsers.filter(u => u.score >= 20 && u.score < 40)
    : fraudUsers.filter(u => u.score > 0 && u.score < 20)

  const summaryCards = [
    { key: 'critical', label: 'Critical', count: counts.critical, color: '#EF4444', bg: '#FEE2E2' },
    { key: 'high', label: 'High Risk', count: counts.high, color: '#F97316', bg: '#FFF7ED' },
    { key: 'suspicious', label: 'Suspicious', count: counts.suspicious, color: '#EAB308', bg: '#FEFCE8' },
    { key: 'watch', label: 'Watch', count: counts.watch, color: '#6B7280', bg: C.bg }
  ]

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Fraud Monitor</h2>
        <button onClick={() => setShowExplanation(!showExplanation)} style={{ padding: '7px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }}>
          {showExplanation ? '▲' : '▼'} Scoring Logic
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {summaryCards.map(s => (
          <div
            key={s.key}
            onClick={() => setFilterLevel(filterLevel === s.key ? 'all' : s.key)}
            style={{ flex: 1, minWidth: 120, padding: '16px 18px', background: filterLevel === s.key ? s.color : C.card, color: filterLevel === s.key ? '#fff' : C.text, borderRadius: 12, border: `2px solid ${filterLevel === s.key ? s.color : C.border}`, cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>{s.count}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
        <div
          onClick={() => setFilterLevel('all')}
          style={{ flex: 1, minWidth: 120, padding: '16px 18px', background: filterLevel === 'all' ? '#4A7A68' : C.card, color: filterLevel === 'all' ? '#fff' : C.text, borderRadius: 12, border: `2px solid ${filterLevel === 'all' ? '#4A7A68' : C.border}`, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.all}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Total Flagged</div>
        </div>
      </div>

      {/* Explanation panel */}
      {showExplanation && (
        <div style={{ background: C.card, borderRadius: 12, padding: 20, marginBottom: 20, border: `1px solid ${C.border}` }}>
          <h4 style={{ margin: '0 0 12px', color: C.text, fontSize: 15, fontWeight: 700 }}>Fraud Scoring Logic</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { signal: 'Rapid Completions', desc: 'Multiple habits logged within seconds of each other', points: '+30' },
              { signal: 'Perfect Rate', desc: '100% success rate for 30+ consecutive days', points: '+25' },
              { signal: 'Multi-Device', desc: 'Logins from 3+ distinct device fingerprints in 24h', points: '+25' },
              { signal: 'Same-Day Redemption', desc: 'Reward requested on same day as milestone reached', points: '+15' },
              { signal: 'Identical Times', desc: 'Habit logs at identical timestamps across multiple days', points: '+20' }
            ].map(item => (
              <div key={item.signal} style={{ padding: '10px 14px', background: C.bg, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.signal}</span>
                  <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700 }}>{item.points}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
            <strong>Critical (70+):</strong> Immediate review required. Consider account pause pending investigation.
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'critical', 'high', 'suspicious', 'watch'].map(lvl => (
          <button key={lvl} onClick={() => setFilterLevel(lvl)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filterLevel === lvl ? '#4A7A68' : C.card,
            color: filterLevel === lvl ? '#fff' : C.text,
            border: `1px solid ${filterLevel === lvl ? '#4A7A68' : C.border}`
          }}>
            {lvl === 'all' ? 'All' : lvl.charAt(0).toUpperCase() + lvl.slice(1)} ({counts[lvl] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: C.textMuted, padding: 20 }}>Loading fraud data...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.textMuted, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No flagged users in this category</div>
          <div style={{ fontSize: 13 }}>All clear in this risk tier</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(fu => {
            const p = fu.profile
            const riskColor = getRiskColor(fu.score)
            const activeSignals = SIGNALS.filter(s => fu[s.key])
            return (
              <div key={fu.id} style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, borderTop: `3px solid ${riskColor}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <FraudScoreCircle score={fu.score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: riskColor + '20', color: riskColor, flexShrink: 0 }}>
                    {getRiskLabel(fu.score)}
                  </span>
                </div>
                {activeSignals.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                    {activeSignals.map(s => (
                      <span key={s.key} style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#FEE2E2', color: '#EF4444' }}>{s.label}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <div style={{ padding: 10, background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Total Points</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{(p.monthly_points || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ padding: 10, background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Successful Days</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.successful_days || 0}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(p)}
                  style={{ width: '100%', padding: '9px', background: '#4A7A6810', color: '#4A7A68', border: '1px solid #4A7A6830', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  View Full Profile →
                </button>
              </div>
            )
          })}
        </div>
      )}

      <UserDetailView
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        theme={C}
        addToast={addToast}
        logAdminAction={logAdminAction}
      />
    </div>
  )
}
