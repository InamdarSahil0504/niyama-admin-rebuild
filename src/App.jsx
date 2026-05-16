import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { supabase } from './supabase.js'
import { COLORS } from './theme.js'
import { useAuth } from './hooks/useAuth.js'
import { useToast } from './hooks/useToast.js'
import { Toast } from './components/shared/Toast.jsx'
import { GlobalSearch } from './components/shared/GlobalSearch.jsx'

import DashboardTab from './components/tabs/DashboardTab.jsx'
import UsersTab from './components/tabs/UsersTab.jsx'
import MessagesTab from './components/tabs/MessagesTab.jsx'
import FraudTab from './components/tabs/FraudTab.jsx'
import FinancialsTab from './components/tabs/FinancialsTab.jsx'
import ActivityTab from './components/tabs/ActivityTab.jsx'
import OperationsTab from './components/tabs/OperationsTab.jsx'
import ComplianceTab from './components/tabs/ComplianceTab.jsx'
import AnalyticsTab from './components/tabs/AnalyticsTab.jsx'
import CapTableTab from './components/tabs/CapTableTab.jsx'
import ReportsTab from './components/tabs/ReportsTab.jsx'
import AdminLogsTab from './components/tabs/AdminLogsTab.jsx'
import NotificationsTab from './components/tabs/NotificationsTab.jsx'

export const ThemeContext = createContext(null)

export function logAdminAction(action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    description: details.description || Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', '),
    admin: import.meta.env.VITE_ADMIN_EMAIL || 'sahil@niyamalife.com',
    affectedUser: details.userId || details.email || '—',
    details
  }
  try {
    const stored = localStorage.getItem('niyama_audit_log')
    const log = stored ? JSON.parse(stored) : []
    log.unshift(entry)
    if (log.length > 500) log.splice(500)
    localStorage.setItem('niyama_audit_log', JSON.stringify(log))
  } catch {}
  try {
    const sessionId = sessionStorage.getItem('niyama_session_id')
    if (sessionId) {
      const count = parseInt(sessionStorage.getItem('niyama_action_count') || '0') + 1
      sessionStorage.setItem('niyama_action_count', String(count))
    }
  } catch {}
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', shortcut: '1' },
  { id: 'users', label: 'Users', icon: '👤', shortcut: '2' },
  { id: 'messages', label: 'Messages', icon: '💬', shortcut: '3' },
  { id: 'fraud', label: 'Fraud Monitor', icon: '🛡️', shortcut: '4' },
  { id: 'financials', label: 'Financials', icon: '💰', shortcut: '5' },
  { id: 'activity', label: 'Activity Feed', icon: '⚡', shortcut: '6' },
  { id: 'operations', label: 'Operations', icon: '⚙️', shortcut: '7' },
  { id: 'compliance', label: 'Compliance', icon: '📋', shortcut: '8' },
  { id: 'analytics', label: 'Analytics', icon: '📈', shortcut: '9' },
  { id: 'captable', label: 'Cap Table', icon: '📑', shortcut: 'A' },
  { id: 'reports', label: 'Reports', icon: '📄', shortcut: 'B' },
  { id: 'adminlogs', label: 'Admin Logs', icon: '🔍', shortcut: 'C' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', shortcut: 'D' },
]

function NiyamaLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flexShrink: 0 }}>
      <ellipse cx="163" cy="308" rx="108" ry="70" fill="#4A7A68" transform="rotate(-30 163 308)" />
      <ellipse cx="349" cy="236" rx="108" ry="70" fill="#4A7A68" opacity="0.75" transform="rotate(30 349 236)" />
      <line x1="256" y1="420" x2="256" y2="174" stroke="#4A7A68" strokeWidth="24" strokeLinecap="round" />
      <circle cx="256" cy="154" r="48" fill="#C9973A" />
    </svg>
  )
}

