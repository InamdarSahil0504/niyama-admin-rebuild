import React from 'react'
import { TIER_COLORS } from '../../theme.js'
import { TIERS } from '../../config.js'

export function TierBadge({ tier, size = 'sm' }) {
  const color = TIER_COLORS[tier] || '#6B7280'
  const label = TIERS[tier]?.name || tier || 'Unknown'
  const fontSize = size === 'sm' ? 11 : 13
  const padding = size === 'sm' ? '2px 8px' : '4px 12px'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding,
      borderRadius: 20,
      fontSize,
      fontWeight: 600,
      background: color + '20',
      color,
      border: `1px solid ${color}40`,
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  )
}
