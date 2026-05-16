import React, { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { supabase } from '../../supabase.js'
import { TIERS } from '../../config.js'

function formatMoney(n) { return '$' + Number(n || 0).toFixed(2) }
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }) }

const TIER_COLORS_MAP = { free_trial: '#6B7280', free_expired: '#9CA3AF', basic: '#3B82F6', plus: '#4A7A68', premium: '#C9973A' }

async function tremendousApprove({ userEmail, amount, note }) {
  const apiKey = import.meta.env.VITE_TREMENDOUS_API_KEY
  const fundingSourceId = import.meta.env.VITE_TREMENDOUS_FUNDING_SOURCE_ID
  if (!apiKey || !fundingSourceId) throw new Error('Tremendous API key or funding source not configured in .env')

  const res = await fetch('https://testflight.tremendous.com/api/v2/orders', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment: { funding_source_id: fundingSourceId },
      rewards: [{
        value: { denomination: amount, currency_code: 'USD' },
        recipient: { email: userEmail, name: userEmail },
        delivery: { method: 'EMAIL' },
        products: ['HZBT4Z0M3E6K'], // Amazon gift card — update as needed
        note: note || 'Niyama Life reward'
      }]
    })
  })
  if (!res.ok) { const err = await res.json(); throw new Error(err.message || `Tremendous error ${res.status}`) }
  return await res.json()
}

