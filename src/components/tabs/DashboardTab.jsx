import React, { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { supabase } from '../../supabase.js'
import { TIERS, ALL_HABITS } from '../../config.js'
import { ChartSkeleton, CardSkeleton } from '../shared/LoadingSkeleton.jsx'

function formatMoney(n) { return '$' + Number(n || 0).toFixed(2) }

function KPICard({ icon, label, value, trend, color, C }) {
  const positive = trend >= 0
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: '18px 20px', border: `1px solid ${C.border}`, flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {trend !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 600, color: positive ? '#10B981' : '#EF4444', background: positive ? '#D1FAE5' : '#FEE2E2', padding: '2px 7px', borderRadius: 10 }}>
            {positive ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || C.text, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

const MOOD_LABELS = { 1: '😞 Terrible', 2: '😕 Bad', 3: '😐 Neutral', 4: '🙂 Good', 5: '😄 Great' }
const MOOD_COLORS = ['#EF4444', '#F97316', '#EAB308', '#4A7A68', '#10B981']

export default function DashboardTab({ theme, addToast }) {
  const C = theme
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})
  const [dauData, setDauData] = useState([])
  const [habitData, setHabitData] = useState([])
  const [moodData, setMoodData] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [alerts, setAlerts] = useState({ fraud: 0, unread: 0, minorRewardBalance: 0 })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

      const [
        profilesRes, todayRes, rewardsRes, fraudRes, unreadRes,
        dailyRes, habitLogsRes, moodRes
      ] = await Promise.all([
        supabase.from('profiles').select('id, tier, created_at, is_minor, monthly_points'),
        // ── day_successful is the correct column name ──
        supabase.from('daily_summaries')
          .select('user_id, total_points, day_successful, profiles(full_name, email)')
          .eq('date', today).eq('submitted', true),
        supabase.from('rewards').select('id, amount, status').eq('status', 'pending'),
        supabase.from('fraud_risk_scores').select('id, score').gte('score', 70),
        supabase.from('contact_messages').select('id').eq('is_read', false).eq('is_admin_reply', false),
        // ── 30-day DAU: group by date, count distinct user_id ──
        supabase.from('daily_summaries').select('date, user_id, total_points').gte('date', thirtyAgo).order('date'),
        // ── habit_logs: logged_at is the timestamp column ──
        supabase.from('habit_logs').select('habit_key, user_id, points_earned').eq('completed', true).gte('logged_at', thirtyAgo + 'T00:00:00'),
        // ── mood is integer 1-5 in daily_summaries ──
        supabase.from('daily_summaries').select('mood').gte('date', thirtyAgo).not('mood', 'is', null)
      ])

      const profiles = profilesRes.data || []
      const todaySummaries = todayRes.data || []
      const pendingRewards = rewardsRes.data || []
      const fraudCritical = fraudRes.data || []
      const unreadMsgs = unreadRes.data || []
      const dailySummaries = dailyRes.data || []
      const habitLogs = habitLogsRes.data || []
      const moodRows = moodRes.data || []

      // ── KPIs ──
      const totalUsers = profiles.length
      const activeToday = todaySummaries.length
      const mrrCalc = profiles.reduce((acc, p) => acc + (TIERS[p.tier]?.price || 0), 0)
      // Points issued this month from daily_summaries
      const thisMonthSummaries = dailySummaries.filter(d => d.date >= monthStart)
      const totalPointsThisMonth = thisMonthSummaries.reduce((a, d) => a + (d.total_points || 0), 0)
      // day_successful is the correct boolean column
      const successfulDaysToday = todaySummaries.filter(d => d.day_successful).length
      const rewardsPending = pendingRewards.reduce((a, r) => a + (r.amount || 0), 0)

      const prevProfiles = profiles.filter(p => new Date(p.created_at) < new Date(sevenAgo))
      const totalTrend = prevProfiles.length > 0 ? Math.round(((totalUsers - prevProfiles.length) / prevProfiles.length) * 100) : 0

      setKpis({ totalUsers, activeToday, mrr: mrrCalc, totalPointsThisMonth, successfulDaysToday, rewardsPending, totalTrend })

      const minorRewardBalance = profiles.filter(p => p.is_minor && (p.monthly_points || 0) > 0).length
      setAlerts({ fraud: fraudCritical.length, unread: unreadMsgs.length, minorRewardBalance })

      // ── DAU: distinct user_ids per day ──
      const dauMap = {}
      dailySummaries.forEach(d => {
        if (!d.user_id) return
        if (!dauMap[d.date]) dauMap[d.date] = new Set()
        dauMap[d.date].add(d.user_id)
      })
      const dauArr = []
      for (let i = 29; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i)
        const key = dt.toISOString().split('T')[0]
        const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
        dauArr.push({ date: label, users: dauMap[key]?.size || 0 })
      }
      setDauData(dauArr)

      // ── Habit completion — completed = true, logged_at used above ──
      const habitCountMap = {}
      habitLogs.forEach(h => { habitCountMap[h.habit_key] = (habitCountMap[h.habit_key] || 0) + 1 })
      const habitChartData = ALL_HABITS.map(h => ({
        name: h.name,
        count: habitCountMap[h.id] || 0,
        category: h.category
      })).sort((a, b) => b.count - a.count)
      setHabitData(habitChartData)

      // ── Mood distribution — integer 1-5 ──
      const moodMap = {}
      moodRows.forEach(r => { if (r.mood >= 1 && r.mood <= 5) moodMap[r.mood] = (moodMap[r.mood] || 0) + 1 })
      const moodArr = [1, 2, 3, 4, 5].map(v => ({ name: MOOD_LABELS[v], value: moodMap[v] || 0 })).filter(m => m.value > 0)
      setMoodData(moodArr)

      // ── Top 5 today: submitted = true, sorted by total_points, profile joined ──
      const sortedToday = [...todaySummaries]
        .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
        .slice(0, 5)
      setTopUsers(sortedToday)

    } catch (err) {
      console.error('[DashboardTab] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const interval = setInterval(fetchAll, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const sectionTitle = { fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      {/* Alert banner */}
      {(alerts.fraud > 0 || alerts.unread > 0 || alerts.minorRewardBalance > 0) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            {alerts.fraud > 0 && <span style={{ color: '#EF4444', fontWeight: 600, fontSize: 14, marginRight: 16 }}>{alerts.fraud} critical fraud flags require review</span>}
            {alerts.unread > 0 && <span style={{ color: '#EF4444', fontWeight: 600, fontSize: 14, marginRight: 16 }}>{alerts.unread} unread messages</span>}
            {alerts.minorRewardBalance > 0 && <span style={{ color: '#EF4444', fontWeight: 600, fontSize: 14 }}>⚠️ {alerts.minorRewardBalance} minor user(s) have reward balances — compliance review required</span>}
          </div>
        </div>
      )}

      {/* KPI Strip */}
      {loading ? (
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          {Array(6).fill(0).map((_, i) => (
            <div key={i} style={{ flex: 1, minWidth: 130, background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
              <CardSkeleton dark={false} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          <KPICard icon="👤" label="Total Users" value={kpis.totalUsers?.toLocaleString() || '0'} trend={kpis.totalTrend} C={C} />
          <KPICard icon="⚡" label="Active Today" value={kpis.activeToday?.toLocaleString() || '0'} C={C} />
          <KPICard icon="💰" label="MRR" value={formatMoney(kpis.mrr)} color="#4A7A68" C={C} />
          <KPICard icon="🏆" label="Points Issued (this month)" value={(kpis.totalPointsThisMonth || 0).toLocaleString()} C={C} />
          <KPICard icon="✅" label="Successful Days Today" value={kpis.successfulDaysToday || 0} C={C} />
          <KPICard icon="🎁" label="Rewards Pending" value={formatMoney(kpis.rewardsPending)} color="#C96A52" C={C} />
        </div>
      )}

      {/* DAU Chart */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Daily Active Users (30 days)</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Distinct users with a submitted daily_summaries record per day</div>
        {loading ? <ChartSkeleton height={200} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dauData}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4A7A68" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4A7A68" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.textMuted }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: C.textMuted }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="users" stroke="#4A7A68" fill="url(#dauGrad)" strokeWidth={2} name="Active Users" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Habit Completion */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <div style={sectionTitle}>Habit Completion (30 days)</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>completed = true only</div>
          {loading ? <ChartSkeleton height={240} /> : habitData.every(h => h.count === 0) ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No completed habits in the last 30 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={habitData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis type="number" tick={{ fontSize: 10, fill: C.textMuted }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} width={110} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#4A7A68" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Mood Distribution */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <div style={sectionTitle}>Mood Distribution (30 days)</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>daily_summaries.mood (integer 1–5)</div>
          {loading ? <ChartSkeleton height={240} /> : moodData.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No mood data in the last 30 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={moodData}
                  cx="50%" cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={11}
                >
                  {moodData.map((entry, i) => (
                    <Cell key={i} fill={MOOD_COLORS[i % MOOD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Streak Distribution — column not in profiles schema */}
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', marginBottom: 20 }}>
        <span style={{ fontSize: 28 }}>🔥</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Streak Length Distribution</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>No streak column exists in the profiles table. Streak data is not available for charting.</div>
        </div>
      </div>

      {/* Top Users Today */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Top 5 Most Active Users Today</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>submitted = true, ordered by total_points DESC</div>
        {loading ? <ChartSkeleton height={120} /> : topUsers.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0' }}>No submitted daily summaries yet today</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['#', 'User', 'Points Today', 'Successful Day'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u, i) => {
                const profile = u.profiles || {}
                const displayName = profile.full_name || profile.email || `User ${u.user_id?.slice(0, 8) || '—'}`
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.textMuted, fontWeight: 600, width: 28 }}>{i + 1}</td>
                    <td style={{ padding: '8px', color: C.text, fontWeight: 500 }}>{displayName}</td>
                    <td style={{ padding: '8px', color: '#4A7A68', fontWeight: 600 }}>{(u.total_points || 0).toLocaleString()} pts</td>
                    <td style={{ padding: '8px' }}>
                      {/* day_successful is the correct column */}
                      <span style={{ color: u.day_successful ? '#10B981' : '#6B7280' }}>
                        {u.day_successful ? '✓ Yes' : '—'}
                      </span>
                    </td>
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
