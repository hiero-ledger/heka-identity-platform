import React from 'react'

interface Props {
  credentialCount: number
}

const PINK = '#c6136a'
const CARD = '#1a1118'

export const WalletStatus: React.FC<Props> = ({ credentialCount }) => {
  return (
    <div style={s.card}>
      <div style={s.statusRow}>
        <div style={s.dotWrap}>
          <div style={s.dotPulse} />
          <div style={s.dot} />
        </div>
        <span style={s.statusLabel}>Wallet Ready</span>
        <div style={s.badge}>
          {credentialCount} credential{credentialCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={s.sep} />
      <p style={s.note}>Holder keys stay in the wallet page. They are created non-extractable and are not available to this popup.</p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card: {
    background: CARD,
    border: '1px solid rgba(198,19,106,0.2)',
    borderRadius: 14,
    padding: '14px 14px',
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    /* subtle top gradient strip */
    boxShadow: `inset 0 1px 0 rgba(232,61,111,0.18), 0 4px 16px rgba(0,0,0,0.3)`,
  },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  dotWrap: {
    position: 'relative', width: 10, height: 10, flexShrink: 0,
  },
  dotPulse: {
    position: 'absolute', inset: -3,
    borderRadius: '50%', background: 'rgba(34,197,94,0.2)',
    animation: 'heka-pulse 2s ease-in-out infinite',
  },
  dot: {
    position: 'absolute', inset: 0,
    borderRadius: '50%', background: '#22c55e',
    boxShadow: '0 0 6px rgba(34,197,94,0.7)',
  },
  statusLabel: { fontSize: 12, color: '#86efac', fontWeight: 700, letterSpacing: '0.01em' },
  badge: {
    marginLeft: 'auto',
    fontSize: 10, fontWeight: 700,
    color: PINK,
    background: 'rgba(198,19,106,0.1)',
    border: `1px solid rgba(198,19,106,0.22)`,
    borderRadius: 20, padding: '2px 10px',
    letterSpacing: '0.02em',
  },
  sep: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, rgba(198,19,106,0.15) 40%, rgba(198,19,106,0.15) 60%, transparent)',
    marginBottom: 12,
  },
  note: { fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 },
}

// inject pulse keyframe once
const pulseStyle = document.createElement('style')
pulseStyle.textContent = `@keyframes heka-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.6);opacity:0} }`
document.head.appendChild(pulseStyle)