export default function FinancialsTab({ theme, addToast, logAdminAction }) {
  const C = theme
  const [tierDist, setTierDist] = useState({})
  const [pendingRewards, setPendingRewards] = useState([])
  const [loading, setLoading] = useState(true)
  const [revenueRange, setRevenueRange] = useState(30)
  const [revenueData, setRevenueData] = useState([])
  const [paidThisMonth, setPaidThisMonth] = useState(0)
  const [monthlyPL, setMonthlyPL] = useState([])

  // Tremendous state
  const [tremendousQueue, setTremendousQueue] = useState([])
  const [tqLoading, setTqLoading] = useState(false)
  const [payoutHistory, setPayoutHistory] = useState([])
  const [manualSearch, setManualSearch] = useState('')
  const [manualUser, setManualUser] = useState(null)
  const [manualAmount, setManualAmount] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  const fetchTremendousQueue = useCallback(async () => {
    setTqLoading(true)
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data } = await supabase.from('rewards')
        .select('id, user_id, amount, status, created_at, tremendous_order_id, profiles(full_name, email, tier, created_at, is_minor, monthly_points)')
        .eq('status', 'pending')
        .gte('amount', 0.01)
        .order('created_at', { ascending: false })
        .limit(50)

      const history = await supabase.from('rewards')
        .select('id, user_id, amount, status, created_at, paid_at, tremendous_order_id, profiles(full_name, email)')
        .eq('status', 'paid').order('paid_at', { ascending: false }).limit(30)

      // Filter out minors, exclude high fraud risk
      const queue = (data || []).filter(r => {
        const profile = r.profiles
        if (!profile || profile.is_minor) return false
        const accountAge = (Date.now() - new Date(profile.created_at)) / 86400000
        return accountAge >= 30
      })
      setTremendousQueue(queue)
      setPayoutHistory(history.data || [])
    } catch (err) { console.error(err) }
    setTqLoading(false)
  }, [])

  const approveTremendous = async (reward) => {
    const profile = reward.profiles
    if (!profile?.email) { addToast('No email for this user', 'error'); return }
    try {
      const result = await tremendousApprove({ userEmail: profile.email, amount: reward.amount, note: `Niyama ${profile.tier} reward` })
      const orderId = result.order?.id || 'TEST-' + Date.now()
      await supabase.from('rewards').update({ status: 'paid', paid_at: new Date().toISOString(), tremendous_order_id: orderId }).eq('id', reward.id)
      await supabase.from('admin_notes').insert({ user_id: reward.user_id, note: `Reward ${formatMoney(reward.amount)} approved via Tremendous. Order ID: ${orderId}`, type: 'reward_approval', created_at: new Date().toISOString() })
      setTremendousQueue(prev => prev.filter(r => r.id !== reward.id))
      addToast(`✅ ${formatMoney(reward.amount)} sent via Tremendous (Order: ${orderId})`, 'success')
      logAdminAction('tremendous_payout', { rewardId: reward.id, amount: reward.amount, orderId })
    } catch (err) {
      addToast(`Tremendous error: ${err.message}`, 'error')
    }
  }

  const rejectTremendous = async (id, userId, amount) => {
    const reason = prompt('Rejection reason:')
    if (reason === null) return
    await supabase.from('rewards').update({ status: 'rejected' }).eq('id', id)
    await supabase.from('admin_notes').insert({ user_id: userId, note: `Reward rejected: ${reason}`, type: 'reward_rejection', created_at: new Date().toISOString() })
    setTremendousQueue(prev => prev.filter(r => r.id !== id))
    addToast('Reward rejected', 'warning')
    logAdminAction('reward_rejected', { rewardId: id, amount, reason })
  }

  const searchManualUser = async () => {
    if (!manualSearch.trim()) return
    const { data } = await supabase.from('profiles').select('id, full_name, email, tier, is_minor').ilike('email', `%${manualSearch}%`).limit(1).single()
    setManualUser(data || null)
    if (!data) addToast('User not found', 'error')
  }

  const issueManualTremendous = async () => {
    if (!manualUser || !manualAmount) return
    if (manualUser.is_minor) { addToast('Cannot issue rewards to minor users', 'error'); return }
    setManualLoading(true)
    try {
      const amt = parseFloat(manualAmount)
      const result = await tremendousApprove({ userEmail: manualUser.email, amount: amt, note: manualNote || 'Manual admin reward' })
      const orderId = result.order?.id || 'TEST-' + Date.now()
      await supabase.from('rewards').insert({ user_id: manualUser.id, amount: amt, status: 'paid', type: 'manual', tremendous_order_id: orderId, note: manualNote, paid_at: new Date().toISOString(), created_at: new Date().toISOString() })
      await supabase.from('admin_notes').insert({ user_id: manualUser.id, note: `Manual reward ${formatMoney(amt)} via Tremendous. Order: ${orderId}. Note: ${manualNote}`, type: 'manual_reward', created_at: new Date().toISOString() })
      addToast(`✅ Manual reward ${formatMoney(amt)} sent to ${manualUser.email}`, 'success')
      logAdminAction('manual_tremendous_reward', { userId: manualUser.id, amount: amt, orderId })
      setManualUser(null); setManualSearch(''); setManualAmount(''); setManualNote('')
    } catch (err) { addToast(`Error: ${err.message}`, 'error') }
    setManualLoading(false)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [profilesRes, pendingRes, paidRes] = await Promise.all([
        supabase.from('profiles').select('tier, created_at, is_minor'),
        supabase.from('rewards').select('id, user_id, amount, status, created_at, profiles(full_name, email, tier, is_minor)').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('rewards').select('amount').eq('status', 'paid').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      ])

      const profiles = (profilesRes.data || []).filter(p => !p.is_minor)
      const dist = {}
      profiles.forEach(p => { dist[p.tier || 'free_trial'] = (dist[p.tier || 'free_trial'] || 0) + 1 })
      setTierDist(dist)
      setPendingRewards((pendingRes.data || []).filter(r => !r.profiles?.is_minor))
      const paid = (paidRes.data || []).reduce((a, r) => a + (r.amount || 0), 0)
      setPaidThisMonth(paid)

      // Revenue trend (simulate from join dates)
      const revArr = []
      for (let i = revenueRange - 1; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i)
        const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
        const active = profiles.filter(p => new Date(p.created_at) <= dt).length
        const mrr = profiles.filter(p => new Date(p.created_at) <= dt).reduce((a, p) => a + (TIERS[p.tier]?.price || 0), 0)
        revArr.push({ date: label, mrr: parseFloat(mrr.toFixed(2)), users: active })
      }
      setRevenueData(revArr)

      // Mock monthly P&L
      const currentMRR = Object.entries(dist).reduce((a, [k, count]) => a + count * (TIERS[k]?.price || 0), 0)
      const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']
      setMonthlyPL(months.map((m, i) => ({
        month: m,
        revenue: parseFloat((currentMRR * (0.7 + i * 0.06)).toFixed(2)),
        rewards: parseFloat((paid * (0.5 + i * 0.1)).toFixed(2))
      })).map(r => ({ ...r, net: parseFloat((r.revenue - r.rewards).toFixed(2)) })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [revenueRange])

  useEffect(() => { fetchData(); fetchTremendousQueue() }, [fetchData, fetchTremendousQueue])

  const approveReward = async (id, userId, amount) => {
    try {
      await supabase.from('rewards').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('admin_notes').insert({ user_id: userId, note: `Reward of ${formatMoney(amount)} approved by admin`, type: 'reward_approval', created_at: new Date().toISOString() })
      setPendingRewards(prev => prev.filter(r => r.id !== id))
      addToast(`Reward ${formatMoney(amount)} approved`, 'success')
      logAdminAction('reward_approval', { rewardId: id, amount })
    } catch { addToast('Failed to approve reward', 'error') }
  }

  const rejectReward = async (id, userId, amount) => {
    try {
      await supabase.from('rewards').update({ status: 'rejected' }).eq('id', id)
      await supabase.from('admin_notes').insert({ user_id: userId, note: `Reward of ${formatMoney(amount)} rejected by admin`, type: 'reward_rejection', created_at: new Date().toISOString() })
      setPendingRewards(prev => prev.filter(r => r.id !== id))
      addToast(`Reward rejected`, 'warning')
      logAdminAction('reward_rejection', { rewardId: id, amount })
    } catch { addToast('Failed to reject reward', 'error') }
  }

  const mrrTable = Object.entries(TIERS).map(([key, tier]) => ({
    tier: tier.name, key, subscribers: tierDist[key] || 0, price: tier.price,
    mrr: ((tierDist[key] || 0) * tier.price).toFixed(2)
  }))
  const totalMRR = mrrTable.reduce((a, t) => a + parseFloat(t.mrr), 0)
  const pieData = mrrTable.filter(t => parseFloat(t.mrr) > 0).map(t => ({ name: t.tier, value: parseFloat(t.mrr) }))

  const churnRate = 3.2 // mock
  const projectedMRR = totalMRR * (1 - churnRate / 100) * 1.05

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const btnStyle = (active) => ({ padding: '7px 14px', background: active ? '#4A7A68' : C.bg, color: active ? '#fff' : C.text, border: `1px solid ${active ? '#4A7A68' : C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400 })

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Financials</h2>

      {/* MRR Section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Monthly Recurring Revenue</h3>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#4A7A68' }}>{formatMoney(totalMRR)}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Total MRR</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Tier', 'Subscribers', 'Price', 'MRR'].map(h => (
                    <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mrrTable.map(row => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_COLORS_MAP[row.key] }} />
                        <span style={{ fontWeight: 600, color: C.text }}>{row.tier}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: C.text }}>{row.subscribers.toLocaleString()}</td>
                    <td style={{ padding: '10px 8px', color: C.textMuted }}>{formatMoney(row.price)}/mo</td>
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: '#4A7A68' }}>{formatMoney(row.mrr)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.bg }}>
                  <td colSpan={3} style={{ padding: '10px 8px', fontWeight: 700, color: C.text }}>Total</td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: '#4A7A68', fontSize: 15 }}>{formatMoney(totalMRR)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14, padding: '10px 14px', background: C.bg, borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: C.textMuted }}>Churn Rate (est.)</span><span style={{ fontWeight: 600, color: '#EF4444' }}>{churnRate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.textMuted }}>Projected MRR (next month)</span><span style={{ fontWeight: 600, color: '#4A7A68' }}>{formatMoney(projectedMRR)}</span>
              </div>
            </div>
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={11}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={TIER_COLORS_MAP[entry.name?.toLowerCase()] || '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 13 }}>No paid tiers yet</div>
          )}
        </div>
      </div>

      {/* Revenue Trend */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Revenue Trend</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {[30, 90, 180].map(d => (
              <button key={d} onClick={() => setRevenueRange(d)} style={btnStyle(revenueRange === d)}>{d}d</button>
            ))}
          </div>
        </div>
        {loading ? <div style={{ height: 200, background: C.bg, borderRadius: 8 }} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.textMuted }} interval={Math.floor(revenueRange / 6)} />
              <YAxis tick={{ fontSize: 11, fill: C.textMuted }} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v) => formatMoney(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="mrr" stroke="#4A7A68" strokeWidth={2} dot={false} name="MRR" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pending Payouts */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Pending Payouts</h3>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            Paid this month: <strong style={{ color: '#4A7A68' }}>{formatMoney(paidThisMonth)}</strong>
          </div>
        </div>
        {pendingRewards.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No pending payouts</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['User', 'Amount', 'Tier', 'Requested', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingRewards.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{r.profiles?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{r.profiles?.email}</div>
                  </td>
                  <td style={{ padding: '12px 8px', fontWeight: 700, color: '#4A7A68', fontSize: 15 }}>{formatMoney(r.amount)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#4A7A6820', color: '#4A7A68' }}>
                      {r.profiles?.tier || 'free_trial'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: C.textMuted }}>{formatDate(r.created_at)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approveReward(r.id, r.user_id, r.amount)} style={{ padding: '5px 12px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
                      <button onClick={() => rejectReward(r.id, r.user_id, r.amount)} style={{ padding: '5px 12px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Monthly P&L */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Monthly P&L (6 months)</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Month', 'Revenue', 'Rewards Paid', 'Net'].map(h => (
                <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyPL.map(row => (
              <tr key={row.month} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 8px', fontWeight: 600, color: C.text }}>{row.month}</td>
                <td style={{ padding: '10px 8px', color: '#4A7A68', fontWeight: 600 }}>{formatMoney(row.revenue)}</td>
                <td style={{ padding: '10px 8px', color: '#C96A52' }}>{formatMoney(row.rewards)}</td>
                <td style={{ padding: '10px 8px', fontWeight: 700, color: row.net >= 0 ? '#10B981' : '#EF4444' }}>{formatMoney(row.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, padding: '10px 14px', background: C.bg, borderRadius: 8, fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>
          Net = Subscription Revenue − Rewards Paid. Stripe fees not deducted.
        </div>
      </div>

      {/* Tremendous Section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tremendous Payouts</h3>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Eligible users: account ≥30 days old, not minor, fraud risk low/medium</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="https://app.tremendous.com" target="_blank" rel="noreferrer" style={{ padding: '7px 14px', background: '#1A1A2E', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Tremendous Dashboard →</a>
            <button onClick={fetchTremendousQueue} style={btnStyle(false)}>↻ Refresh</button>
          </div>
        </div>

        {!import.meta.env.VITE_TREMENDOUS_API_KEY && (
          <div style={{ padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#92400E' }}>
            ⚠️ Add <code>VITE_TREMENDOUS_API_KEY</code> and <code>VITE_TREMENDOUS_FUNDING_SOURCE_ID</code> to .env to enable live payouts.
          </div>
        )}

        {tqLoading ? <div style={{ color: C.textMuted, fontSize: 13 }}>Loading payout queue...</div> : tremendousQueue.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No pending payouts in queue</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['User', 'Email', 'Tier', 'Amount', 'Requested', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tremendousQueue.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: C.text }}>{r.profiles?.full_name || '—'}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted, fontSize: 12 }}>{r.profiles?.email}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#4A7A6820', color: '#4A7A68' }}>{r.profiles?.tier || 'free_trial'}</span>
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: '#4A7A68', fontSize: 15 }}>{formatMoney(r.amount)}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{formatDate(r.created_at)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approveTremendous(r)} style={{ padding: '5px 12px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✅ Approve</button>
                      <button onClick={() => rejectTremendous(r.id, r.user_id, r.amount)} style={{ padding: '5px 12px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✗ Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Manual reward issuance */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Manual Reward Issuance</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Search user by email</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="user@example.com" onKeyDown={e => e.key === 'Enter' && searchManualUser()}
                  style={{ flex: 1, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                <button onClick={searchManualUser} style={{ padding: '8px 12px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Find</button>
              </div>
            </div>
            {manualUser && (
              <>
                <div style={{ padding: '8px 12px', background: '#D1FAE5', borderRadius: 8, fontSize: 13, color: '#065F46' }}>
                  {manualUser.full_name || manualUser.email} · {manualUser.tier}
                </div>
                <div style={{ minWidth: 100 }}>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Amount ($)</label>
                  <input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="5.00"
                    style={{ width: '100%', padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Note (optional)</label>
                  <input value={manualNote} onChange={e => setManualNote(e.target.value)} placeholder="Competition prize, etc."
                    style={{ width: '100%', padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
                </div>
                <button onClick={issueManualTremendous} disabled={manualLoading || !manualAmount}
                  style={{ padding: '8px 14px', background: manualLoading || !manualAmount ? '#9CA3AF' : '#C9973A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: manualLoading || !manualAmount ? 'not-allowed' : 'pointer' }}>
                  {manualLoading ? 'Sending...' : 'Issue via Tremendous'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Payout history */}
        {payoutHistory.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Payout History</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['User', 'Amount', 'Paid', 'Tremendous Order ID'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payoutHistory.slice(0, 10).map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.text }}>{r.profiles?.full_name || r.profiles?.email || '—'}</td>
                    <td style={{ padding: '8px', color: '#4A7A68', fontWeight: 600 }}>{formatMoney(r.amount)}</td>
                    <td style={{ padding: '8px', color: C.textMuted }}>{formatDate(r.paid_at)}</td>
                    <td style={{ padding: '8px', color: C.textMuted, fontFamily: 'monospace', fontSize: 11 }}>{r.tremendous_order_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stripe link */}
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Stripe Dashboard</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>View subscription details, invoices, and payment history in Stripe</div>
        </div>
        <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" style={{ padding: '10px 18px', background: '#635BFF', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Open Stripe →
        </a>
      </div>
    </div>
  )
}
