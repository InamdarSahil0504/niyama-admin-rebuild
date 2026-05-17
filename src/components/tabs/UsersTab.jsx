import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { TierBadge } from '../shared/TierBadge.jsx'
import { StatusDot } from '../shared/StatusDot.jsx'
import { UserDetailView } from '../shared/UserDetailView.jsx'
import { TableSkeleton } from '../shared/LoadingSkeleton.jsx'
import { TIERS } from '../../config.js'

function formatDate(d) {
  if (!d) return '—'
  // Date-only strings parsed as local midnight to avoid UTC shift
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

function daysSince(d) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d + 'T00:00:00')) / 86400000)
}

// Derive status using last_active_date (active = within 7 days), pause_active, deleted
function deriveStatus(u) {
  if (u.deleted) return 'deleted'
  if (u.pause_active) return 'paused'
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (u.last_active_date && u.last_active_date >= sevenAgo) return 'active'
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
  const [selected, setSelected] = useState(new Set())
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [bulkTier, setBulkTier] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const PER_PAGE = 25

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const sevenAgoDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

      let query = supabase.from('profiles').select(
        'id, full_name, email, tier, subscription_status, pause_active, deleted, gender, created_at, last_active_date, monthly_points, successful_days, is_minor, research_consent',
        { count: 'exact' }
      )

      // Search — DB level
      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)

      // Tier filter
      if (tierFilter !== 'all') query = query.eq('tier', tierFilter)

      // Gender filter
      if (genderFilter !== 'all') query = query.eq('gender', genderFilter)

      // Status filter using actual schema columns + last_active_date
      if (statusFilter === 'active') {
        // Active = not deleted, not paused, last_active_date within 7 days
        query = query
          .eq('deleted', false)
          .eq('pause_active', false)
          .gte('last_active_date', sevenAgoDate)
      } else if (statusFilter === 'inactive') {
        // Inactive = not deleted, not paused, last_active_date older than 7 days (or null)
        query = query
          .eq('deleted', false)
          .eq('pause_active', false)
          .or(`last_active_date.lt.${sevenAgoDate},last_active_date.is.null`)
      } else if (statusFilter === 'paused') {
        query = query.eq('pause_active', true)
      } else if (statusFilter === 'deleted') {
        query = query.eq('deleted', true)
      }

      // Sort
      const sortColDB = {
        monthly_points: 'monthly_points',
        successful_days: 'successful_days',
        last_active_date: 'last_active_date',
        created_at: 'created_at',
        full_name: 'full_name',
        tier: 'tier'
      }[sortCol] || sortCol
      query = query.order(sortColDB, { ascending: sortDir === 'asc' })
      query = query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

      const { data, count, error } = await query
      if (error) throw error
      setUsers(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      console.error('[UsersTab] error:', err?.message || err)
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
    const headers = ['Name', 'Email', 'Tier', 'Status', 'Points', 'Successful Days', 'Last Active', 'Joined', 'IsMinor', 'ResearchConsent']
    const rows = selectedUsers.map(u => [
      u.full_name || '', u.email || '', u.tier || '', deriveStatus(u),
      u.is_minor ? 'HIDDEN' : (u.monthly_points || 0),
      u.successful_days || 0,
      u.last_active_date || '—', formatDate(u.created_at),
      u.is_minor ? 'true' : 'false',
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

  // Status badge colours
  const statusStyle = (status) => {
    const map = {
      active:   { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
      inactive: { bg: '#FEF3C7', color: '#92400E', label: 'Inactive' },
      paused:   { bg: '#EFF6FF', color: '#1D4ED8', label: 'Paused' },
      deleted:  { bg: '#FEE2E2', color: '#EF4444', label: 'Deleted' }
    }
    return map[status] || map.inactive
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
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search name or email..."
          style={{ ...inputStyle, minWidth: 220 }}
        />
        <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Tiers</option>
          {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="active">Active (last 7 days)</option>
          <option value="inactive">Inactive ({'>'} 7 days)</option>
          <option value="paused">Paused</option>
          <option value="deleted">Deleted</option>
        </select>
        <select value={genderFilter} onChange={e => { setGenderFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
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
                  <th
                    key={col.key}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                    style={{ padding: '12px 14px', textAlign: 'left', cursor: col.sortable !== false ? 'pointer' : 'default', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}
                  >
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
                const status = deriveStatus(u)
                const daysAgo = daysSince(u.last_active_date)
                const s = statusStyle(status)
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
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: C.text }}>{u.is_minor ? '—' : (u.monthly_points || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', color: C.text }}>{u.successful_days || 0}</td>
                    <td style={{ padding: '12px 14px', color: daysAgo !== null && daysAgo > 14 ? '#EF4444' : C.textMuted }}>
                      {daysAgo !== null ? `${daysAgo}d ago` : '—'}
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
