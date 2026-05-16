import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { TierBadge } from './TierBadge.jsx'
import { StatusDot } from './StatusDot.jsx'
import { TIERS, getHabitLabel } from '../../config.js'

function formatDate(d) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}
function formatMoney(n) {
  if (n == null) return '$0.00'
  return '$' + Number(n).toFixed(2)
}

function FraudScoreCircle({ score }) {
  const r = 28, circ = 2 * Math.PI * r
  const pct = Math.min(score || 0, 100) / 100
  const color = score >= 70 ? '#EF4444' : score >= 40 ? '#F97316' : score >= 20 ? '#EAB308' : '#6B7280'
  return (
    <svg width={72} height={72}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="#E5E7EB" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={36} y={42} textAnchor="middle" fontSize={15} fontWeight={700} fill={color}>{score || 0}</text>
    </svg>
  )
}

function HabitHeatmap({ userId, C }) {
  const [days, setDays] = useState([])
  useEffect(() => {
    if (!userId) return
    const fetchData = async () => {
      const end = new Date(), start = new Date()
      start.setDate(start.getDate() - 34)
      try {
        const { data } = await supabase.from('daily_summaries').select('date, total_points').eq('user_id', userId)
          .gte('date', start.toISOString().split('T')[0]).lte('date', end.toISOString().split('T')[0])
        const map = {}
        if (data) data.forEach(d => { map[d.date] = d.total_points || 0 })
        const arr = []
        for (let i = 34; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i)
          const key = d.toISOString().split('T')[0]
          arr.push({ date: key, points: map[key] || 0 })
        }
        setDays(arr)
      } catch { setDays([]) }
    }
    fetchData()
  }, [userId])

  const maxPoints = Math.max(...days.map(d => d.points), 1)
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.text }}>30-Day Activity</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {days.map(d => {
          const intensity = d.points / maxPoints
          const green = Math.round(intensity * 180) + 75
          const bg = d.points > 0 ? `rgb(74, ${green}, 104)` : C.border
          return <div key={d.date} title={`${d.date}: ${d.points} pts`} style={{ width: '100%', paddingTop: '100%', borderRadius: 3, background: bg }} />
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <div key={v} style={{ width: 12, height: 12, borderRadius: 2, background: v === 0 ? C.border : `rgb(74, ${Math.round(v * 180) + 75}, 104)` }} />
        ))}
        <span style={{ fontSize: 11, color: C.textMuted }}>More</span>
      </div>
    </div>
  )
}

const SIGNALS = [
  { key: 'rapid_completions', label: 'Rapid Completions' },
  { key: 'perfect_rate', label: 'Perfect Rate' },
  { key: 'multi_device', label: 'Multi-Device' },
  { key: 'same_day_redemption', label: 'Same-Day Redemption' },
  { key: 'identical_times', label: 'Identical Times' }
]

