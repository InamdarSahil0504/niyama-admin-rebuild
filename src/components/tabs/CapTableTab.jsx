import React, { useState, useEffect } from 'react'

const TODAY = new Date('2026-05-10')
const INCORPORATION_DATE = new Date('2026-04-19')
const CLIFF_DATE = new Date('2027-04-19')
const FULLY_VESTED_DATE = new Date('2030-04-19')
const TOTAL_SHARES = 9000000
const VESTING_MONTHS = 48

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatMoney(n) { return '$' + Number(n || 0).toLocaleString() }

function VestingBar({ C }) {
  const totalMs = FULLY_VESTED_DATE - INCORPORATION_DATE
  const elapsedMs = TODAY - INCORPORATION_DATE
  const progressPct = Math.min((elapsedMs / totalMs) * 100, 100)
  const cliffPct = ((CLIFF_DATE - INCORPORATION_DATE) / totalMs) * 100

  return (
    <div>
      <div style={{ position: 'relative', height: 28, background: C.bg, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progressPct}%`, background: '#4A7A68', borderRadius: 6, transition: 'width 0.8s ease' }} />
        <div style={{ position: 'absolute', left: `${cliffPct}%`, top: 0, height: '100%', width: 2, background: '#C9973A', zIndex: 1 }} />
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: '#fff', mixBlendMode: 'difference' }}>
          {progressPct.toFixed(1)}% elapsed
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textMuted }}>
        <span>Start: {formatDate(INCORPORATION_DATE)}</span>
        <span style={{ color: '#C9973A' }}>▲ Cliff: {formatDate(CLIFF_DATE)}</span>
        <span>Full vest: {formatDate(FULLY_VESTED_DATE)}</span>
      </div>
    </div>
  )
}

export default function CapTableTab({ theme }) {
  const C = theme
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('cap_table_unlocked') === 'true')
  const [passwordInput, setPasswordInput] = useState('')
  const [error, setError] = useState('')
  const [safeNotes, setSafeNotes] = useState([])
  const [showAddSafe, setShowAddSafe] = useState(false)
  const [newSafe, setNewSafe] = useState({ investor: '', amount: '', date: '', valCap: '', discount: '', status: 'Open' })
  const [proForma, setProForma] = useState({ investment: '', preMoney: '' })
  const [proFormaResult, setProFormaResult] = useState(null)

  useEffect(() => {
    // Clear cap table session when tab is left or page reloads
    const handleUnload = () => sessionStorage.removeItem('cap_table_unlocked')
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  const attemptUnlock = () => {
    const pw = import.meta.env.VITE_CAP_TABLE_PASSWORD
    if (pw && passwordInput === pw) {
      sessionStorage.setItem('cap_table_unlocked', 'true')
      setUnlocked(true)
      setError('')
    } else {
      setError('Incorrect password')
      setPasswordInput('')
    }
  }

  const calculateProForma = () => {
    const inv = parseFloat(proForma.investment) || 0
    const pre = parseFloat(proForma.preMoney) || 1
    const post = pre + inv
    const newShares = Math.round((inv / post) * TOTAL_SHARES)
    const dilutionPct = (newShares / (TOTAL_SHARES + newShares)) * 100
    const founderPostPct = 100 - dilutionPct
    setProFormaResult({ post, newShares, dilutionPct, founderPostPct })
  }

  const addSafeNote = () => {
    setSafeNotes(prev => [...prev, { ...newSafe, id: Date.now() }])
    setNewSafe({ investor: '', amount: '', date: '', valCap: '', discount: '', status: 'Open' })
    setShowAddSafe(false)
  }

  const sectionStyle = { background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 20 }
  const inputStyle = { padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }
  const tdStyle = { padding: '12px 14px', color: C.text, borderBottom: `1px solid ${C.border}` }
  const thStyle = { padding: '10px 14px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11, background: C.bg }

  if (!unlocked) {
    return (
      <div style={{ padding: 24, background: C.bg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: C.card, borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', border: `1px solid ${C.border}`, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: C.text }}>Cap Table</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: C.textMuted }}>This section is password-protected. Enter the cap table password to continue.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') attemptUnlock() }}
            placeholder="Enter password..."
            style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4, marginBottom: 14, fontSize: 18 }}
            autoFocus
          />
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button onClick={attemptUnlock} style={{ width: '100%', padding: '11px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Unlock Cap Table
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100%' }}>
      {/* Security warning */}
      <div style={{ padding: '10px 16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400E' }}>
        <span>🔒</span>
        <strong>Security Note:</strong>&nbsp;Cap table data is stored locally. Do not share this screen. Session-locked — reload page to re-authenticate.
      </div>

      {/* Company Header */}
      <div style={{ ...sectionStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: C.text }}>Niyama Life Inc.</h2>
            <div style={{ fontSize: 14, color: C.textMuted }}>Private Corporation · Delaware C-Corp</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '5px 12px', background: '#D1FAE5', color: '#065F46', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>✓ Incorporated Apr 19, 2026</span>
            <span style={{ padding: '5px 12px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>✓ 83(b) Election Filed</span>
          </div>
        </div>
      </div>

      {/* Founder Equity */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Founder Equity</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
          <thead>
            <tr>
              {['Founder', 'Shares', 'Ownership', 'Class', 'Vesting Schedule', 'Status'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>Sahil Inamdar</strong></td>
              <td style={tdStyle}>{TOTAL_SHARES.toLocaleString()}</td>
              <td style={tdStyle}><strong>100%</strong> (pre-funding)</td>
              <td style={tdStyle}>Common Stock</td>
              <td style={tdStyle}>4-year / 1-year cliff from Apr 19, 2026</td>
              <td style={tdStyle}>
                <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>Cliff Pending</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ padding: '16px 18px', background: C.bg, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Vesting Progress</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
                <strong style={{ color: '#F59E0B' }}>0 shares vested</strong> — Cliff not reached until {formatDate(CLIFF_DATE)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: C.textMuted }}>Elapsed since incorporation</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#4A7A68' }}>
                {Math.floor((TODAY - INCORPORATION_DATE) / (30 * 86400000))} months
              </div>
            </div>
          </div>
          <VestingBar C={C} />
          <div style={{ marginTop: 12, fontSize: 12, color: C.textMuted }}>
            After cliff: 2,250,000 shares vest immediately, then 187,500/month for 36 months. Full vest on {formatDate(FULLY_VESTED_DATE)}.
          </div>
        </div>
      </div>

      {/* Option Pool */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Option Pool</h3>
          <button disabled style={{ padding: '6px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textMuted, cursor: 'not-allowed' }}>+ Add Option (Reserved)</button>
        </div>
        <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
          No option pool established yet. Reserve options for future employees/advisors during fundraise.
        </div>
      </div>

      {/* SAFE Notes */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>SAFE Notes</h3>
          <button onClick={() => setShowAddSafe(!showAddSafe)} style={{ padding: '6px 14px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add SAFE</button>
        </div>
        {showAddSafe && (
          <div style={{ padding: 16, background: C.bg, borderRadius: 10, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { key: 'investor', label: 'Investor Name' },
              { key: 'amount', label: 'Amount ($)' },
              { key: 'date', label: 'Date' },
              { key: 'valCap', label: 'Valuation Cap ($)' },
              { key: 'discount', label: 'Discount (%)' },
              { key: 'status', label: 'Status' }
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={newSafe[f.key]} onChange={e => setNewSafe(prev => ({ ...prev, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button onClick={addSafeNote} style={{ padding: '8px 16px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
              <button onClick={() => setShowAddSafe(false)} style={{ padding: '8px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.text }}>Cancel</button>
            </div>
          </div>
        )}
        {safeNotes.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8 }}>No SAFE notes issued yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Investor', 'Amount', 'Date', 'Val Cap', 'Discount', 'Status'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeNotes.map(note => (
                <tr key={note.id}>
                  <td style={tdStyle}>{note.investor}</td>
                  <td style={tdStyle}>{formatMoney(note.amount)}</td>
                  <td style={tdStyle}>{note.date}</td>
                  <td style={tdStyle}>{note.valCap ? formatMoney(note.valCap) : '—'}</td>
                  <td style={tdStyle}>{note.discount ? `${note.discount}%` : '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#3B82F6' }}>{note.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Round History */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.text }}>Round History</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Round', 'Date', 'Shares Issued', 'Amount Raised', 'Notes'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>Incorporation</strong></td>
              <td style={tdStyle}>Apr 19, 2026</td>
              <td style={tdStyle}>9,000,000</td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>83(b) election filed. 4-year vesting with 1-year cliff.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pro-forma Calculator */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>Pro-Forma Dilution Calculator</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Investment Amount ($)</label>
            <input value={proForma.investment} onChange={e => setProForma(prev => ({ ...prev, investment: e.target.value }))} placeholder="500000" style={inputStyle} type="number" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Pre-Money Valuation ($)</label>
            <input value={proForma.preMoney} onChange={e => setProForma(prev => ({ ...prev, preMoney: e.target.value }))} placeholder="5000000" style={inputStyle} type="number" />
          </div>
          <button onClick={calculateProForma} style={{ padding: '10px 20px', background: '#4A7A68', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', height: 40 }}>Calculate</button>
        </div>
        {proFormaResult && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {[
                ['Post-Money Valuation', formatMoney(proFormaResult.post)],
                ['New Shares Issued', proFormaResult.newShares.toLocaleString()],
                ['Investor Dilution', `${proFormaResult.dilutionPct.toFixed(2)}%`],
                ['Founder Post-Dilution %', `${proFormaResult.founderPostPct.toFixed(2)}%`]
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px', color: C.textMuted, fontWeight: 500 }}>{label}</td>
                  <td style={{ padding: '12px', fontWeight: 700, color: C.text, fontSize: 15 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
