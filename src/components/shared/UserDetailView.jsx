import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { TierBadge } from './TierBadge.jsx'
import { StatusDot } from './StatusDot.jsx'
import { TIERS, ALL_HABITS, getHabitLabel } from '../../config.js'

function formatDate(d) {
  if (!d) return 'N/A'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}
function formatDateShort(d) {
  if (!d) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
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

// 30-day calendar heatmap: green=successful, gold=perfect, red=submitted+failed, grey=no entry
function DayCalendar({ summaries, C }) {
  const today = new Date()
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const s = summaries.find(x => x.date === key)
    days.push({ date: key, s })
  }
  const getColor = (s) => {
    if (!s || !s.submitted) return C.border
    if (s.perfect_day) return '#C9973A'
    if (s.day_successful) return '#4A7A68'
    return '#EF4444'
  }
  const labels = [
    { color: '#C9973A', label: 'Perfect day' },
    { color: '#4A7A68', label: 'Successful' },
    { color: '#EF4444', label: 'Not successful' },
    { color: C.border, label: 'No entry' }
  ]
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {days.map(({ date, s }) => (
          <div key={date} title={`${date}${s ? ` — ${s.total_points || 0} pts${s.day_successful ? ' ✓' : ''}${s.perfect_day ? ' ⭐' : ''}` : ' — no entry'}`}
            style={{ width: 22, height: 22, borderRadius: 4, background: getColor(s) }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: C.textMuted, flexWrap: 'wrap' }}>
        {labels.map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: l.color, display: 'inline-block', flexShrink: 0 }} />
            {l.label}
          </span>
        ))}
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
  const [todayHabits, setTodayHabits] = useState([])
  const [customHabits, setCustomHabits] = useState([])
  const [monthStats, setMonthStats] = useState(null)
  const [loading, setLoading] = useState(false)

  // Analytics tab state
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // History tab state
  const [historyData, setHistoryData] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const HISTORY_PER_PAGE = 30

  // Edit form state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ full_name: '', date_of_birth: '', phone: '', region: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Reply / notes
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')

  // Delete flow
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteTyped, setDeleteTyped] = useState('')

  // Action modals
  const [actionModal, setActionModal] = useState(null)
  const [actionAmount, setActionAmount] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionDays, setActionDays] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const C = theme

  // ─── Fetch core data ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

      const [profileRes, rewardsRes, messagesRes, notesRes, fraudRes, habitsRes, customHabitsRes, monthRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('rewards').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('contact_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('admin_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('fraud_risk_scores').select('*').eq('user_id', user.id).single(),
        supabase.from('habit_logs')
          .select('id, habit_key, completed, points_earned, habit_type, photo_url, logged_at')
          .eq('user_id', user.id).eq('date', today).eq('completed', true).order('logged_at', { ascending: false }),
        supabase.from('custom_habits').select('id, name, emoji, created_at, is_active').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('daily_summaries').select('total_points, day_successful, total_completed').eq('user_id', user.id).gte('date', monthStart)
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
      setTodayHabits(habitsRes.data || [])
      setCustomHabits(customHabitsRes.data || [])

      const monthSummaries = monthRes.data || []
      setMonthStats({
        totalPoints: monthSummaries.reduce((a, s) => a + (s.total_points || 0), 0),
        successDays: monthSummaries.filter(s => s.day_successful).length,
        daysLogged: monthSummaries.length,
        habitsLogged: monthSummaries.reduce((a, s) => a + (s.total_completed || 0), 0)
      })
    } catch {
      setUserDetails(user)
    } finally {
      setLoading(false)
    }
  }, [user])

  // ─── Fetch analytics (lazy — only when tab opens) ─────────────────────────
  const fetchAnalytics = useCallback(async () => {
    if (!user) return
    setAnalyticsLoading(true)
    try {
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      const [summariesRes, logsRes] = await Promise.all([
        supabase.from('daily_summaries')
          .select('date, day_successful, perfect_day, submitted, total_points, total_completed')
          .eq('user_id', user.id).gte('date', thirtyAgo).order('date', { ascending: false }),
        supabase.from('habit_logs')
          .select('habit_key, date, points_earned')
          .eq('user_id', user.id).gte('date', thirtyAgo).eq('completed', true)
      ])
      setAnalyticsData({ summaries: summariesRes.data || [], logs: logsRes.data || [] })
    } catch {
      setAnalyticsData({ summaries: [], logs: [] })
    } finally {
      setAnalyticsLoading(false)
    }
  }, [user])

  // ─── Fetch history (paginated) ─────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!user) return
    setHistoryLoading(true)
    try {
      const { data, count } = await supabase.from('daily_summaries')
        .select('date, total_completed, total_points, day_successful, perfect_day, submitted', { count: 'exact' })
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .range((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE - 1)
      setHistoryData(data || [])
      setHistoryTotal(count || 0)
    } catch {
      setHistoryData([])
    } finally {
      setHistoryLoading(false)
    }
  }, [user, historyPage])

  useEffect(() => {
    if (isOpen && user) {
      fetchAll()
      setActiveTab('overview')
      setDeleteStep(0)
      setActionModal(null)
      setIsEditing(false)
      setHistoryPage(1)
      setAnalyticsData(null)
      setHistoryData([])
    }
  }, [isOpen, user, fetchAll])

  useEffect(() => {
    if (isOpen && user && activeTab === 'analytics') fetchAnalytics()
  }, [isOpen, user, activeTab, fetchAnalytics])

  useEffect(() => {
    if (isOpen && user && activeTab === 'history') fetchHistory()
  }, [isOpen, user, activeTab, historyPage, fetchHistory])

  // ─── Actions ───────────────────────────────────────────────────────────────
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
      await supabase.from('profiles').update({ pause_active: true }).eq('id', user.id)
      setUserDetails(prev => ({ ...prev, pause_active: true }))
      addToast('Account paused for 30 days', 'warning')
      logAdminAction('account_paused', { userId: user.id, email: user.email })
      onUserUpdated?.()
    } catch { addToast('Failed to pause account', 'error') }
  }

  const deleteAccount = async () => {
    if (deleteTyped !== 'DELETE') return
    try {
      await supabase.from('profiles').update({ deleted: true }).eq('id', user.id)
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
      const newBalance = (userDetails?.monthly_points || 0) + pts
      await supabase.from('profiles').update({ monthly_points: newBalance }).eq('id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Admin bonus: +${pts} points. Reason: ${actionReason}`, type: 'bonus_points', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      setUserDetails(prev => ({ ...prev, monthly_points: newBalance }))
      addToast(`+${pts} bonus points added`, 'success')
      logAdminAction('bonus_points', { userId: user.id, points: pts, reason: actionReason })
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
      const newBalance = Math.max(0, (userDetails?.monthly_points || 0) - pts)
      await supabase.from('profiles').update({ monthly_points: newBalance }).eq('id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Admin deduction: -${pts} points. Reason: ${actionReason}`, type: 'deduct_points', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      setUserDetails(prev => ({ ...prev, monthly_points: newBalance }))
      addToast(`-${pts} points deducted`, 'warning')
      logAdminAction('deduct_points', { userId: user.id, points: pts, reason: actionReason })
      setActionModal(null); setActionAmount(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to deduct points', 'error') }
    setActionLoading(false)
  }

  const freezeStreak = async () => {
    if (!actionDays || isNaN(Number(actionDays))) return
    setActionLoading(true)
    try {
      await supabase.from('profiles').update({ freeze_used_this_month: true }).eq('id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Streak freeze applied for ${actionDays} days. Reason: ${actionReason}`, type: 'streak_freeze', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast(`Streak frozen for ${actionDays} days`, 'success')
      logAdminAction('streak_freeze', { userId: user.id, days: actionDays })
      setActionModal(null); setActionDays(''); setActionReason('')
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
      logAdminAction('direct_message', { userId: user.id })
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
      logAdminAction('manual_reward', { userId: user.id, amount, reason: actionReason })
      setActionModal(null); setActionAmount(''); setActionReason('')
      onUserUpdated?.()
    } catch { addToast('Failed to issue reward', 'error') }
    setActionLoading(false)
  }

  const flagForFraud = async () => {
    try {
      await supabase.from('fraud_risk_scores').upsert({ user_id: user.id, score: 70, admin_flagged: true, created_at: new Date().toISOString() })
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Manually flagged for fraud review`, type: 'fraud_flag', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast('User flagged for fraud review', 'warning')
      logAdminAction('fraud_flag', { userId: user.id })
      fetchAll(); onUserUpdated?.()
    } catch { addToast('Failed to flag user', 'error') }
  }

  const clearFraudFlag = async () => {
    try {
      await supabase.from('fraud_risk_scores').update({ score: 0, admin_flagged: false }).eq('user_id', user.id)
      await supabase.from('admin_notes').insert({ user_id: user.id, note: `Fraud flag cleared by admin`, type: 'fraud_clear', created_at: new Date().toISOString(), admin: import.meta.env.VITE_ADMIN_EMAIL })
      addToast('Fraud flag cleared', 'success')
      logAdminAction('fraud_clear', { userId: user.id })
      fetchAll(); onUserUpdated?.()
    } catch { addToast('Failed to clear flag', 'error') }
  }

  const saveProfileEdit = async () => {
    setEditSaving(true)
    const savedFields = []
    try {
      // Step 1: Save confirmed-existing fields (full_name, date_of_birth)
      const nameAndDob = {
        full_name: editForm.full_name?.trim() || null,
        date_of_birth: editForm.date_of_birth || null  // HTML date input always gives YYYY-MM-DD
      }
      console.log('[saveProfileEdit] payload:', nameAndDob, 'user_id:', user.id)
      const { error: err1 } = await supabase.from('profiles').update(nameAndDob).eq('id', user.id)
      if (err1) { console.error('[saveProfileEdit] nameAndDob error:', err1); throw err1 }
      if (editForm.full_name?.trim() !== (userDetails?.full_name || '')) savedFields.push('full_name')
      if (editForm.date_of_birth !== (userDetails?.date_of_birth || '')) savedFields.push('date_of_birth')

      // Step 2: region (silent if column missing)
      if (editForm.region !== undefined) {
        const { error: err2 } = await supabase.from('profiles').update({ region: editForm.region || null }).eq('id', user.id)
        if (err2) console.warn('[saveProfileEdit] region:', err2.message)
        else if (editForm.region !== (userDetails?.region || '')) savedFields.push('region')
      }

      // Step 3: phone (silent if column missing)
      if (editForm.phone !== undefined) {
        const { error: err3 } = await supabase.from('profiles').update({ phone: editForm.phone || null }).eq('id', user.id)
        if (err3) console.warn('[saveProfileEdit] phone:', err3.message)
        else if (editForm.phone !== (userDetails?.phone || '')) savedFields.push('phone')
      }

      await supabase.from('admin_notes').insert({
        user_id: user.id,
        note: `[AUDIT] Admin updated: ${savedFields.join(', ') || 'no changes'}`,
        type: 'profile_edit',
        created_at: new Date().toISOString(),
        admin: import.meta.env.VITE_ADMIN_EMAIL
      })
      addToast('Profile updated', 'success')
      logAdminAction('profile_edit', { userId: user.id, fields: savedFields })
      setIsEditing(false)
      fetchAll(); onUserUpdated?.()
    } catch (err) {
      addToast('Failed to save profile', 'error')
      console.error('[saveProfileEdit] fatal:', err)
    }
    setEditSaving(false)
  }

  if (!isOpen || !user) return null

  const u = userDetails || user
  const initials = (u.full_name || u.email || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const fraudScore = fraudData?.score || u.fraud_score || 0
  const fraudColor = fraudScore >= 70 ? '#EF4444' : fraudScore >= 40 ? '#F97316' : fraudScore >= 20 ? '#EAB308' : '#6B7280'
  const isMinor = u.is_minor || false

  const derivedStatus = (() => {
    if (u.deleted) return 'churned'
    if (u.pause_active) return 'inactive'
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    return (u.last_active_date && u.last_active_date >= sevenAgo) ? 'active' : 'churned'
  })()

  const inputStyle = { width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
  const btnPrimary = { padding: '8px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const btnDanger = { padding: '8px 14px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const btnGhost = { padding: '8px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }
  const card = { padding: 14, background: C.bg, borderRadius: 10 }

  const tabs = ['overview', 'analytics', 'history', 'rewards', 'messages', 'notes']

  // ─── Action Modal ──────────────────────────────────────────────────────────
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
                    : <input type={f.type || 'text'} value={f.value} onChange={f.onChange} placeholder={f.placeholder} style={inputStyle} />}
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ActionModal />
      <div style={{ position: 'fixed', inset: 0, zIndex: 800, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} onClick={onClose} />
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 640, background: C.card, boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflowY: 'auto' }}>

          {/* Minor banner */}
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
                  <StatusDot status={derivedStatus} showLabel />
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FraudScoreCircle score={fraudScore} />
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textMuted, padding: '0 4px' }}>×</button>
              </div>
            </div>

            {/* Tab bar */}
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
          <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>

            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} style={{ padding: '7px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text, fontWeight: 500 }}>
                      ✏️ Edit Profile
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setIsEditing(false); setEditForm({ full_name: u.full_name || '', date_of_birth: u.date_of_birth || '', phone: u.phone || '', region: u.region || '' }) }} style={btnGhost}>Cancel</button>
                      <button onClick={saveProfileEdit} disabled={editSaving} style={{ ...btnPrimary, opacity: editSaving ? 0.7 : 1, cursor: editSaving ? 'not-allowed' : 'pointer' }}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                    {[
                      { label: 'Full Name', field: 'full_name', type: 'text', placeholder: 'Jane Smith' },
                      { label: 'Date of Birth', field: 'date_of_birth', type: 'date', placeholder: '' },
                      { label: 'Phone Number', field: 'phone', type: 'text', placeholder: '+1 555 000 0000' }
                    ].map(({ label, field, type, placeholder }) => (
                      <div key={field}>
                        <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                        <input type={type} value={editForm[field]} onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))} placeholder={placeholder} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Region</label>
                      <select value={editForm.region} onChange={e => setEditForm(prev => ({ ...prev, region: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
                        <option value="">— Not set</option>
                        <option value="USA">USA</option>
                        <option value="India">India</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Profile card */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                    {[
                      ['Joined', formatDate(u.created_at)],
                      ['Last Active', u.last_active_date ? formatDate(u.last_active_date) : '—'],
                      ['Date of Birth', u.date_of_birth ? formatDate(u.date_of_birth) : '—'],
                      ['Age', u.date_of_birth ? (new Date().getFullYear() - new Date(u.date_of_birth + 'T00:00:00').getFullYear()) + ' yrs' : (u.age ? u.age + ' yrs' : '—')],
                      ['Gender', u.gender || '—'],
                      ['Region', u.region || '—'],
                      ['Phone', u.phone || '—'],
                      ...(!isMinor ? [['Referral Code', u.referral_code || '—']] : []),
                      ['Research Consent', u.research_consent == null ? '—' : u.research_consent ? '✓ Opted in' : '✗ Opted out'],
                      ['Freeze Available', u.freeze_available ? 'Yes' : 'No'],
                      ['Freeze Used', u.freeze_used_this_month ? 'Yes (this month)' : 'No'],
                    ].map(([label, val]) => (
                      <div key={label} style={card}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* This month stats */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>This Month</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      ['Points', monthStats ? monthStats.totalPoints.toLocaleString() : '—'],
                      ['Successful Days', monthStats ? monthStats.successDays : '—'],
                      ['Days Logged', monthStats ? monthStats.daysLogged : '—'],
                      ['Habits Logged', monthStats ? monthStats.habitsLogged : '—'],
                      ['Monthly Points (profile)', (u.monthly_points || 0).toLocaleString()],
                      ['Total Successful (profile)', u.successful_days || 0]
                    ].map(([label, val]) => (
                      <div key={label} style={{ ...card, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#4A7A68' }}>{val}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Today's habits */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Today's Habits</div>
                  {todayHabits.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: 13 }}>No habits completed today</div>
                  ) : todayHabits.map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: '#10B981', fontSize: 16 }}>✓</span>
                      <span style={{ fontSize: 14, color: C.text, flex: 1 }}>{getHabitLabel(h.habit_key)}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{h.points_earned} pts</span>
                      {h.photo_url && <span style={{ fontSize: 11, background: '#EFF6FF', color: '#3B82F6', padding: '1px 6px', borderRadius: 6 }}>📷</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ANALYTICS ── */}
            {activeTab === 'analytics' && (
              <div>
                {analyticsLoading ? (
                  <div style={{ color: C.textMuted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading analytics...</div>
                ) : !analyticsData ? null : (
                  <>
                    {/* 30-day calendar heatmap */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>30-Day Calendar</div>
                      <DayCalendar summaries={analyticsData.summaries} C={C} />
                    </div>

                    {/* Per-habit completion rate */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Habit Completion Rate (last 30 days)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {ALL_HABITS.map(habit => {
                          const count = analyticsData.logs.filter(l => l.habit_key === habit.id).length
                          const pct = Math.min(Math.round((count / 30) * 100), 100)
                          return (
                            <div key={habit.id}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 13, color: C.text }}>{getHabitLabel(habit.id)}</span>
                                <span style={{ fontSize: 12, color: C.textMuted }}>{count}/30 ({pct}%)</span>
                              </div>
                              <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: habit.category === 'core' ? '#4A7A68' : '#C9973A', borderRadius: 4, transition: 'width 0.4s' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: C.textMuted }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#4A7A68', display: 'inline-block' }} /> Core habits</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#C9973A', display: 'inline-block' }} /> Library habits</span>
                      </div>
                    </div>

                    {/* Last 7 days table */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Last 7 Days</div>
                      {analyticsData.summaries.length === 0 ? (
                        <div style={{ color: C.textMuted, fontSize: 13 }}>No data in the last 30 days</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                              {['Date', 'Habits', 'Points', 'Successful', 'Perfect'].map(h => (
                                <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {analyticsData.summaries.slice(0, 7).map(s => (
                              <tr key={s.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                                <td style={{ padding: '9px 8px', color: C.text }}>{formatDateShort(s.date)}</td>
                                <td style={{ padding: '9px 8px', color: C.text }}>{s.total_completed || 0}</td>
                                <td style={{ padding: '9px 8px', color: C.text }}>{s.total_points || 0}</td>
                                <td style={{ padding: '9px 8px' }}>
                                  <span style={{ color: s.day_successful ? '#10B981' : '#EF4444', fontWeight: 600 }}>{s.day_successful ? '✓' : '✗'}</span>
                                </td>
                                <td style={{ padding: '9px 8px' }}>
                                  {s.perfect_day ? <span style={{ color: '#C9973A', fontWeight: 600 }}>⭐</span> : <span style={{ color: C.border }}>—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── HISTORY ── */}
            {activeTab === 'history' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                  Daily Log History ({historyTotal} days total)
                </div>
                {historyLoading ? (
                  <div style={{ color: C.textMuted, fontSize: 13 }}>Loading...</div>
                ) : historyData.length === 0 ? (
                  <div style={{ color: C.textMuted, fontSize: 13 }}>No history found</div>
                ) : (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                          {['Date', 'Habits', 'Points', 'Successful', 'Perfect', 'Submitted'].map(h => (
                            <th key={h} style={{ padding: '9px 10px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map(s => (
                          <tr key={s.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '9px 10px', color: C.text, fontWeight: 500 }}>{formatDateShort(s.date)}</td>
                            <td style={{ padding: '9px 10px', color: C.text }}>{s.total_completed ?? '—'}</td>
                            <td style={{ padding: '9px 10px', color: C.text }}>{s.total_points ?? '—'}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <span style={{ color: s.day_successful ? '#10B981' : '#9CA3AF', fontWeight: 600 }}>{s.day_successful ? '✓' : '✗'}</span>
                            </td>
                            <td style={{ padding: '9px 10px' }}>{s.perfect_day ? <span style={{ color: '#C9973A' }}>⭐</span> : <span style={{ color: C.border }}>—</span>}</td>
                            <td style={{ padding: '9px 10px' }}>{s.submitted ? <span style={{ color: '#10B981' }}>✓</span> : <span style={{ color: C.border }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Pagination */}
                    {historyTotal > HISTORY_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13 }}>
                        <span style={{ color: C.textMuted }}>Page {historyPage} of {Math.ceil(historyTotal / HISTORY_PER_PAGE)}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} style={{ ...btnGhost, padding: '6px 12px', opacity: historyPage === 1 ? 0.4 : 1 }}>← Prev</button>
                          <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage >= Math.ceil(historyTotal / HISTORY_PER_PAGE)} style={{ ...btnGhost, padding: '6px 12px', opacity: historyPage >= Math.ceil(historyTotal / HISTORY_PER_PAGE) ? 0.4 : 1 }}>Next →</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── REWARDS ── */}
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
                    {/* This month reward cap summary */}
                    <div style={{ padding: '12px 16px', background: C.bg, borderRadius: 10, marginBottom: 16, display: 'flex', gap: 20 }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Monthly Points</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#4A7A68' }}>{(u.monthly_points || 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Tier Reward Cap</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{formatMoney(TIERS[u.tier]?.reward_cap)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Successful Days</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{u.successful_days || 0}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Reward History</div>
                    {rewards.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13 }}>No rewards yet</div> : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            {['Date', 'Amount', 'Type', 'Status', 'Tremendous ID'].map(h => (
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
                              <td style={{ padding: '8px', color: C.textMuted, fontSize: 11 }}>{r.tremendous_order_id || r.order_id || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── MESSAGES ── */}
            {activeTab === 'messages' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 360, overflowY: 'auto' }}>
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

            {/* ── NOTES (+ ACTIONS + FRAUD) ── */}
            {activeTab === 'notes' && (
              <div>
                {/* Quick actions */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Admin Actions</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: '➕ Add Bonus Points', key: 'bonus', bg: '#D1FAE5', textColor: '#065F46', border: '#4A7A68' },
                      { label: '➖ Deduct Points', key: 'deduct', bg: '#FFF7ED', textColor: '#9A3412', border: '#F97316' },
                      { label: '🧊 Freeze Streak', key: 'freeze', bg: '#EFF6FF', textColor: '#1D4ED8', border: '#3B82F6' },
                      { label: '✉️ Send Message', key: 'message', bg: '#F0FDF4', textColor: '#166534', border: '#4A7A68' },
                      ...(!isMinor ? [{ label: '🎁 Issue Reward', key: 'reward', bg: '#FEF3C7', textColor: '#92400E', border: '#C9973A' }] : [])
                    ].map(a => (
                      <button key={a.key} onClick={() => setActionModal(a.key)} style={{ padding: '12px', background: a.bg, color: a.textColor, border: `1px solid ${a.border}30`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Account management */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Account</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select defaultValue="" onChange={e => { if (e.target.value) { changeTier(e.target.value); e.target.value = '' } }}
                      style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, cursor: 'pointer', minWidth: 140 }}>
                      <option value="" disabled>Change Tier...</option>
                      {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                    </select>
                    <button onClick={pauseAccount} style={{ padding: '9px 14px', background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Pause 30d</button>
                  </div>
                </div>

                {/* Fraud */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Fraud Risk</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <FraudScoreCircle score={fraudScore} />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: fraudColor }}>{fraudScore} / 100</div>
                      <div style={{ fontSize: 13, color: C.textMuted }}>{fraudScore >= 70 ? 'Critical Risk' : fraudScore >= 40 ? 'High Risk' : fraudScore >= 20 ? 'Suspicious' : fraudScore > 0 ? 'Watch' : 'Clean'}</div>
                      {fraudData?.admin_flagged && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>⚑ Admin flagged</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                      {SIGNALS.map(s => fraudData?.[s.key] && (
                        <span key={s.key} style={{ padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#FEE2E2', color: '#EF4444' }}>{s.label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={flagForFraud} style={{ ...btnDanger, flex: 1, fontSize: 12 }}>⚑ Flag for Fraud</button>
                    <button onClick={clearFraudFlag} style={{ ...btnGhost, flex: 1, fontSize: 12 }}>✓ Clear Flag</button>
                  </div>
                </div>

                {/* Delete */}
                {deleteStep === 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <button onClick={() => setDeleteStep(1)} style={{ width: '100%', padding: '10px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🗑️ Delete Account</button>
                  </div>
                )}
                {deleteStep === 1 && (
                  <div style={{ padding: 14, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA', marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#EF4444', marginBottom: 8 }}>Permanently delete this account?</div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>User: <strong>{u.email}</strong>. Irreversible.</p>
                    <button onClick={() => setDeleteStep(2)} style={{ padding: '8px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>Continue</button>
                    <button onClick={() => setDeleteStep(0)} style={btnGhost}>Cancel</button>
                  </div>
                )}
                {deleteStep === 2 && (
                  <div style={{ padding: 14, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>Type <strong style={{ fontFamily: 'monospace', color: '#EF4444' }}>DELETE</strong> to confirm:</div>
                    <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} placeholder="DELETE" style={{ ...inputStyle, marginBottom: 10, fontFamily: 'monospace', borderColor: '#FECACA' }} />
                    <button onClick={deleteAccount} disabled={deleteTyped !== 'DELETE'} style={{ padding: '8px 14px', background: deleteTyped === 'DELETE' ? '#EF4444' : '#FCA5A5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: deleteTyped === 'DELETE' ? 'pointer' : 'not-allowed', marginRight: 8 }}>Delete Permanently</button>
                    <button onClick={() => { setDeleteStep(0); setDeleteTyped('') }} style={btnGhost}>Cancel</button>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Admin Notes</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