export function UserDetailView({ user, isOpen, onClose, onUserUpdated, theme, addToast, logAdminAction }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [userDetails, setUserDetails] = useState(null)
  const [rewards, setRewards] = useState([])
  const [messages, setMessages] = useState([])
  const [notes, setNotes] = useState([])
  const [fraudData, setFraudData] = useState(null)
  const [habits, setHabits] = useState([])
  const [customHabits, setCustomHabits] = useState([])
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [loading, setLoading] = useState(false)

  // Editable profile state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ full_name: '', date_of_birth: '', phone: '', region: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Action modal state
  const [actionModal, setActionModal] = useState(null) // { type: 'bonus'|'deduct'|'freeze'|'reward'|'message' }
  const [actionAmount, setActionAmount] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionDays, setActionDays] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const C = theme

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [profileRes, rewardsRes, messagesRes, notesRes, fraudRes, habitsRes, customHabitsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('rewards').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('contact_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('admin_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('fraud_risk_scores').select('*').eq('user_id', user.id).single(),
        supabase.from('habit_logs').select('*').eq('user_id', user.id)
          .gte('logged_at', new Date(Date.now() - 86400000).toISOString()).order('logged_at', { ascending: false }),
        supabase.from('custom_habits').select('id, name, emoji, created_at, is_active').eq('user_id', user.id).order('created_at', { ascending: false })
      ])
      const profile = profileRes.data || user
      setUserDetails(profile)
      setEditForm({
        full_name: profile.full_name || '',
        date_of_birth: profile.date_of_birth || '',
        phone: profile.phone || '',
        region: profile.region || ''
      })
      setRewards(rewardsRes.data || [])
      setMessages(messagesRes.data || [])
      setNotes(notesRes.data || [])
      setFraudData(fraudRes.data || null)
      setHabits(habitsRes.data || [])
      setCustomHabits(customHabitsRes.data || [])
    } catch {
      setUserDetails(user)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (isOpen && user) { fetchAll(); setActiveTab('overview'); setDeleteStep(0); setActionModal(null); setIsEditing(false) }
  }, [isOpen, user, fetchAll])

  const sendReply = async () => {
    if (!replyText.trim()) return
    try {
      await supabase.from('contact_messages').insert({ user_id: user.id, body: replyText, is_admin_reply: true, created_at: new Date().toISOString() })
      setReplyText('')
      setMessages(prev => [{ body: replyText, is_admin_reply: true, created_at: new Date().toISOString(), id: Date.now() }, ...prev])
      addToast('Reply sent', 'success')
      logAdminAction('message_sent', { userId: user.id })
    } catch { addToast('Failed to send reply', 'error') }
  }

  const addNote = async () => {
    if (!noteText.trim()) return
    try {
      const { data } = await supabase.from('admin_notes').insert({ user_id: user.id, note: noteText, created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL }).select().single()
      setNoteText('')
      setNotes(prev => [data || { note: noteText, created_at: new Date().toISOString(), id: Date.now() }, ...prev])
      addToast('Note added', 'success')
      logAdminAction('note_added', { userId: user.id })
    } catch { addToast('Failed to add note', 'error') }
  }

  const changeTier = async (newTier) => {
    try {
      await supabase.from('profiles').update({ tier: newTier }).eq('id', user.id)
      setUserDetails(prev => ({ ...prev, tier: newTier }))
      addToast(`Tier changed to ${TIERS[newTier]?.name}`, 'success')
      logAdminAction('tier_change', { userId: user.id, email: user.email, newTier })
      onUserUpdated?.()
    } catch { addToast('Failed to change tier', 'error') }
  }

  const pauseAccount = async () => {
    try {
      await supabase.from('profiles').update({ status: 'inactive', paused_until: new Date(Date.now() + 30 * 86400000).toISOString() }).eq('id', user.id)
      setUserDetails(prev => ({ ...prev, status: 'inactive' }))
      addToast('Account paused for 30 days', 'warning')
      logAdminAction('account_paused', { userId: user.id, email: user.email })
      onUserUpdated?.()
    } catch { addToast('Failed to pause account', 'error') }
  }

  const deleteAccount = async () => {
    if (deleteTyped !== 'DELETE') return
    try {
      await supabase.from('profiles').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', user.id)
      addToast('Account deleted', 'error')
      logAdminAction('user_deleted', { userId: user.id, email: user.email })
      onUserUpdated?.()
      onClose()
    } catch { addToast('Failed to delete account', 'error') }
  }

  const addBonusPoints = async () => {
    if (!actionAmount || isNaN(Number(actionAmount))) return
    setActionLoading(true)
    try {
      const pts = parseInt(actionAmount)
      const newBalance = (userDetails?.points_balance || 0) + pts
      await supabase.from('profiles').update({ points_balance: newBalance }).eq('id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Admin bonus: +${pts} points. Reason: ${actionReason}`, type: 'bonus_points', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      setUserDetails(prev => ({ ...prev, points_balance: newBalance }))
      addToast(`+${pts} bonus points added`, 'success')
      logAdminAction('bonus_points', { userId: user.id, email: user.email, points: pts, reason: actionReason })
      setActionModal(null); setActionAmount(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to add points', 'error') }
    setActionLoading(false)
  }

  const deductPoints = async () => {
    if (!actionAmount || isNaN(Number(actionAmount))) return
    setActionLoading(true)
    try {
      const pts = parseInt(actionAmount)
      const newBalance = Math.max(0, (userDetails?.points_balance || 0) - pts)
      await supabase.from('profiles').update({ points_balance: newBalance }).eq('id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Admin deduction: -${pts} points. Reason: ${actionReason}`, type: 'deduct_points', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      setUserDetails(prev => ({ ...prev, points_balance: newBalance }))
      addToast(`-${pts} points deducted`, 'warning')
      logAdminAction('deduct_points', { userId: user.id, email: user.email, points: pts, reason: actionReason })
      setActionModal(null); setActionAmount(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to deduct points', 'error') }
    setActionLoading(false)
  }

  const freezeStreak = async () => {
    if (!actionDays || isNaN(Number(actionDays))) return
    setActionLoading(true)
    try {
      const frozenUntil = new Date(Date.now() + parseInt(actionDays) * 86400000).toISOString()
      await supabase.from('streaks').update({ frozen_until: frozenUntil }).eq('user_id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Streak frozen for ${actionDays} days. Reason: ${actionReason}`, type: 'streak_freeze', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast(`Streak frozen for ${actionDays} days`, 'success')
      logAdminAction('streak_freeze', { userId: user.id, email: user.email, days: actionDays, reason: actionReason })
      setActionModal(null); setActionDays(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to freeze streak', 'error') }
    setActionLoading(false)
  }

  const sendDirectMessage = async () => {
    if (!actionMsg.trim()) return
    setActionLoading(true)
    try {
      await supabase.from('contact_messages').insert({ user_id: user.id, body: actionMsg, is_admin_reply: true, created_at: new Date().toISOString() })
      setMessages(prev => [{ body: actionMsg, is_admin_reply: true, created_at: new Date().toISOString(), id: Date.now() }, ...prev])
      addToast('Message sent', 'success')
      logAdminAction('direct_message', { userId: user.id, email: user.email })
      setActionModal(null); setActionMsg('')
    } catch { addToast('Failed to send message', 'error') }
    setActionLoading(false)
  }

  const issueManualReward = async () => {
    if (!actionAmount || isNaN(Number(actionAmount))) return
    setActionLoading(true)
    try {
      const amount = parseFloat(actionAmount)
      await supabase.from('rewards').insert({ user_id: user.id, amount, status: 'pending', type: 'manual', note: actionReason, created_at: new Date().toISOString() })
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Manual reward issued: ${formatMoney(amount)}. Reason: ${actionReason}`, type: 'manual_reward', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast(`Manual reward ${formatMoney(amount)} issued`, 'success')
      logAdminAction('manual_reward', { userId: user.id, email: user.email, amount, reason: actionReason })
      setActionModal(null); setActionAmount(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to issue reward', 'error') }
    setActionLoading(false)
  }

  const flagForFraud = async () => {
    try {
      await supabase.from('fraud_risk_scores').upsert({ user_id: user.id, score: 70, admin_flagged: true, flagged_at: new Date().toISOString() })
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Manually flagged for fraud review`, type: 'fraud_flag', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast('User flagged for fraud review', 'warning')
      logAdminAction('fraud_flag', { userId: user.id, email: user.email })
      fetchAll()
      onUserUpdated?.()
    } catch { addToast('Failed to flag user', 'error') }
  }

  const clearFraudFlag = async () => {
    try {
      await supabase.from('fraud_risk_scores').update({ score: 0, admin_flagged: false, cleared_at: new Date().toISOString() }).eq('user_id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Fraud flag cleared by admin`, type: 'fraud_clear', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast('Fraud flag cleared', 'success')
      logAdminAction('fraud_clear', { userId: user.id, email: user.email })
      fetchAll()
      onUserUpdated?.()
    } catch { addToast('Failed to clear flag', 'error') }
  }

  const saveProfileEdit = async () => {
    setEditSaving(true)
    try {
      const updatePayload = {
        full_name: editForm.full_name || null,
        date_of_birth: editForm.date_of_birth || null,
        phone: editForm.phone || null,
        region: editForm.region || null
      }
      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id)
      if (error) throw error
      const changedFields = Object.keys(updatePayload).filter(k => editForm[k] !== (userDetails?.[k] || ''))
      await supabase.from('admin_notes').insert({
        user_id: user.id,
        note: `[AUDIT] Admin updated profile fields: ${Object.keys(updatePayload).join(', ')}`,
        type: 'profile_edit',
        created_at: new Date().toISOString(),
        admin: import.meta.env.VITE_ADMIN_EMAIL
      })
      addToast('Profile updated', 'success')
      logAdminAction('profile_edit', { userId: user.id, email: user.email, fields: Object.keys(updatePayload) })
      setIsEditing(false)
      fetchAll()
      onUserUpdated?.()
    } catch (err) {
      addToast('Failed to save profile', 'error')
      console.error(err)
    }
    setEditSaving(false)
  }

  if (!isOpen || !user) return null

  const u = userDetails || user
  const initials = (u.full_name || u.email || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const tabs = ['overview', 'habits', 'rewards', 'messages', 'notes', 'fraud', 'actions']
  const fraudScore = fraudData?.score || u.fraud_score || 0
  const fraudColor = fraudScore >= 70 ? '#EF4444' : fraudScore >= 40 ? '#F97316' : fraudScore >= 20 ? '#EAB308' : '#6B7280'
  const isMinor = u.is_minor || false

  const inputStyle = { width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
  const btnPrimary = { padding: '8px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const btnDanger = { padding: '8px 14px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const btnGhost = { padding: '8px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }

  const ActionModal = () => {
    if (!actionModal) return null
    const configs = {
      bonus: { title: '➕ Add Bonus Points', fields: [
        { label: 'Points to add', value: actionAmount, onChange: e => setActionAmount(e.target.value), placeholder: '250', type: 'number' },
        { label: 'Reason', value: actionReason, onChange: e => setActionReason(e.target.value), placeholder: 'Competition winner, promo, etc.' }
      ], action: addBonusPoints, actionLabel: 'Add Points' },
      deduct: { title: '➖ Deduct Points', fields: [
        { label: 'Points to deduct', value: actionAmount, onChange: e => setActionAmount(e.target.value), placeholder: '250', type: 'number' },
        { label: 'Reason', value: actionReason, onChange: e => setActionReason(e.target.value), placeholder: 'Policy violation, etc.' }
      ], action: deductPoints, actionLabel: 'Deduct Points' },
      freeze: { title: '🧊 Freeze Streak', fields: [
        { label: 'Freeze for N days', value: actionDays, onChange: e => setActionDays(e.target.value), placeholder: '7', type: 'number' },
        { label: 'Reason', value: actionReason, onChange: e => setActionReason(e.target.value), placeholder: 'Vacation, illness, etc.' }
      ], action: freezeStreak, actionLabel: 'Freeze Streak' },
      message: { title: '✉️ Send Direct Message', fields: [
        { label: 'Message', value: actionMsg, onChange: e => setActionMsg(e.target.value), placeholder: 'Hi! We noticed...', multiline: true }
      ], action: sendDirectMessage, actionLabel: 'Send Message' },
      reward: { title: '🎁 Issue Manual Reward', fields: [
        { label: 'Amount ($)', value: actionAmount, onChange: e => setActionAmount(e.target.value), placeholder: '5.00', type: 'number' },
        { label: 'Note', value: actionReason, onChange: e => setActionReason(e.target.value), placeholder: 'Competition prize, etc.' }
      ], action: issueManualReward, actionLabel: 'Issue Reward', disabled: isMinor, disabledMsg: 'Cannot issue rewards to minor users' }
    }
    const cfg = configs[actionModal]
    if (!cfg) return null
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ background: C.card, borderRadius: 14, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>{cfg.title}</div>
          {cfg.disabled ? (
            <div style={{ padding: 12, background: '#FEF3C7', borderRadius: 8, fontSize: 13, color: '#92400E', marginBottom: 16 }}>⚠️ {cfg.disabledMsg}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {cfg.fields.map((f, i) => (
                <div key={i}>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 500 }}>{f.label}</label>
                  {f.multiline
                    ? <textarea value={f.value} onChange={f.onChange} placeholder={f.placeholder} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                    : <input type={f.type || 'text'} value={f.value} onChange={f.onChange} placeholder={f.placeholder} style={inputStyle} />
                  }
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setActionModal(null); setActionAmount(''); setActionReason(''); setActionDays(''); setActionMsg('') }} style={btnGhost}>Cancel</button>
            {!cfg.disabled && (
              <button onClick={cfg.action} disabled={actionLoading} style={{ ...btnPrimary, opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Processing...' : cfg.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <ActionModal />
      <div style={{ position: 'fixed', inset: 0, zIndex: 800, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} onClick={onClose} />
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 600, background: C.card, boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflowY: 'auto' }}>

          {/* Minor user banner */}
          {isMinor && (
            <div style={{ background: '#FEF3C7', borderBottom: '2px solid #F59E0B', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>MINOR USER — Restricted Access</div>
                <div style={{ fontSize: 12, color: '#78350F' }}>Rewards, payouts, and referral data are hidden. Handle under COPPA/GDPR-K guidelines.</div>
              </div>
            </div>
          )}

          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#4A7A68', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>{u.full_name || 'Unknown'}</h3>
                  {isMinor && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, border: '1px solid #F59E0B' }}>⚠ MINOR</span>}
                  <TierBadge tier={u.tier} />
                  <StatusDot status={u.status} showLabel />
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FraudScoreCircle score={fraudScore} />
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textMuted, padding: '0 4px' }}>×</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 16, borderBottom: `1px solid ${C.border}`, marginBottom: -17 }}>
              {tabs.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  background: 'none', border: 'none', padding: '8px 12px', fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? '#4A7A68' : C.textMuted,
                  borderBottom: activeTab === tab ? '2px solid #4A7A68' : '2px solid transparent',
                  cursor: 'pointer', textTransform: 'capitalize', marginBottom: -1
                }}>{tab}</button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: 24, flex: 1 }}>
            {activeTab === 'overview' && (
              <div>
                {/* Edit button row */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} style={{ padding: '7px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text, fontWeight: 500 }}>
                      ✏️ Edit Profile
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setIsEditing(false); setEditForm({ full_name: u.full_name || '', date_of_birth: u.date_of_birth || '', phone: u.phone || '', region: u.region || '' }) }} style={{ padding: '7px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }}>Cancel</button>
                      <button onClick={saveProfileEdit} disabled={editSaving} style={{ padding: '7px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.7 : 1 }}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  /* Edit form — only the 4 editable fields */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'Full Name', field: 'full_name', type: 'text', placeholder: 'Jane Smith' },
                      { label: 'Date of Birth', field: 'date_of_birth', type: 'date', placeholder: '' },
                      { label: 'Phone Number', field: 'phone', type: 'text', placeholder: '+1 555 000 0000' },
                    ].map(({ label, field, type, placeholder }) => (
                      <div key={field}>
                        <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                        <input
                          type={type}
                          value={editForm[field]}
                          onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                          placeholder={placeholder}
                          style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
                        />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Region</label>
                      <select
                        value={editForm.region}
                        onChange={e => setEditForm(prev => ({ ...prev, region: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}
                      >
                        <option value="">— Not set</option>
                        <option value="USA">USA</option>
                        <option value="India">India</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Read-only view — all fields */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {[
                      ['Joined', formatDate(u.created_at)],
                      ['Last Active', formatDate(u.last_active_at || u.updated_at)],
                      ['Current Streak', `${u.streak_days || 0} days`],
                      ['Points Balance', (u.points_balance || 0).toLocaleString()],
                      ['Successful Days', u.successful_days_count || 0],
                      ['Gender', u.gender || 'Not set'],
                      ['Age', u.birth_year ? (new Date().getFullYear() - u.birth_year) : (u.age || 'Not set')],
                      ['HealthKit', u.healthkit_connected ? '🍎 Connected' : '— Not connected'],
                      ['Research Consent', u.research_consent == null
                        ? <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>Not set</span>
                        : u.research_consent
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#D1FAE5', color: '#065F46', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>✓ Opted in</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEE2E2', color: '#991B1B', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>✗ Opted out</span>
                      ],
                      ...(!isMinor ? [['Referrals', u.referral_count || 0]] : []),
                      ['Full Name', u.full_name || '—'],
                      ['Date of Birth', u.date_of_birth ? formatDate(u.date_of_birth) : '—'],
                      ['Phone', u.phone || '—'],
                      ['Region', u.region || '—'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ padding: 14, background: C.bg, borderRadius: 10 }}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'habits' && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>Today's Habits</div>
                  {habits.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: 13 }}>No habits logged today</div>
                  ) : habits.map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: '#10B981', fontSize: 16 }}>✓</span>
                      <span style={{ fontSize: 14, color: C.text, flex: 1 }}>{getHabitLabel(h.habit_id)}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{h.points_earned} pts</span>
                      {h.photo_url && <span style={{ fontSize: 11, background: '#EFF6FF', color: '#3B82F6', padding: '1px 6px', borderRadius: 6 }}>📷 Photo</span>}
                    </div>
                  ))}
                </div>
                <HabitHeatmap userId={u.id} C={C} />

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Custom Habits</div>
                    <span style={{ fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#3B82F6', padding: '1px 7px', borderRadius: 10 }}>
                      {customHabits.length}
                    </span>
                  </div>
                  {customHabits.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.textMuted }}>No custom habits created</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {['Habit', 'Created', 'Status'].map(h => (
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {customHabits.map(h => (
                          <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '9px 8px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ fontSize: 18, lineHeight: 1 }}>{h.emoji || '⭐'}</span>
                                <span style={{ color: C.text, fontWeight: 500 }}>{h.name}</span>
                              </span>
                            </td>
                            <td style={{ padding: '9px 8px', color: C.textMuted }}>{formatDate(h.created_at)}</td>
                            <td style={{ padding: '9px 8px' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                background: h.is_active ? '#D1FAE5' : '#F3F4F6',
                                color: h.is_active ? '#065F46' : '#6B7280'
                              }}>
                                {h.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'rewards' && (
              <div>
                {isMinor ? (
                  <div style={{ padding: '20px', background: '#FEF3C7', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#92400E' }}>Reward data hidden for minor users</div>
                    <div style={{ fontSize: 13, color: '#78350F', marginTop: 4 }}>COPPA/GDPR-K compliance</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Reward History</div>
                    {rewards.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13 }}>No rewards yet</div> : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            {['Date', 'Amount', 'Type', 'Status'].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rewards.map(r => (
                            <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: '8px', color: C.text }}>{formatDate(r.created_at)}</td>
                              <td style={{ padding: '8px', color: '#4A7A68', fontWeight: 600 }}>{formatMoney(r.amount)}</td>
                              <td style={{ padding: '8px', color: C.textMuted }}>{r.type || 'standard'}</td>
                              <td style={{ padding: '8px' }}>
                                <span style={{ background: r.status === 'paid' ? '#D1FAE5' : r.status === 'rejected' ? '#FEE2E2' : '#FEF3C7', color: r.status === 'paid' ? '#065F46' : r.status === 'rejected' ? '#EF4444' : '#92400E', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                                  {r.status || 'pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'messages' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
                  {messages.length === 0 && <div style={{ color: C.textMuted, fontSize: 13 }}>No messages yet</div>}
                  {[...messages].reverse().map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: m.is_admin_reply ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 12, background: m.is_admin_reply ? '#4A7A68' : C.bg, color: m.is_admin_reply ? '#fff' : C.text, fontSize: 13, lineHeight: 1.5 }}>
                        <div>{m.body}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{formatDate(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type a reply..." rows={3}
                    style={{ flex: 1, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, resize: 'vertical', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
                  <button onClick={sendReply} style={{ ...btnPrimary, alignSelf: 'flex-end' }}>Send</button>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." style={{ flex: 1, ...inputStyle }}
                    onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
                  <button onClick={addNote} style={btnPrimary}>Add</button>
                </div>
                {notes.length === 0 && <div style={{ color: C.textMuted, fontSize: 13 }}>No notes yet</div>}
                {notes.map(n => (
                  <div key={n.id} style={{ padding: 12, background: C.bg, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{n.note}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                      {n.type && <span style={{ fontSize: 10, background: '#EFF6FF', color: '#3B82F6', padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>{n.type}</span>}
                      <span style={{ fontSize: 11, color: C.textMuted }}>{n.admin || 'Admin'} · {formatDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'fraud' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: C.bg, borderRadius: 10, marginBottom: 16 }}>
                  <FraudScoreCircle score={fraudScore} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: fraudColor }}>{fraudScore} / 100</div>
                    <div style={{ fontSize: 13, color: C.textMuted }}>{fraudScore >= 70 ? 'Critical Risk' : fraudScore >= 40 ? 'High Risk' : fraudScore >= 20 ? 'Suspicious' : fraudScore > 0 ? 'Watch' : 'Clean'}</div>
                    {fraudData?.admin_flagged && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>⚑ Manually flagged by admin</div>}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Fraud Signals</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SIGNALS.map(s => {
                      const active = fraudData?.[s.key]
                      if (!active) return null
                      return <span key={s.key} style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#FEE2E2', color: '#EF4444' }}>{s.label}</span>
                    })}
                    {!SIGNALS.some(s => fraudData?.[s.key]) && <span style={{ color: C.textMuted, fontSize: 13 }}>No signals detected</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={flagForFraud} style={{ ...btnDanger, flex: 1 }}>⚑ Flag for Fraud Review</button>
                  <button onClick={clearFraudFlag} style={{ ...btnGhost, flex: 1 }}>✓ Clear Fraud Flag</button>
                </div>
                {fraudData?.last_updated && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 12 }}>Last scored: {formatDate(fraudData.last_updated)}</div>}
              </div>
            )}

            {activeTab === 'actions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Admin Actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: '➕ Add Bonus Points', key: 'bonus', color: '#4A7A68', bg: '#D1FAE5', textColor: '#065F46' },
                    { label: '➖ Deduct Points', key: 'deduct', color: '#F97316', bg: '#FFF7ED', textColor: '#9A3412' },
                    { label: '🧊 Freeze Streak', key: 'freeze', color: '#3B82F6', bg: '#EFF6FF', textColor: '#1D4ED8' },
                    { label: '✉️ Send Message', key: 'message', color: '#4A7A68', bg: '#F0FDF4', textColor: '#166534' },
                    ...(!isMinor ? [{ label: '🎁 Issue Reward', key: 'reward', color: '#C9973A', bg: '#FEF3C7', textColor: '#92400E' }] : []),
                  ].map(a => (
                    <button key={a.key} onClick={() => setActionModal(a.key)}
                      style={{ padding: '14px', background: a.bg, color: a.textColor, border: `1px solid ${a.color}30`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      {a.label}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Account Status</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select defaultValue="" onChange={e => { if (e.target.value) { changeTier(e.target.value); e.target.value = '' } }}
                      style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, cursor: 'pointer' }}>
                      <option value="" disabled>Change Tier...</option>
                      {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name} — {formatMoney(v.price)}/mo</option>)}
                    </select>
                    <button onClick={pauseAccount} style={{ padding: '9px 14px', background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Pause 30d</button>
                  </div>
                </div>

                {deleteStep === 0 && (
                  <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <button onClick={() => setDeleteStep(1)} style={{ width: '100%', padding: '10px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      🗑️ Delete Account
                    </button>
                  </div>
                )}
                {deleteStep === 1 && (
                  <div style={{ padding: 14, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#EF4444', marginBottom: 8 }}>Permanently delete this account?</div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>User: <strong>{u.email}</strong>. This action is logged and irreversible.</p>
                    <button onClick={() => setDeleteStep(2)} style={{ padding: '8px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>Continue</button>
                    <button onClick={() => setDeleteStep(0)} style={btnGhost}>Cancel</button>
                  </div>
                )}
                {deleteStep === 2 && (
                  <div style={{ padding: 14, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>Type <strong style={{ fontFamily: 'monospace', color: '#EF4444' }}>DELETE</strong> to confirm permanent deletion:</div>
                    <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} placeholder="DELETE" style={{ ...inputStyle, marginBottom: 10, fontFamily: 'monospace', borderColor: '#FECACA' }} />
                    <button onClick={deleteAccount} disabled={deleteTyped !== 'DELETE'} style={{ padding: '8px 14px', background: deleteTyped === 'DELETE' ? '#EF4444' : '#FCA5A5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: deleteTyped === 'DELETE' ? 'pointer' : 'not-allowed', marginRight: 8 }}>Delete Permanently</button>
                    <button onClick={() => { setDeleteStep(0); setDeleteTyped('') }} style={btnGhost}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
