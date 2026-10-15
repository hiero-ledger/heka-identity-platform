import React, { useEffect, useState } from 'react'
import { WalletStatus } from './components/WalletStatus'
import { CredentialList } from './components/CredentialList'
import { ReceiveCredential } from './components/ReceiveCredential'
import { getHolderDid } from '../wallet/did'
import { getOrCreateKeyPair } from '../wallet/key-store'
import { getAllCredentials, type HeldCredential } from '../wallet/credential-store'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppView = 'wallet' | 'receive'

export interface WalletState {
  initialized: boolean
  holderDid: string | null
  credentials: HeldCredential[]
  loading: boolean
  error: string | null
}

// ── Hiero "H" logo mark ───────────────────────────────────────────────────────

const HieroMark: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="18" fill="url(#hiero-g)" />
    <path d="M28 25H44V47H56V25H72V75H56V53H44V75H28V25Z" fill="white" />
    <defs>
      <linearGradient id="hiero-g" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e83d6f" />
        <stop offset="100%" stopColor="#8b1a3a" />
      </linearGradient>
    </defs>
  </svg>
)

// ── App ───────────────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('wallet')
  const [wallet, setWallet] = useState<WalletState>({
    initialized: false,
    holderDid: null,
    credentials: [],
    loading: true,
    error: null,
  })

  const searchParams = new URLSearchParams(window.location.search)
  const urlOfferUri = searchParams.get('offer')
  const [pendingOfferUri, setPendingOfferUri] = useState<string | null>(urlOfferUri)

  const loadWalletState = async () => {
    try {
      setWallet((prev) => ({ ...prev, loading: true, error: null }))
      await getOrCreateKeyPair()
      const [holderDid, credentials] = await Promise.all([getHolderDid(), getAllCredentials()])
      setWallet({ initialized: true, holderDid, credentials, loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setWallet((prev) => ({ ...prev, loading: false, error: message }))
    }
  }

  useEffect(() => {
    void loadWalletState()
    chrome.storage.local.get('pendingOfferUri', (data) => {
      if (data.pendingOfferUri) {
        setPendingOfferUri(data.pendingOfferUri)
        setView('receive')
        void chrome.storage.local.remove('pendingOfferUri')
      }
    })
    if (urlOfferUri) setView('receive')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={s.container}>
      <div style={s.blob1} />
      <div style={s.blob2} />

      <header style={s.header}>
        <div style={s.logoRow}>
          <HieroMark size={28} />
          <div>
            <div style={s.logoName}>Heka</div>
            <div style={s.logoSub}>Web Wallet</div>
          </div>
        </div>

        <div style={s.tabs}>
          {(['wallet', 'receive'] as AppView[]).map((tab) => (
            <button
              key={tab}
              style={{ ...s.tab, ...(view === tab ? s.tabActive : {}) }}
              onClick={() => setView(tab)}
            >
              {tab === 'wallet' ? '🪪' : '↓'}&ensp;{tab === 'wallet' ? 'Wallet' : 'Receive'}
              {view === tab && <div style={s.tabBar} />}
            </button>
          ))}
        </div>
      </header>

      <div style={s.divider} />

      <main style={s.main}>
        {wallet.loading ? (
          <div style={s.center}>
            <div style={s.spinnerOuter}>
              <div style={s.spinnerInner} />
            </div>
            <p style={s.loadTitle}>Initialising wallet</p>
            <p style={s.loadSub}>Generating keys and loading credentials…</p>
          </div>
        ) : wallet.error ? (
          <div style={s.errCard}>
            <div style={s.errIconWrap}>⚠️</div>
            <p style={s.errHeading}>Something went wrong</p>
            <p style={s.errBody}>{wallet.error}</p>
            <button style={s.retryBtn} onClick={() => void loadWalletState()}>↺ Try again</button>
          </div>
        ) : (
          <>
            {view === 'wallet' && (
              <>
                <WalletStatus holderDid={wallet.holderDid ?? ''} credentialCount={wallet.credentials.length} />
                <CredentialList credentials={wallet.credentials} />
              </>
            )}
            {view === 'receive' && (
              <ReceiveCredential
                initialOfferUri={pendingOfferUri ?? undefined}
                onReceived={() => { void loadWalletState(); setView('wallet') }}
              />
            )}
          </>
        )}
      </main>

      <footer style={s.footer}>
        <span style={s.footerDot} />
        <span style={s.footerText}>Hiero LFDT · v0.1.0</span>
        <span style={s.footerDot} />
      </footer>
    </div>
  )
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const PINK   = '#c6136a'
const RED    = '#e83d6f'
const DARK   = '#100b0e'
const CARD   = '#1a1118'
const BORDER = 'rgba(198,19,106,0.18)'

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', minHeight: '100vh',
    background: DARK, position: 'relative', overflow: 'hidden',
    fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
  },
  blob1: {
    position: 'absolute', top: -60, left: -60, width: 260, height: 200,
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,61,111,0.14) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  blob2: {
    position: 'absolute', bottom: -40, right: -40, width: 200, height: 180,
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,19,106,0.10) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  header: { padding: '14px 16px 0', position: 'relative', zIndex: 1 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  logoName: { fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 },
  logoSub: { fontSize: 9, fontWeight: 600, color: PINK, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 },
  tabs: { display: 'flex', gap: 2 },
  tab: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px 8px', border: 'none', borderRadius: '8px 8px 0 0',
    background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'color 0.15s, background 0.15s', letterSpacing: '0.01em',
  },
  tabActive: {
    color: '#fff', background: `rgba(198,19,106,0.1)`,
  },
  tabBar: {
    position: 'absolute', bottom: 0, left: 8, right: 8, height: 2,
    borderRadius: 2, background: `linear-gradient(90deg, ${PINK}, ${RED})`,
  },
  divider: {
    height: 1, position: 'relative', zIndex: 1,
    background: `linear-gradient(90deg, transparent, ${BORDER} 25%, ${BORDER} 75%, transparent)`,
  },
  main: { flex: 1, padding: '14px 14px', overflowY: 'auto', position: 'relative', zIndex: 1 },
  footer: {
    padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    position: 'relative', zIndex: 1,
  },
  footerText: { fontSize: 10, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 500 },
  footerDot: { display: 'inline-block', width: 3, height: 3, borderRadius: '50%', background: 'rgba(198,19,106,0.4)' },

  // Loading
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 48 },
  spinnerOuter: {
    width: 52, height: 52, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: `rgba(198,19,106,0.07)`, border: `1px solid rgba(198,19,106,0.2)`,
  },
  spinnerInner: {
    width: 26, height: 26, borderRadius: '50%',
    border: `2.5px solid rgba(198,19,106,0.2)`, borderTopColor: RED,
    animation: 'spin 0.8s linear infinite',
  },
  loadTitle: { color: '#fff', fontSize: 13, fontWeight: 700, marginTop: 4 },
  loadSub: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  // Error
  errCard: {
    background: CARD, border: '1px solid rgba(220,38,38,0.22)', borderRadius: 14,
    padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, textAlign: 'center',
  },
  errIconWrap: {
    width: 44, height: 44, borderRadius: '50%', background: 'rgba(220,38,38,0.09)',
    border: '1px solid rgba(220,38,38,0.2)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 2,
  },
  errHeading: { color: '#fff', fontSize: 14, fontWeight: 700 },
  errBody: { color: 'rgba(255,255,255,0.42)', fontSize: 11, lineHeight: 1.6 },
  retryBtn: {
    marginTop: 8, padding: '8px 20px', background: 'rgba(220,38,38,0.1)',
    border: '1px solid rgba(220,38,38,0.28)', borderRadius: 20,
    color: '#fca5a5', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
}

// Inject global styles + font
const styleTag = document.createElement('style')
styleTag.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes heka-fade-in { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 360px; min-height: 500px; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(198,19,106,0.35); border-radius: 3px; }
`
document.head.appendChild(styleTag)
