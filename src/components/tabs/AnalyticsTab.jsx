import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { supabase } from '../../supabase.js'
import { TIERS, ALL_HABITS } from '../../config.js'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
}

function HealthKitSection({ C, sectionStyle }) {
  const [hkData, setHkData] = useState(null)
  const [hkLoading, setHkLoading] = useState(true)
  const [consentRate, setConsentRate] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      setHkLoading(true)
      try {
        const [profilesRes, bioRes] = await Promise.all([
          supabase.from('profiles').select('id, tier, gender, age, date_of_birth, region'),
          supabase.from('biometrics').select('user_id, hrv, sleep_duration, step_count, rhr, date').order('date', { ascending: false }).limit(500)
        ])
        const profiles = profilesRes.data || []
        const bios = bioRes.data || []

        // healthkit_connected column does not exist — connection rate not available
        const tierRate = Object.keys(TIERS).map(tier => {
          const tierProfiles = profiles.filter(p => p.tier === tier)
          const label = TIERS[tier]?.name || tier
          return { tier: label, key: tier, rate: 0, total: tierProfiles.length }
        })

        // Avg HRV by age group
        const ageGroups = [
          { label: '18-24', min: 18, max: 24 }, { label: '25-34', min: 25, max: 34 },
          { label: '35-44', min: 35, max: 44 }, { label: '45-54', min: 45, max: 54 }, { label: '55+', min: 55, max: 99 }
        ]
        const today = new Date()
        const profileAgeMap = {}
        profiles.forEach(p => {
          // Use local-date parsing for DOB to avoid UTC shift
          const dob = p.date_of_birth ? new Date(p.date_of_birth + 'T00:00:00') : null
          const age = dob ? (today.getFullYear() - dob.getFullYear()) : (p.age || null)
          profileAgeMap[p.id] = age
        })
        const hrvByAge = ageGroups.map(ag => {
          const usersInAge = profiles.filter(p => { const a = profileAgeMap[p.id]; return a && a >= ag.min && a <= ag.max })
          const userIds = new Set(usersInAge.map(p => p.id))
          const ageBios = bios.filter(b => userIds.has(b.user_id) && b.hrv)
          const avgHrv = ageBios.length >= 3 ? Math.round(ageBios.reduce((a, b) => a + b.hrv, 0) / ageBios.length) : null
          return { group: ag.label, hrv: avgHrv, n: ageBios.length }
        })

        // Avg steps by tier — use key for matching
        const stepsByTier = tierRate.map(t => {
          const tierIds = new Set(profiles.filter(p => p.tier === t.key).map(p => p.id))
          const tierBios = bios.filter(b => tierIds.has(b.user_id) && b.step_count)
          const avgSteps = tierBios.length >= 3 ? Math.round(tierBios.reduce((a, b) => a + b.step_count, 0) / tierBios.length) : null
          return { tier: t.tier, steps: avgSteps, n: tierBios.length }
        })

        // RHR trend (30-day)
        const rhrMap = {}
        bios.filter(b => b.rhr).forEach(b => {
          if (!rhrMap[b.date]) rhrMap[b.date] = []
          rhrMap[b.date].push(b.rhr)
        })
        const rhrTrend = Object.entries(rhrMap).slice(-30).map(([date, vals]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }),
          rhr: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        }))

        setHkData({ connected: 0, total: profiles.length, connRate: 0, tierRate, hrvByAge, stepsByTier, rhrTrend })

        // Research consent opt-in rate
        try {
          const { data: consentData, error: consentErr } = await supabase.from('profiles').select('research_consent')
          if (!consentErr && consentData) {
            const known = consentData.filter(p => p.research_consent != null)
            const opted = known.filter(p => p.research_consent === true).length
            setConsentRate(known.length > 0 ? { opted, total: known.length, rate: Math.round((opted / known.length) * 100) } : { opted: 0, total: 0, rate: 0 })
          }
        } catch { /* column not in schema yet */ }
      } catch (err) {
        console.error(err)
        setHkData(null)
      } finally {
        setHkLoading(false)
      }
    }
    fetch()
  }, [])

  const TIER_COLORS = { 'Free Trial': '#6B7280', 'Free (Expired)': '#9CA3AF', Basic: '#3B82F6', Plus: '#4A7A68', Premium: '#C9973A' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>🍎 HealthKit Analytics</h3>
        <span style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>Population-level, anonymised</span>
      </div>

      {hkLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading HealthKit data...</div>
      ) : !hkData ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍎</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No HealthKit data available</div>
          <div style={{ fontSize: 13 }}>Data appears in the biometrics table once users connect Apple Health</div>
        </div>
      ) : (
        <>
          {/* Research consent */}
          <div style={{ ...sectionStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>🔬 Research Consent Opt-in</div>
            {consentRate == null ? (
              <div style={{ fontSize: 13, color: C.textMuted }}>Column not yet in schema</div>
            ) : consentRate.total === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted }}>No consent data recorded</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: consentRate.rate >= 50 ? '#4A7A68' : '#C96A52' }}>{consentRate.rate}%</span>
                <span style={{ fontSize: 13, color: C.textMuted }}>{consentRate.opted} of {consentRate.total} users opted in</span>
              </div>
            )}
          </div>

          {/* HealthKit connection */}
          <div style={{ padding: '12px 16px', background: '#FEF3C7', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
            ⚠️ <strong>healthkit_connected</strong> column not in schema. Connection rate unavailable. Data below is from the <code>biometrics</code> table.
          </div>

          {/* HRV by age + Steps by tier */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ ...sectionStyle, marginBottom: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Avg HRV by Age Group (ms)</div>
              {hkData.hrvByAge.some(d => d.hrv !== null && d.n >= 3) ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={hkData.hrvByAge.filter(d => d.hrv !== null && d.n >= 3)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="group" tick={{ fontSize: 11, fill: C.textMuted }} />
                    <YAxis tick={{ fontSize: 11, fill: C.textMuted }} />
                    <Tooltip formatter={v => [`${v} ms`, 'Avg HRV']} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
                    <Bar dataKey="hrv" fill="#4A7A68" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Insufficient data — need ≥3 users per age group with HRV data</div>
              )}
            </div>

            <div style={{ ...sectionStyle, marginBottom: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Avg Daily Steps by Tier</div>
              {hkData.stepsByTier.some(d => d.steps !== null && d.n >= 3) ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={hkData.stepsByTier.filter(d => d.steps !== null && d.n >= 3)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="tier" tick={{ fontSize: 11, fill: C.textMuted }} />
                    <YAxis tick={{ fontSize: 11, fill: C.textMuted }} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                    <Tooltip formatter={v => [v.toLocaleString(), 'Avg Steps']} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
                    <Bar dataKey="steps" radius={[4, 4, 0, 0]}>
                      {hkData.stepsByTier.map((t, i) => <Cell key={i} fill={TIER_COLORS[t.tier] || '#6B7280'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Insufficient data — need ≥3 users per tier with step data</div>
              )}
            </div>
          </div>

          {/* RHR trend */}
          {hkData.rhrTrend.length > 0 && (
            <div style={sectionStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Population Resting Heart Rate Trend (30 days)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={hkData.rhrTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.textMuted }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: C.textMuted }} unit=" bpm" domain={['auto', 'auto']} />
                  <Tooltip formatter={v => [`${v} bpm`, 'Avg RHR']} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
                  <Line type="monotone" dataKey="rhr" stroke="#C96A52" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function AnalyticsTab({ theme, addToast }) {
  const C = theme
  const [habitData, setHabitData] = useState([])
  const [dauData, setDauData] = useState([])
  const [funnel, setFunnel] = useState({ signups: 0, onboarded: 0, firstHabit: 0, retained7d: 0 })
  const [moodData, setMoodData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const thirtyAgoDate = thirtyAgo.split('T')[0]
      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const [habitRes, eventsRes, profilesRes, moodRes] = await Promise.all([
        supabase.from('habit_logs').select('habit_key').gte('logged_at', thirtyAgo).eq('completed', true),
        supabase.from('app_events').select('created_at, event_type').gte('created_at', thirtyAgo).order('created_at'),
        supabase.from('profiles').select('id, created_at, onboarding_complete').gte('created_at', thirtyAgo),
        supabase.from('daily_summaries').select('mood').gte('date', thirtyAgoDate).not('mood', 'is', null)
      ])

      // Habit completion count — ALL_HABITS uses correct DB keys (wake, sleep, steps)
      const habitCountMap = {}
      if (habitRes.data) habitRes.data.forEach(h => { habitCountMap[h.habit_key] = (habitCountMap[h.habit_key] || 0) + 1 })
      const habitChart = ALL_HABITS.map(h => ({ name: h.name, count: habitCountMap[h.id] || 0 })).sort((a, b) => b.count - a.count)
      setHabitData(habitChart)

      // Daily event count from app_events (not distinct users — events are not joined to user_id here)
      const dauMap = {}
      if (eventsRes.data) {
        eventsRes.data.forEach(e => {
          const date = e.created_at?.split('T')[0]
          if (date) dauMap[date] = (dauMap[date] || 0) + 1
        })
      }
      const dauArr = []
      for (let i = 29; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i)
        const key = dt.toISOString().split('T')[0]
        dauArr.push({ date: formatDate(key), events: dauMap[key] || 0 })
      }
      setDauData(dauArr)

      // Funnel — use real counts only, no fake fallbacks
      const profiles = profilesRes.data || []
      const signups = profiles.length
      const onboarded = profiles.filter(p => p.onboarding_complete).length
      const profileIds = profiles.map(p => p.id)
      let habitLoggers = 0
      let retained = 0
      if (profileIds.length > 0) {
        const { count: hlCount } = await supabase.from('habit_logs').select('user_id', { count: 'exact', head: true }).in('user_id', profileIds)
        const { count: retCount } = await supabase.from('app_events').select('user_id', { count: 'exact', head: true }).in('user_id', profileIds).gte('created_at', sevenAgo)
        habitLoggers = hlCount || 0
        retained = retCount || 0
      }
      setFunnel({ signups, onboarded, firstHabit: habitLoggers, retained7d: retained })

      // Mood distribution — daily_summaries.mood (int 1-5)
      const MOOD_LABELS = { 1: '😞 Terrible', 2: '😕 Bad', 3: '😐 Neutral', 4: '🙂 Good', 5: '😄 Great' }
      const moodCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      if (moodRes.data) moodRes.data.forEach(r => { if (r.mood >= 1 && r.mood <= 5) moodCount[r.mood]++ })
      setMoodData(Object.entries(moodCount).map(([k, v]) => ({ label: MOOD_LABELS[k], value: v, key: Number(k) })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }

  const funnelSteps = [
    { label: 'Total Signups', value: funnel.signups, pct: 100 },
    { label: 'Completed Onboarding', value: funnel.onboarded, pct: funnel.signups ? Math.round((funnel.onboarded / funnel.signups) * 100) : 0 },
    { label: 'First Habit Logged', value: funnel.firstHabit, pct: funnel.signups ? Math.round((funnel.firstHabit / funnel.signups) * 100) : 0 },
    { label: '7-Day Retained', value: funnel.retained7d, pct: funnel.signups ? Math.round((funnel.retained7d / funnel.signups) * 100) : 0 }
  ]

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Analytics</h2>

      {/* GA4 placeholder — live data requires GA4 analytics-proxy Edge Function */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Google Analytics 4</h3>
          <span style={{ padding: '4px 10px', background: '#F3F4F6', color: '#6B7280', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Not Connected</span>
        </div>
        <div style={{ padding: '14px 16px', background: '#EFF6FF', borderRadius: 8, fontSize: 13, color: '#1D4ED8', marginBottom: 16 }}>
          ℹ️ Live GA4 data requires a <strong>ga4-analytics-proxy</strong> Supabase Edge Function. Once deployed, replace this section with real API results.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Sessions (week)', url: 'https://analytics.google.com' },
            { label: 'Users (week)', url: 'https://analytics.google.com' },
            { label: 'Avg Session Duration', url: 'https://analytics.google.com' },
            { label: 'Bounce Rate', url: 'https://analytics.google.com' }
          ].map(kpi => (
            <div key={kpi.label} style={{ flex: 1, minWidth: 100, padding: '14px 16px', background: C.bg, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.textMuted }}>—</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* External analytics links */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Google Analytics 4', url: 'https://analytics.google.com' },
          { label: 'Vercel Analytics', url: 'https://vercel.com/dashboard' },
          { label: 'PostHog', url: 'https://app.posthog.com' },
          { label: 'Mixpanel', url: 'https://mixpanel.com' }
        ].map(tool => (
          <a key={tool.label} href={tool.url} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{tool.label}</span>
            <span style={{ fontSize: 14, color: C.textMuted }}>→</span>
          </a>
        ))}
      </div>

      {/* In-App: Most completed habits */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Most Completed Habits (30 days)</h3>
        {loading ? <div style={{ color: C.textMuted, fontSize: 13 }}>Loading...</div> : habitData.every(h => h.count === 0) ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>No habit data in the last 30 days</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={habitData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.textMuted }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} width={130} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
              <Bar dataKey="count" fill="#4A7A68" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily App Events */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>Daily App Events (30 days)</h3>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Total events from app_events table (login, habit_complete, reward_request, etc.)</div>
        {loading ? <div style={{ color: C.textMuted, fontSize: 13 }}>Loading...</div> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dauData}>
              <defs>
                <linearGradient id="eventsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C9973A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#C9973A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.textMuted }} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: C.textMuted }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 12 }} />
              <Area type="monotone" dataKey="events" stroke="#C9973A" fill="url(#eventsGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Signup Funnel */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>Signup Funnel (30 days)</h3>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>New signups in the last 30 days — real counts only, no estimates</div>
        {funnel.signups === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>No new signups in the last 30 days</div>
        ) : (
          <div style={{ display: 'flex', gap: 0 }}>
            {funnelSteps.map((step, i) => (
              <div key={step.label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                <div style={{
                  height: Math.max(40, step.pct * 1.6),
                  background: `rgba(74, 122, 104, ${0.3 + (step.pct / 100) * 0.7})`,
                  borderRadius: i === 0 ? '8px 0 0 8px' : i === funnelSteps.length - 1 ? '0 8px 8px 0' : '0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{step.pct}%</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.text }}>{step.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{step.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mood Distribution (last 30 days) */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>Mood Distribution (30 days)</h3>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Based on <code>daily_summaries.mood</code> — integer 1 (Terrible) to 5 (Great)</div>
        {loading ? <div style={{ color: C.textMuted, fontSize: 13 }}>Loading...</div>
          : moodData.every(d => d.value === 0) ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>No mood data recorded in the last 30 days</div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              {moodData.map((d, i) => {
                const MOOD_COLORS = ['#EF4444', '#F97316', '#EAB308', '#4A7A68', '#10B981']
                const total = moodData.reduce((a, x) => a + x.value, 0)
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
                return (
                  <div key={d.key} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 }}>
                      <div style={{ width: '60%', background: MOOD_COLORS[i], borderRadius: '4px 4px 0 0', height: `${Math.max(pct, 4)}%`, minHeight: d.value > 0 ? 8 : 0, transition: 'height 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: MOOD_COLORS[i] }}>{pct}%</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>({d.value})</div>
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {/* HealthKit Analytics */}
      <div style={{ ...sectionStyle }}>
        <HealthKitSection C={C} sectionStyle={sectionStyle} />
      </div>
    </div>
  )
}
