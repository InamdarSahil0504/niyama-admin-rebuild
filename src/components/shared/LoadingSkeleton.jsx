import React, { useEffect } from 'react'

let shimmerInjected = false
function injectShimmer() {
  if (shimmerInjected) return
  shimmerInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes shimmer {
      0% { background-position: -468px 0; }
      100% { background-position: 468px 0; }
    }
    .skeleton-shimmer {
      background: linear-gradient(to right, #E5E7EB 8%, #F3F4F6 18%, #E5E7EB 33%);
      background-size: 800px 104px;
      animation: shimmer 1.4s linear infinite;
    }
    .skeleton-shimmer-dark {
      background: linear-gradient(to right, #1F2937 8%, #374151 18%, #1F2937 33%);
      background-size: 800px 104px;
      animation: shimmer 1.4s linear infinite;
    }
  `
  document.head.appendChild(style)
}

export function LoadingSkeleton({ width = '100%', height = 16, borderRadius = 6, dark = false }) {
  useEffect(() => { injectShimmer() }, [])
  return (
    <div
      className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'}
      style={{ width, height, borderRadius, display: 'inline-block' }}
    />
  )
}

export function TableSkeleton({ rows = 5, dark = false }) {
  useEffect(() => { injectShimmer() }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0' }}>
          <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: 20, height: 20, borderRadius: 4 }} />
          <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '60%', height: 14, borderRadius: 4 }} />
            <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '40%', height: 12, borderRadius: 4 }} />
          </div>
          <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: 60, height: 20, borderRadius: 10 }} />
          <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: 50, height: 14, borderRadius: 4 }} />
          <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: 70, height: 14, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ dark = false }) {
  useEffect(() => { injectShimmer() }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '40%', height: 14, borderRadius: 4 }} />
      <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '70%', height: 32, borderRadius: 6 }} />
      <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '50%', height: 12, borderRadius: 4 }} />
    </div>
  )
}

export function ChartSkeleton({ dark = false, height = 200 }) {
  useEffect(() => { injectShimmer() }, [])
  return (
    <div className={dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} style={{ width: '100%', height, borderRadius: 8 }} />
  )
}