function AdminAvatarMenu({ isDark, onToggleTheme, onLogout, C }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const email = import.meta.env.VITE_ADMIN_EMAIL || 'sahil@niyamalife.com'

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 34, height: 34, borderRadius: '50%', background: COLORS.primary,
          color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        title="Admin menu"
      >
        S
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 8,
          minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 500
        }}>
          <div style={{ padding: '8px 12px 10px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sahil Inamdar</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{email}</div>
          </div>
          <button
            onClick={() => { onToggleTheme(); setOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: C.text, fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = C.bg}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>{isDark ? '☀️' : '🌙'}</span>
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textMuted, fontFamily: 'monospace' }}>⌘D</span>
          </button>
          <button
            onClick={() => { onLogout(); setOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#EF4444', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  )
}

function LoginScreen({ onLogin, isDark }) {
  const C = isDark ? COLORS.dark : COLORS.light
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 300))
    const ok = onLogin(password)
    if (!ok) { setError('Incorrect password'); setPassword('') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: C.card, borderRadius: 20, padding: '48px 40px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: `1px solid ${C.border}` }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <NiyamaLogo size={56} />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: COLORS.primary }}>Niyama</h1>
          <div style={{ fontSize: 14, color: C.textMuted, fontWeight: 500 }}>Admin Dashboard</div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: C.textMuted, display: 'block', marginBottom: 6, fontWeight: 500 }}>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password..."
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', border: `2px solid ${error ? '#EF4444' : C.border}`,
                borderRadius: 10, fontSize: 15, background: C.bg, color: C.text,
                outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box'
              }}
            />
            {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{error}</div>}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '13px', background: COLORS.primary, color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !password ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.textMuted }}>Niyama Life Inc. · Admin Access Only</div>
      </div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, login, logout } = useAuth()
  const { toasts, addToast, removeToast } = useToast()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('niyama_theme') === 'dark')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [searchOpen, setSearchOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [fraudCount, setFraudCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sidebarHovered, setSidebarHovered] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const C = isDark ? COLORS.dark : COLORS.light

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('niyama_theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  const navigateTab = useCallback((tabId) => {
    setActiveTab(tabId)
    setLastUpdated(new Date())
    logAdminAction('tab_navigation', { tab: tabId })
    if (tabId !== 'captable') sessionStorage.removeItem('cap_table_unlocked')
  }, [])

  // Real-time subscriptions
  useEffect(() => {
    if (!isAuthenticated) return
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, () => {
        setRefreshKey(k => k + 1)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        setRefreshKey(k => k + 1)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_summaries' }, () => {
        setRefreshKey(k => k + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAuthenticated])

  // Poll unread/fraud counts
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchCounts = async () => {
      try {
        const [unreadRes, fraudRes] = await Promise.all([
          supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_read', false).eq('is_admin_reply', false),
          supabase.from('fraud_risk_scores').select('id', { count: 'exact', head: true }).gte('score', 70)
        ])
        setUnreadCount(unreadRes.count || 0)
        setFraudCount(fraudRes.count || 0)
      } catch {}
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // Initialize session
  useEffect(() => {
    if (!isAuthenticated) return
    const sessionId = Math.random().toString(36).slice(2, 18)
    sessionStorage.setItem('niyama_session_id', sessionId)
    supabase.from('admin_sessions').insert({
      id: sessionId,
      admin_email: import.meta.env.VITE_ADMIN_EMAIL || 'sahil@niyamalife.com',
      created_at: new Date().toISOString(),
      action_count: 0
    }).then(() => {}).catch(() => {})
    logAdminAction('login', { description: 'Admin logged in' })
  }, [isAuthenticated])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isAuthenticated) return
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.metaKey && e.key === 'd') { e.preventDefault(); toggleTheme(); return }
      if (e.metaKey && e.key === 'k') { e.preventDefault(); setSearchOpen(true); return }
      if (e.key === 'r' || e.key === 'R') {
        if (!e.metaKey && !e.ctrlKey) {
          setRefreshKey(k => k + 1); setLastUpdated(new Date()); addToast('Data refreshed', 'info'); return
        }
      }
      const numKeys = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8 }
      const alphaKeys = { 'a': 9, 'A': 9, 'b': 10, 'B': 10, 'c': 11, 'C': 11, 'd': 12, 'D': 12 }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (numKeys[e.key] !== undefined) { navigateTab(TABS[numKeys[e.key]].id); return }
        if (alphaKeys[e.key] !== undefined) { navigateTab(TABS[alphaKeys[e.key]].id); return }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isAuthenticated, toggleTheme, navigateTab, addToast])

  const handleLogout = () => {
    logAdminAction('logout', { description: 'Admin logged out' })
    logout()
    addToast('Logged out successfully', 'info')
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} isDark={isDark} />
  }

  const activeTabConfig = TABS.find(t => t.id === activeTab) || TABS[0]
  const tabProps = { theme: C, addToast, logAdminAction, key: refreshKey }

  const tabContent = {
    dashboard: <DashboardTab {...tabProps} />,
    users: <UsersTab {...tabProps} />,
    messages: <MessagesTab {...tabProps} onUnreadCountChange={setUnreadCount} />,
    fraud: <FraudTab {...tabProps} onFraudCountChange={setFraudCount} />,
    financials: <FinancialsTab {...tabProps} />,
    activity: <ActivityTab {...tabProps} />,
    operations: <OperationsTab {...tabProps} />,
    compliance: <ComplianceTab {...tabProps} />,
    analytics: <AnalyticsTab {...tabProps} />,
    captable: <CapTableTab theme={C} />,
    reports: <ReportsTab {...tabProps} />,
    adminlogs: <AdminLogsTab {...tabProps} />,
    notifications: <NotificationsTab {...tabProps} />
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, C }}>
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, sans-serif', background: C.bg, color: C.text, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 220, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          {/* Logo */}
          <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NiyamaLogo size={34} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.primary, lineHeight: 1 }}>Niyama</div>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 500 }}>Admin Panel</div>
              </div>
            </div>
          </div>

          {/* Search shortcut */}
          <div style={{ padding: '10px 8px 0' }}>
            <button
              onClick={() => setSearchOpen(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, border: `1px solid ${C.border}`, cursor: 'pointer', background: C.bg, color: C.textMuted, fontSize: 13, transition: 'all 0.15s' }}
            >
              <span>🔍</span>
              <span style={{ flex: 1 }}>Search...</span>
              <span style={{ fontSize: 10, background: C.card, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>⌘K</span>
            </button>
          </div>

          {/* Nav Items */}
          <nav style={{ flex: 1, padding: '8px 8px' }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id
              const badge = tab.id === 'messages' && unreadCount > 0 ? unreadCount
                : tab.id === 'fraud' && fraudCount > 0 ? fraudCount
                : null
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTab(tab.id)}
                  onMouseEnter={() => setSidebarHovered(tab.id)}
                  onMouseLeave={() => setSidebarHovered(null)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    borderRadius: 9, border: 'none', cursor: 'pointer', marginBottom: 2, textAlign: 'left',
                    background: isActive ? COLORS.primary + '18' : sidebarHovered === tab.id ? C.bg : 'transparent',
                    color: isActive ? COLORS.primary : C.text,
                    fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{tab.icon}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{tab.label}</span>
                  {badge && (
                    <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: tab.id === 'fraud' ? '#EF4444' : COLORS.primary, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top header */}
          <div style={{ padding: '0 20px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17 }}>{activeTabConfig.icon}</span>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{activeTabConfig.label}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>
                Updated {lastUpdated.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
              </span>
              <button
                onClick={() => { setRefreshKey(k => k + 1); setLastUpdated(new Date()); addToast('Data refreshed', 'info') }}
                style={{ padding: '6px 11px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', gap: 5 }}
                title="Refresh (R)"
              >
                ↻ Refresh
              </button>
              <button
                onClick={toggleTheme}
                style={{ padding: '6px 11px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', gap: 5 }}
                title="Toggle dark mode (⌘D)"
              >
                {isDark ? '☀️' : '🌙'}
              </button>
              <AdminAvatarMenu isDark={isDark} onToggleTheme={toggleTheme} onLogout={handleLogout} C={C} />
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tabContent[activeTab] || tabContent.dashboard}
          </div>
        </div>

        {/* Global Search */}
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={navigateTab}
          theme={C}
        />

        <Toast toasts={toasts} removeToast={removeToast} />
      </div>
    </ThemeContext.Provider>
  )
}
