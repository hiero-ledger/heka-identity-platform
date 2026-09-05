import React, { useState } from 'react'

interface Props {
  holderDid: string
  credentialCount: number
}

const PINK = '#c6136a'
const CARD = '#1a1118'

export const WalletStatus: React.FC<Props> = ({ holderDid, credentialCount }) => {
  const [didCopied, setDidCopied] = useState(false)

  const truncateDid = (did: string) =>
    did.length <= 38 ? did : `${did.slice(0, 18)}…${did.slice(-12)}`

  const handleCopyDid = async () => {
    await navigator.clipboard.writeText(holderDid)
    setDidCopied(true)
    setTimeout(() => setDidCopied(false), 2000)
  }

  return (
    <div style={s.card}>
      {/* Status row */}
      <div style={s.statusRow}>
        {/* Pulsing green dot */}
        <div style={s.dotWrap}>
          <div style={s.dotPulse} />
          <div style={s.dot} />
        </div>
        <span style={s.statusLabel}>Wallet Ready</span>
        <div style={s.badge}>
          {credentialCount} credential{credentialCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Gradient separator */}
      <div style={s.sep} />

      {/* DID block */}
      <div style={s.didSection}>
        <span style={s.fieldLabel}>Holder DID</span>
        <div style={s.didRow}>
          <code style={s.didCode}>{truncateDid(holderDid)}</code>
          <button style={s.copyBtn} onClick={() => void handleCopyDid()} title="Copy full DID">
            {didCopied ? (
              <span style={{ color: '#4ade80', fontSize: 13 }}>✓</span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>⎘</span>
            )}
          </button>
        </div>
        <span style={s.didMethod}>did:jwk · ECDSA P-256 · device-bound</span>
      </div>
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
  didSection: { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: {
    fontSize: 9, color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
  },
  didRow: { display: 'flex', alignItems: 'center', gap: 8 },
  didCode: {
    flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.75)',
    background: 'rgba(0,0,0,0.35)', padding: '5px 9px', borderRadius: 7,
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  copyBtn: {
    width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7, background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s',
  },
  didMethod: { fontSize: 10, color: 'rgba(255,255,255,0.2)' },
}

// inject pulse keyframe once
const pulseStyle = document.createElement('style')
pulseStyle.textContent = `@keyframes heka-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.6);opacity:0} }`
document.head.appendChild(pulseStyle)
