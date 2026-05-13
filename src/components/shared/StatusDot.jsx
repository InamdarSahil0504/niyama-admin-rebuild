import React from 'react'

const STATUS_COLORS = {
  active: '#10B981',
  inactive: '#F59E0B',
  churned: '#EF4444'
}

const STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  churned: 'Churned'
}

export function StatusDot({ status, showLabel = false }) {
  const color = STATUS_COLORS[status] || '#6B7280'
  const label = STATUS_LABELS[status] || status || 'Unknown'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: `0 0 0 2px ${color}30`
      }} />
      {showLabel && (
        <span style={{ fontSize: 13, color, fontWeight: 500 }}>{label}</span>
      )}
    </span>
  )
}
