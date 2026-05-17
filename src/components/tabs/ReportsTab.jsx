import React, { useState, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { getHabitLabel } from '../../config.js'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}
function formatMoney(n) { return '$' + Number(n || 0).toFixed(2) }

export default function ReportsTab({ theme, addToast, logAdminAction }) {
  const C = theme
  const [generatingReport, setGeneratingReport] = useState(null)
  const [reportData, setReportData] = useState(null)
  const [reportType, setReportType] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [reportHistory] = useState([])

  const generateReport = useCallback(async (type) => {
    setGeneratingReport(type)
    try {
      const now = new Date()
      let daysBack = type === 'Daily' ? 1 : type === 'Weekly' ? 7 : 30
      const since = new Date(now - daysBack * 86400000).toISOString()

      const [newSignupsRes, activeRes, habitsRes, successRes, rewardsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('daily_summaries').select('user_id', { count: 'exact', head: true }).gte('date', since.split('T')[0]),
        supabase.from('habit_logs').select('habit_key, points_earned').gte('created_at', since),
        supabase.from('daily_summaries').select('id', { count: 'exact', head: true }).gte('date', since.split('T')[0]).eq('is_successful', true),
        supabase.from('rewards').select('amount').eq('status', 'paid').gte('created_at', since)
      ])

      const habitCountMap = {}
      if (habitsRes.data) habitsRes.data.forEach(h => { habitCountMap[h.habit_key] = (habitCountMap[h.habit_key] || 0) + 1 })
      const topHabits = Object.entries(habitCountMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => ({ id: getHabitLabel(id), count }))
      const rewardsPaid = (rewardsRes.data || []).reduce((a, r) => a + (r.amount || 0), 0)

      setReportData({
        type, period: `Last ${daysBack} day${daysBack === 1 ? '' : 's'}`,
        generatedAt: new Date().toISOString(),
        newSignups: newSignupsRes.count || 0,
        activeUsers: activeRes.count || 0,
        habitsCompleted: habitsRes.data?.length || 0,
        successfulDays: successRes.count || 0,
        rewardsPaid,
        topHabits
      })
      setReportType(type)
      setShowPreview(true)
      logAdminAction('report_generated', { type })
    } catch (err) {
      addToast('Failed to generate report', 'error')
    } finally {
      setGeneratingReport(null)
    }
  }, [addToast, logAdminAction])

  const sendEmailReport = async () => {
    setSendingEmail(true)
    try {
      const recipients = import.meta.env.VITE_REPORT_RECIPIENTS
      await supabase.functions.invoke('send-admin-reply', {
        body: {
          to: recipients,
          subject: `Niyama ${reportData.type} Report — ${formatDate(reportData.generatedAt)}`,
          body: JSON.stringify(reportData, null, 2)
        }
      })
      addToast(`Report sent to ${recipients}`, 'success')
      logAdminAction('report_emailed', { type: reportData.type })
      setShowEmailModal(false)
    } catch {
      addToast('Failed to send report email', 'error')
    } finally {
      setSendingEmail(false)
    }
  }

  const downloadPDF = () => {
    if (!reportData) return
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Niyama ${reportData.type} Report</title>
          <style>
            body { font-family: Inter, sans-serif; padding: 32px; color: #1A1A1A; }
            h1 { color: #4A7A68; font-size: 24px; margin-bottom: 4px; }
            h2 { font-size: 16px; color: #6B7280; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { background: #F5F7F4; padding: 10px 14px; text-align: left; font-size: 12px; color: #6B7280; text-transform: uppercase; }
            td { padding: 12px 14px; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
            .value { font-size: 32px; font-weight: 700; color: #4A7A68; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Niyama ${reportData.type} Report</h1>
          <h2>Generated ${new Date(reportData.generatedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</h2>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>New Signups</td><td>${reportData.newSignups}</td></tr>
            <tr><td>Active Users</td><td>${reportData.activeUsers}</td></tr>
            <tr><td>Habits Completed</td><td>${reportData.habitsCompleted}</td></tr>
            <tr><td>Successful Days</td><td>${reportData.successfulDays}</td></tr>
            <tr><td>Rewards Paid</td><td>${formatMoney(reportData.rewardsPaid)}</td></tr>
          </table>
          <h3>Top 3 Habits</h3>
          <table>
            <tr><th>Habit</th><th>Completions</th></tr>
            ${reportData.topHabits.map(h => `<tr><td>${h.id}</td><td>${h.count}</td></tr>`).join('')}
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => { printWindow.focus(); printWindow.print() }, 500)
  }

  const downloadCSV = () => {
    if (!reportData) return
    const rows = [
      ['Metric', 'Value'],
      ['Report Type', reportData.type],
      ['Period', reportData.period],
      ['Generated At', reportData.generatedAt],
      ['New Signups', reportData.newSignups],
      ['Active Users', reportData.activeUsers],
      ['Habits Completed', reportData.habitsCompleted],
      ['Successful Days', reportData.successfulDays],
      ['Rewards Paid', formatMoney(reportData.rewardsPaid)]
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `niyama-${reportData.type.toLowerCase()}-report.csv`; a.click()
    URL.revokeObjectURL(url)
    addToast('CSV downloaded', 'success')
  }

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const btnStyle = { padding: '9px 16px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const secBtnStyle = { padding: '9px 16px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }

  const reportTypes = [
    { type: 'Daily', description: 'New signups, active users, habits completed, rewards paid — all for the last 24 hours.', schedule: 'Auto-generated at midnight UTC' },
    { type: 'Weekly', description: 'Weekly aggregate of all key metrics including top habits and successful day counts.', schedule: 'Auto-generated Monday 06:00 UTC' },
    { type: 'Monthly', description: '30-day performance summary. Includes cohort data, top users, and reward payout totals.', schedule: 'Auto-generated 1st of month 07:00 UTC' }
  ]

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Reports</h2>

      {/* Schedule info */}
      <div style={{ padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#1D4ED8' }}>
        📅 <strong>Auto-schedule:</strong> Daily: midnight UTC | Weekly: Monday 06:00 UTC | Monthly: 1st of month 07:00 UTC
      </div>

      {/* Report Type Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {reportTypes.map(rt => (
          <div key={rt.type} style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>{rt.type} Summary</div>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>{rt.description}</p>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, padding: '6px 10px', background: C.bg, borderRadius: 6 }}>🕐 {rt.schedule}</div>
            <button
              onClick={() => generateReport(rt.type)}
              disabled={generatingReport === rt.type}
              style={{ width: '100%', ...btnStyle, background: generatingReport === rt.type ? '#9CA3AF' : '#4A7A68', cursor: generatingReport === rt.type ? 'not-allowed' : 'pointer' }}
            >
              {generatingReport === rt.type ? 'Generating...' : 'Generate Now'}
            </button>
          </div>
        ))}
      </div>

      {/* Report Preview */}
      {showPreview && reportData && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: C.text }}>{reportData.type} Report Preview</h3>
              <div style={{ fontSize: 12, color: C.textMuted }}>{reportData.period} · Generated {new Date(reportData.generatedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={downloadPDF} style={secBtnStyle}>Download PDF</button>
              <button onClick={downloadCSV} style={secBtnStyle}>Download CSV</button>
              <button onClick={() => setShowEmailModal(true)} style={btnStyle}>Email Report</button>
              <button onClick={() => setShowPreview(false)} style={{ ...secBtnStyle, padding: '9px' }}>×</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'New Signups', value: reportData.newSignups },
              { label: 'Active Users', value: reportData.activeUsers },
              { label: 'Habits Completed', value: reportData.habitsCompleted },
              { label: 'Successful Days', value: reportData.successfulDays },
              { label: 'Rewards Paid', value: formatMoney(reportData.rewardsPaid) }
            ].map(metric => (
              <div key={metric.label} style={{ padding: '14px 16px', background: C.bg, borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#4A7A68' }}>{metric.value}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{metric.label}</div>
              </div>
            ))}
          </div>
          {reportData.topHabits.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>Top 3 Habits</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {reportData.topHabits.map((h, i) => (
                  <div key={h.id} style={{ flex: 1, padding: '12px', background: C.bg, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{h.count}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, textTransform: 'capitalize' }}>{h.id}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email Confirmation Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 14, padding: 28, maxWidth: 400, width: '90%' }}>
            <h3 style={{ margin: '0 0 10px', color: C.text }}>Email Report</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: C.textMuted }}>
              Send this {reportData?.type} report to: <strong>{import.meta.env.VITE_REPORT_RECIPIENTS || 'configured recipients'}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={sendEmailReport} disabled={sendingEmail} style={{ ...btnStyle, flex: 1, opacity: sendingEmail ? 0.6 : 1 }}>
                {sendingEmail ? 'Sending...' : 'Confirm Send'}
              </button>
              <button onClick={() => setShowEmailModal(false)} style={{ ...secBtnStyle, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Report History */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Report History</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Type', 'Date', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportHistory.map(rh => (
              <tr key={rh.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '12px', color: C.text, fontWeight: 600 }}>{rh.type}</td>
                <td style={{ padding: '12px', color: C.textMuted }}>{formatDate(rh.date)}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#D1FAE5', color: '#065F46' }}>{rh.status}</span>
                </td>
                <td style={{ padding: '12px' }}>
                  <button onClick={() => generateReport(rh.type)} style={{ padding: '4px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: 'pointer', color: C.text }}>
                    Regenerate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
