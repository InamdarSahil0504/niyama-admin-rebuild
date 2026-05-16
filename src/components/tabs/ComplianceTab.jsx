import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { ConfirmDialog } from '../shared/ConfirmDialog.jsx'
import { getHabitLabel } from '../../config.js'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

export default function ComplianceTab({ theme, addToast, logAdminAction }) {
  const C = theme
  const [minors, setMinors] = useState([])
  const [gdprEmail, setGdprEmail] = useState('')
  const [gdprReason, setGdprReason] = useState('')
  const [showGdprConfirm, setShowGdprConfirm] = useState(false)
  const [complianceRequests, setComplianceRequests] = useState([])
  const [exportEmail, setExportEmail] = useState('')
  const [photoFilter, setPhotoFilter] = useState('pending')
  const [photos, setPhotos] = useState([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [consentLogs, setConsentLogs] = useState([])
  const [flagReason, setFlagReason] = useState('')
  const [flaggingPhoto, setFlaggingPhoto] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const [minorsRes, requestsRes, consentRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, tier, created_at, age, date_of_birth').eq('is_minor', true),
        supabase.from('compliance_requests').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('app_events').select('id, user_id, created_at, metadata, profiles(full_name, email)').eq('event_type', 'consent_given').order('created_at', { ascending: false }).limit(20)
      ])
      setMinors(minorsRes.data || [])
      setComplianceRequests(requestsRes.data || [])
      setConsentLogs(consentRes.data || [])
    } catch (err) { console.error(err) }
  }, [])

  const fetchPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      let query = supabase.from('habit_logs').select('id, user_id, habit_key, photo_url, photo_reviewed, photo_approved, created_at, profiles(full_name, email)').not('photo_url', 'is', null).order('created_at', { ascending: false }).limit(50)
      if (photoFilter === 'pending') query = query.eq('photo_reviewed', false)
      else if (photoFilter === 'approved') query = query.eq('photo_approved', true)
      else if (photoFilter === 'flagged') query = query.eq('photo_approved', false).eq('photo_reviewed', true)
      const { data } = await query
      setPhotos(data || [])
    } catch { setPhotos([]) }
    finally { setPhotosLoading(false) }
  }, [photoFilter])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchPhotos() }, [fetchPhotos])

  const approvePhoto = async (id) => {
    try {
      await supabase.from('habit_logs').update({ photo_reviewed: true, photo_approved: true }).eq('id', id)
      setPhotos(prev => prev.filter(p => p.id !== id))
      addToast('Photo approved', 'success')
      logAdminAction('photo_approved', { habitLogId: id })
    } catch { addToast('Failed to approve', 'error') }
  }

  const flagPhoto = async (id, reason) => {
    try {
      await supabase.from('habit_logs').update({ photo_reviewed: true, photo_approved: false, flag_reason: reason }).eq('id', id)
      setPhotos(prev => prev.filter(p => p.id !== id))
      addToast('Photo flagged', 'warning')
      logAdminAction('photo_flagged', { habitLogId: id, reason })
      setFlaggingPhoto(null); setFlagReason('')
    } catch { addToast('Failed to flag', 'error') }
  }

  const submitGdprDeletion = async () => {
    try {
      await supabase.from('admin_notes').insert({
        note: `GDPR deletion requested for ${gdprEmail}. Reason: ${gdprReason}`,
        type: 'gdpr_deletion',
        created_at: new Date().toISOString(),
        admin: import.meta.env.VITE_ADMIN_EMAIL
      })
      addToast('GDPR deletion request logged', 'success')
      logAdminAction('gdpr_request', { email: gdprEmail })
      setGdprEmail(''); setGdprReason('')
    } catch { addToast('Failed to log GDPR request', 'error') }
  }

  const exportUserData = async () => {
    if (!exportEmail) { addToast('Enter an email address', 'warning'); return }
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('email', exportEmail).single()
      if (!profile) { addToast('User not found', 'error'); return }
      const [habitsRes, summariesRes, rewardsRes, messagesRes] = await Promise.all([
        supabase.from('habit_logs').select('*').eq('user_id', profile.id),
        supabase.from('daily_summaries').select('*').eq('user_id', profile.id),
        supabase.from('rewards').select('*').eq('user_id', profile.id),
        supabase.from('contact_messages').select('*').eq('user_id', profile.id)
      ])
      const exportData = {
        profile,
        is_minor: profile.is_minor || false,
        minor_data_notice: profile.is_minor ? 'This user is a minor. Handle data under COPPA/GDPR-K. Do not share without legal review.' : undefined,
        habit_logs: habitsRes.data || [],
        daily_summaries: summariesRes.data || [],
        rewards: profile.is_minor ? '⛔ HIDDEN — Minor user, no reward data exported' : (rewardsRes.data || []),
        messages: messagesRes.data || [],
        exported_at: new Date().toISOString()
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `user_export_${exportEmail}.json`; a.click()
      URL.revokeObjectURL(url)
      addToast('Data exported', 'success')
      logAdminAction('data_export', { email: exportEmail })
    } catch { addToast('Export failed', 'error') }
  }

  const markCompliant = async (id) => {
    try {
      await supabase.from('compliance_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
      setComplianceRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'completed' } : r))
      addToast('Marked as complete', 'success')
    } catch { addToast('Failed', 'error') }
  }

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const inputStyle = { padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: C.text }}>Compliance</h2>

      {/* Minor Users — prominent, at top */}
      <div style={{ ...sectionStyle, border: `2px solid ${minors.length > 0 ? '#F59E0B' : C.border}`, background: minors.length > 0 ? '#FFFBEB' : C.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: minors.length > 0 ? '#92400E' : C.text }}>⚠ Minor Users</h3>
            <span style={{ minWidth: 28, height: 28, borderRadius: 14, background: minors.length > 0 ? '#F59E0B' : C.border, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
              {minors.length}
            </span>
          </div>
          {minors.length > 0 && (
            <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>COPPA · GDPR-K · Rewards Blocked</div>
          )}
        </div>
        {minors.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0' }}>No minor users registered</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Name', 'Email', 'Tier', 'Joined', 'Age', 'Reward Block'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {minors.map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: C.text }}>{m.full_name || 'Unknown'}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{m.email}</td>
                  <td style={{ padding: '10px 8px', color: C.text }}>{m.tier || 'free'}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{formatDate(m.created_at)}</td>
                  <td style={{ padding: '10px 8px', color: C.text }}>{m.age || (m.date_of_birth ? new Date().getFullYear() - new Date(m.date_of_birth).getFullYear() : '—')}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#FEE2E2', color: '#EF4444' }}>BLOCKED</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Photo Submissions Review */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Photo Submissions Review</h3>
          <div style={{ padding: '6px 12px', background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: '#EF4444', fontWeight: 700 }}>
            CRITICAL — Review Required
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['all', 'pending', 'approved', 'flagged'].map(f => (
            <button key={f} onClick={() => setPhotoFilter(f)} style={{ padding: '6px 14px', background: photoFilter === f ? '#4A7A68' : C.bg, color: photoFilter === f ? '#fff' : C.text, border: `1px solid ${photoFilter === f ? '#4A7A68' : C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
        {photosLoading ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>Loading photos...</div>
        ) : photos.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {photoFilter === 'pending' ? '✅ No photos pending review' : 'No photos found'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ background: C.bg, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <div style={{ position: 'relative' }}>
                  <img src={photo.photo_url} alt="habit" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                  {photo.photo_reviewed && (
                    <div style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: photo.photo_approved ? '#D1FAE5' : '#FEE2E2', color: photo.photo_approved ? '#065F46' : '#EF4444' }}>
                      {photo.photo_approved ? '✓ Approved' : '⚠ Flagged'}
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{getHabitLabel(photo.habit_key)}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                    {photo.profiles?.full_name || 'Unknown'} · {formatDate(photo.created_at)}
                  </div>
                  {!photo.photo_reviewed && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approvePhoto(photo.id)} style={{ flex: 1, padding: '6px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                      <button onClick={() => setFlaggingPhoto(photo.id)} style={{ flex: 1, padding: '6px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Flag</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Flag reason dialog */}
        {flaggingPhoto && (
          <div style={{ marginTop: 14, padding: 16, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EF4444', marginBottom: 8 }}>Flag Reason</div>
            <input value={flagReason} onChange={e => setFlagReason(e.target.value)} placeholder="Reason for flagging..." style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => flagPhoto(flaggingPhoto, flagReason)} style={{ padding: '7px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Flag Photo</button>
              <button onClick={() => { setFlaggingPhoto(null); setFlagReason('') }} style={{ padding: '7px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* GDPR Deletion */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>GDPR Deletion Request</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>User Email</label>
              <input value={gdprEmail} onChange={e => setGdprEmail(e.target.value)} placeholder="user@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>Reason</label>
              <textarea value={gdprReason} onChange={e => setGdprReason(e.target.value)} placeholder="Reason for deletion request..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <button onClick={() => setShowGdprConfirm(true)} disabled={!gdprEmail} style={{ padding: '10px', background: gdprEmail ? '#EF4444' : '#9CA3AF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: gdprEmail ? 'pointer' : 'not-allowed' }}>
              Submit GDPR Request
            </button>
          </div>
          <ConfirmDialog
            isOpen={showGdprConfirm}
            onClose={() => setShowGdprConfirm(false)}
            onConfirm={submitGdprDeletion}
            title="Submit GDPR Deletion Request?"
            message={`This will log a deletion request for ${gdprEmail}. The data will need to be manually deleted from all systems.`}
            confirmText="Submit Request"
          />
        </div>

        {/* Data Export */}
        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>User Data Export</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.textMuted }}>Export all data for a user as a JSON file (profiles, habits, summaries, rewards, messages).</p>
          <div>
            <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, display: 'block' }}>User Email</label>
            <input value={exportEmail} onChange={e => setExportEmail(e.target.value)} placeholder="user@example.com" style={{ ...inputStyle, marginBottom: 10 }} />
          </div>
          <button onClick={exportUserData} disabled={!exportEmail} style={{ width: '100%', padding: '10px', background: exportEmail ? '#4A7A68' : '#9CA3AF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exportEmail ? 'pointer' : 'not-allowed' }}>
            Export User Data (JSON)
          </button>
        </div>
      </div>

      {/* Pending Compliance Requests */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Pending Compliance Requests</h3>
        {complianceRequests.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0' }}>No pending compliance requests</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Request Type', 'User', 'Date', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {complianceRequests.map(req => (
                <tr key={req.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#3B82F6' }}>{req.request_type || 'gdpr'}</span>
                  </td>
                  <td style={{ padding: '10px 8px', color: C.text }}>{req.user_email || req.user_id?.slice(0, 12) || '—'}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{formatDate(req.created_at)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: req.status === 'completed' ? '#D1FAE5' : '#FEF3C7', color: req.status === 'completed' ? '#065F46' : '#92400E' }}>
                      {req.status || 'pending'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    {req.status !== 'completed' && (
                      <button onClick={() => markCompliant(req.id)} style={{ padding: '5px 12px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark Complete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Consent Log */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Consent Log</h3>
        {consentLogs.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0' }}>No consent events recorded</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'User', 'Email', 'Consent Type'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consentLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{formatDate(log.created_at)}</td>
                  <td style={{ padding: '10px 8px', color: C.text }}>{log.profiles?.full_name || '—'}</td>
                  <td style={{ padding: '10px 8px', color: C.textMuted }}>{log.profiles?.email || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#D1FAE5', color: '#065F46' }}>
                      {log.metadata?.consent_type || 'terms_of_service'}
                    </span>
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
