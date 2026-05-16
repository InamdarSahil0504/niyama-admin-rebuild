import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { TierBadge } from '../shared/TierBadge.jsx'
import { StatusDot } from '../shared/StatusDot.jsx'
import { UserDetailView } from '../shared/UserDetailView.jsx'
import { TableSkeleton } from '../shared/LoadingSkeleton.jsx'
import { TIERS } from '../../config.js'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

function daysSince(d) {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d)) / 86400000)
  return days
}

// Derive a display status from the actual schema columns
function deriveStatus(u) {
  if (u.deleted) return 'churned'
  if (u.pause_active) return 'inactive'
  const s = u.subscription_status
  if (!s || s === 'active' || s === 'trialing') return 'active'
  if (s === 'canceled' || s === 'past_due' || s === 'unpaid') return 'churned'
  return 'inactive'
}

export default function UsersTab({ theme, addToast, onSelectUser, logAdminAction }) {
  const C = theme
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [sortCol, setSortCol] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  // healthkit_connected does not exist in profiles schema — filter omitted
  const [selected, setSelected] = useState(new Set())
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [bulkTier, setBulkTier] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const PER_PAGE = 25

  const fetchUsers = useCallback(async () => {
    setPage(1)
    setLoading(true)
    try {
      // Columns use real profiles schema names (verified against DB)
      let query = supabase.from('profiles').select(
        'id, full_name, email, tier, subscription_status, pause_active, deleted, gender, created_at, last_active_date, monthly_points, successful_days, is_minor, research_consent',
        { count: 'exact' }
      )
      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
      if (tierFilter !== 'all') query = query.eq('tier', tierFilter)
      if (statusFilter === 'active') query = query.eq('deleted', false).eq('pause_active', false).in('subscription_status', ['active', 'trialing'])
      else if (statusFilter === 'inactive') query = query.eq('pause_active', true)
      else if (statusFilter === 'churned') query = query.eq('deleted', true)
      if (genderFilter !== 'all') query = query.eq('gender', genderFilter)
      // Map sortCol UI keys to real DB column names
      const sortColDB = sortCol === 'monthly_points' ? 'monthly_points'
        : sortCol === 'successful_days' ? 'successful_days'
        : sortCol === 'last_active_date' ? 'last_active_date'
        : sortCol
      query = query.order(sortColDB, { ascending: sortDir === 'asc' })
      query = query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
      const { data, count, error } = await query
      if (error) throw error
      // research_consent column may not exist yet — handle gracefully (all undefined shows as —)
      setUsers(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      console.error('[UsersTab] Supabase error:', err?.message || err?.code || err)
      addToast(`Failed to load users: ${err?.message || 'unknown error'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [search, tierFilter, statusFilter, genderFilter, sortCol, sortDir, page, addToast])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set())
    else setSelected(new Set(users.map(u => u.id)))
  }

  const exportCSV = () => {
    const selectedUsers = users.filter(u => selected.has(u.id))
    const headers = ['Name', 'Email', 'Tier', 'Status', 'Points', 'Successful Days', 'Last Active', 'Joined', 'IsMinor', 'MinorDataNote', 'ResearchConsent']
    const rows = selectedUsers.map(u => [
      u.full_name || '', u.email || '', u.tier || '', deriveStatus(u),
      u.is_minor ? 'HIDDEN' : (u.monthly_points || 0),
      u.successful_days || 0,
      formatDate(u.last_active_date), formatDate(u.created_at),
      u.is_minor ? 'true' : 'false',
      u.is_minor ? 'Handle under COPPA/GDPR-K' : '',
      u.research_consent === true ? 'true' : u.research_consent === false ? 'false' : ''
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'users.csv'; a.click()
    URL.revokeObjectURL(url)
    addToast(`Exported ${selectedUsers.length} users`, 'success')
    logAdminAction('export_csv', { count: selectedUsers.length })
  }

  const bulkChangeTier = async () => {
    if (!bulkTier) return
    try {
      const ids = Array.from(selected)
      await supabase.from('profiles').update({ tier: bulkTier }).in('id', ids)
      fetchUsers()
      addToast(`Updated ${ids.length} users to ${TIERS[bulkTier]?.name}`, 'success')
      logAdminAction('bulk_tier_change', { count: ids.length, newTier: bulkTier })
      setSelected(new Set())
    } catch { addToast('Bulk tier change failed', 'error') }
  }

  const totalPages = Math.ceil(totalCount / PER_PAGE)

  const SortArrow = ({ col }) => {
    if (sortCol !== col) return <span style={{ color: C.border, marginLeft: 4 }}>↕</span>
    return <span style={{ color: '#4A7A68', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const cols = [
    { key: 'full_name', label: 'Name / Email' },
    { key: 'tier', label: 'Tier' },
    { key: '_status', label: 'Status', sortable: false },
    { key: 'monthly_points', label: 'Points' },
    { key: 'successful_days', label: 'Success Days' },
    { key: 'last_active_date', label: 'Last Active' },
    { key: 'created_at', label: 'Joined' },
    { key: 'research_consent', label: 'Research', sortable: false },
  ]

  const inputStyle = { padding: '9px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.card, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Users</h2>
        <div style={{ fontSize: 13, color: C.textMuted }}>{totalCount.toLocaleString()} total users</div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search name or email..." style={{ ...inputStyle, minWidth: 220 }} />
        <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Tiers</option>
          {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="churned">Churned</option>
        </select>
        <select value={genderFilter} onChange={e => { setGenderFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        {/* HealthKit filter removed — healthkit_connected column not in profiles schema */}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: '#EFF6FF', borderRadius: 10, marginBottom: 14, border: '1px solid #BFDBFE' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{selected.size} selected</span>
          <select value={bulkTier} onChange={e => setBulkTier(e.target.value)} style={{ ...selectStyle, background: '#fff' }}>
            <option value="">Change Tier...</option>
            {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          {bulkTier && <button onClick={bulkChangeTier} style={{ padding: '8px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>}
          <button onClick={exportCSV} style={{ padding: '8px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>Export CSV</button>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13 }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '12px 14px', width: 36 }}>
                  <input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                {cols.map(col => (
                  <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)} style={{ padding: '12px 14px', textAlign: 'left', cursor: col.sortable !== false ? 'pointer' : 'default', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                    {col.label}{col.sortable !== false && <SortArrow col={col.key} />}
                  </th>
                ))}
                <th style={{ padding: '12px 14px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols.length + 2} style={{ padding: 16 }}><TableSkeleton rows={8} /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={cols.length + 2} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No users found matching your filters</td></tr>
              ) : users.map(u => {
                const inactiveDays = daysSince(u.last_active_date)
                const minorBg = '#FFFBEB'
                return (
                  <tr
                    key={u.id}
                    onClick={() => { setSelectedUser(u); onSelectUser && onSelectUser(u) }}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.15s', background: u.is_minor ? minorBg : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = u.is_minor ? '#FEF3C7' : C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = u.is_minor ? minorBg : 'transparent'}
                  >
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#4A7A68', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                          {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: C.text }}>{u.full_name || '—'}</div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>{u.email}</div>
                        </div>
                        {u.is_minor && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700, border: '1px solid #F59E0B' }}>⚠ MINOR</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}><TierBadge tier={u.tier} /></td>
                    <td style={{ padding: '12px 14px' }}><StatusDot status={deriveStatus(u)} showLabel /></td>
                    <td style={{ padding: '12px 14px', color: C.text }}>{(u.monthly_points || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', color: C.text }}>{u.successful_days || 0}</td>
                    <td style={{ padding: '12px 14px', color: typeof inactiveDays === 'number' && inactiveDays > 14 ? '#EF4444' : C.textMuted }}>
                      {typeof inactiveDays === 'number' ? `${inactiveDays}d ago` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.textMuted }}>{formatDate(u.created_at)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {u.research_consent === true
                        ? <span title="Research consent given" style={{ fontSize: 16, color: '#10B981' }}>🔬</span>
                        : <span style={{ color: C.border, fontSize: 14 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.textMuted }}>›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <span style={{ fontSize: 13, color: C.textMuted }}>
            Showing {Math.min((page - 1) * PER_PAGE + 1, totalCount)}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? C.textMuted : C.text }}>← Prev</button>
            <span style={{ padding: '6px 10px', fontSize: 13, color: C.text }}>Page {page} of {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: page >= totalPages ? C.textMuted : C.text }}>Next →</button>
          </div>
        </div>
      </div>

      <UserDetailView
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        onUserUpdated={fetchUsers}
        theme={C}
        addToast={addToast}
        logAdminAction={logAdminAction}
      />
    </div>
  )
}
