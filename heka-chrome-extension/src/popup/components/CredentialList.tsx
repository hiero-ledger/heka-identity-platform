import React, { useState } from 'react'
import type { HeldCredential } from '../../wallet/credential-store'

interface Props {
  credentials: HeldCredential[]
}

const PINK = '#c6136a'
const RED  = '#e83d6f'
const CARD = '#1a1118'

const VCT_LABELS: Record<string, string> = {
  'https://hiero.ledger.org/vct/GithubContributorCredential': 'GitHub Contributor',
}

const VCT_ICONS: Record<string, string> = {
  'https://hiero.ledger.org/vct/GithubContributorCredential': '🏅',
}

export const CredentialList: React.FC<Props> = ({ credentials }) => {
  if (credentials.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyIconWrap}>
          <span style={{ fontSize: 28 }}>🗂️</span>
        </div>
        <p style={s.emptyTitle}>No credentials yet</p>
        <p style={s.emptyHint}>
          Complete contributor onboarding in Heka, then tap{' '}
          <strong style={{ color: PINK }}>Receive</strong> to add your credential.
        </p>
        <div style={s.emptyDivider} />
        <p style={s.emptyTip}>Your private key never leaves this device.</p>
      </div>
    )
  }

  return (
    <div style={s.list}>
      <div style={s.sectionHeader}>
        <span style={s.sectionLabel}>Held Credentials</span>
        <span style={s.sectionCount}>{credentials.length}</span>
      </div>
      {credentials.map((cred) => (
        <CredentialCard key={cred.id} credential={cred} />
      ))}
    </div>
  )
}

const CredentialCard: React.FC<{ credential: HeldCredential }> = ({ credential }) => {
  const [expanded, setExpanded] = useState(false)
  const label = VCT_LABELS[credential.vct] ?? 'Verifiable Credential'
  const icon  = VCT_ICONS[credential.vct] ?? '🪪'
  const receivedDate = new Date(credential.receivedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const truncate = (s: string, head = 14, tail = 8) =>
    s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s

  return (
    <div style={s.card}>
      {/* Top accent bar */}
      <div style={s.cardAccent} />

      <div style={s.cardHeader} onClick={() => setExpanded((p) => !p)}>
        <div style={s.cardIconWrap}>
          <span style={{ fontSize: 18 }}>{icon}</span>
        </div>
        <div style={s.cardMeta}>
          <span style={s.cardTitle}>{label}</span>
          <span style={s.cardDate}>Received {receivedDate}</span>
        </div>
        <div style={s.validBadge}>
          <span style={s.validDot} />
          Valid
        </div>
        <span style={{ ...s.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ›
        </span>
      </div>

      {expanded && (
        <div style={s.cardBody}>
          <InfoRow label="Type"   value={truncate(credential.vct, 22, 10)} mono />
          <InfoRow label="Issuer" value={truncate(credential.issuerDid, 16, 8)} mono />
          <InfoRow label="ID"     value={truncate(credential.id, 14, 8)} mono />
        </div>
      )}
    </div>
  )
}

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={ir.row}>
    <span style={ir.label}>{label}</span>
    <span style={{ ...ir.value, ...(mono ? ir.mono : {}) }}>{value}</span>
  </div>
)

const ir: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    gap: 8, padding: '4px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  label: { fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, fontWeight: 600 },
  value: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right', wordBreak: 'break-all' },
  mono:  { fontFamily: "'JetBrains Mono','Fira Code',monospace", color: PINK },
}

const s: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
    letterSpacing: '0.1em', fontWeight: 700,
  },
  sectionCount: {
    fontSize: 10, color: PINK, fontWeight: 700,
    background: 'rgba(198,19,106,0.1)', border: `1px solid rgba(198,19,106,0.2)`,
    borderRadius: 20, padding: '0px 7px',
  },
  card: {
    background: CARD,
    border: '1px solid rgba(198,19,106,0.18)',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    position: 'relative',
  },
  cardAccent: {
    height: 2,
    background: `linear-gradient(90deg, ${PINK}, ${RED})`,
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', cursor: 'pointer',
    transition: 'background 0.15s',
  },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 9,
    background: 'rgba(198,19,106,0.1)',
    border: '1px solid rgba(198,19,106,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#fff' },
  cardDate:  { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  validBadge: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 700,
    color: '#4ade80',
    background: 'rgba(34,197,94,0.09)',
    border: '1px solid rgba(34,197,94,0.22)',
    borderRadius: 20, padding: '2px 8px', flexShrink: 0,
  },
  validDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.6)',
  },
  chevron: {
    fontSize: 18, color: 'rgba(255,255,255,0.2)',
    transition: 'transform 0.2s ease', lineHeight: 1,
  },
  cardBody: {
    padding: '8px 12px 10px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    display: 'flex', flexDirection: 'column', gap: 2,
    background: 'rgba(0,0,0,0.15)',
  },

  // Empty state
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '28px 16px', textAlign: 'center',
  },
  emptyIconWrap: {
    width: 60, height: 60, borderRadius: '50%',
    background: 'rgba(198,19,106,0.07)',
    border: '1px solid rgba(198,19,106,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, color: '#fff', fontWeight: 700 },
  emptyHint:  { fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, maxWidth: 220 },
  emptyDivider: {
    width: 40, height: 1,
    background: 'rgba(198,19,106,0.2)',
    borderRadius: 2, margin: '4px 0',
  },
  emptyTip: { fontSize: 10, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.02em' },
}
