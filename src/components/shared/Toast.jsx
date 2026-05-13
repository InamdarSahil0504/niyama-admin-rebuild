import React, { useEffect, useState } from 'react'

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}

const BG_COLORS = {
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6'
}

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const handleRemove = () => {
    setVisible(false)
    setTimeout(() => onRemove(toast.id), 300)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#1F2937',
        color: '#F9FAFB',
        padding: '12px 16px',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        minWidth: 280,
        maxWidth: 400,
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        borderLeft: `4px solid ${BG_COLORS[toast.type] || BG_COLORS.info}`,
        marginTop: 8,
        position: 'relative'
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: BG_COLORS[toast.type] || BG_COLORS.info,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          color: '#fff'
        }}
      >
        {ICONS[toast.type] || ICONS.info}
      </span>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={handleRemove}
        style={{
          background: 'none',
          border: 'none',
          color: '#9CA3AF',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 4px',
          lineHeight: 1,
          flexShrink: 0
        }}
      >
        ×
      </button>
    </div>
  )
}

export function Toast({ toasts, removeToast }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
      }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
