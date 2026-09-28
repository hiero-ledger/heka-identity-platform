import React, { useState } from 'react'
import { receiveCredential, type ReceiveResult } from '../../oid4vci/receive'

interface Props {
  initialOfferUri?: string
  onReceived: () => void
}

type ReceiveState =
  | { status: 'idle' }
  | { status: 'receiving' }
  | { status: 'success'; vct: string }
  | { status: 'error'; error: string; detail?: string }

const PINK = '#c6136a'
const RED  = '#e83d6f'

export const ReceiveCredential: React.FC<Props> = ({ initialOfferUri, onReceived }) => {
  const [offerUri, setOfferUri] = useState(initialOfferUri ?? '')
  const [state, setState] = useState<ReceiveState>({ status: 'idle' })

  const handleReceive = async () => {
    const trimmed = offerUri.trim()
    if (!trimmed) return
    setState({ status: 'receiving' })
    const result: ReceiveResult = await receiveCredential(trimmed)
    if (result.ok) {
      setState({ status: 'success', vct: result.credential.vct })
      setTimeout(() => onReceived(), 1600)
    } else {
      setState({ status: 'error', error: result.error, detail: result.detail })
    }
  }

  const isDisabled = state.status === 'receiving' || !offerUri.trim()

  return (
    <div style={s.container}>
      {/* Section heading */}
      <div style={s.headingRow}>
        <div style={s.headingIcon}>↓</div>
        <div>
          <h2 style={s.heading}>Receive Credential</h2>
          <p style={s.subheading}>OID4VCI · Pre-authorized code flow</p>
        </div>
      </div>

      <p style={s.description}>
        Paste the <code style={s.code}>openid-credential-offer://</code> URI from Heka below.
        Your credential will be cryptographically verified and stored on this device.
      </p>

      {/* URI input */}
      <div style={s.inputGroup}>
        <label style={s.label} htmlFor="offer-uri">Credential Offer URI</label>
        <div style={s.textareaWrap}>
          <textarea
            id="offer-uri"
            style={s.textarea}
            value={offerUri}
            onChange={(e) => { setOfferUri(e.target.value); setState({ status: 'idle' }) }}
            placeholder="openid-credential-offer://?credential_offer_uri=..."
            rows={4}
            disabled={state.status === 'receiving'}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Status feedback */}
      {state.status === 'error' && (
        <div style={s.errBox}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={s.errTitle}>{state.error}</p>
            {state.detail && <p style={s.errDetail}>{state.detail}</p>}
          </div>
        </div>
      )}

      {state.status === 'success' && (
        <div style={s.successBox}>
          <div style={s.successIconWrap}>✅</div>
          <div>
            <p style={s.successTitle}>Credential received!</p>
            <p style={s.successVct}>{state.vct}</p>
          </div>
        </div>
      )}

      {/* CTA button */}
      <button
        style={{ ...s.btn, ...(isDisabled ? s.btnDisabled : {}) }}
        onClick={() => void handleReceive()}
        disabled={isDisabled}
      >
        {state.status === 'receiving' ? (
          <>
            <div style={s.btnSpinner} />
            Receiving…
          </>
        ) : (
          <>
            <span style={{ fontSize: 15 }}>↓</span>
            Receive into Wallet
          </>
        )}
      </button>

      {/* Privacy note */}
      <div style={s.privacyNote}>
        <span style={{ fontSize: 12 }}>🔒</span>
        <span>Your private key never leaves this browser.</span>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 14 },

  headingRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 },
  headingIcon: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    background: 'rgba(198,19,106,0.1)', border: '1px solid rgba(198,19,106,0.22)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, color: RED, fontWeight: 700,
  },
  heading: { fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' },
  subheading: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.07em' },

  description: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 },

  code: {
    fontSize: 10,
    background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 4,
    color: PINK, fontFamily: "'JetBrains Mono','Fira Code',monospace",
    border: '1px solid rgba(198,19,106,0.2)',
  },

  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 },

  textareaWrap: {
    borderRadius: 10, border: '1px solid rgba(198,19,106,0.22)',
    overflow: 'hidden', background: 'rgba(0,0,0,0.3)',
    transition: 'border-color 0.15s',
  },
  textarea: {
    width: '100%', background: 'transparent',
    border: 'none', outline: 'none',
    color: 'rgba(255,255,255,0.7)', padding: '10px 12px',
    fontSize: 11, fontFamily: "'JetBrains Mono','Fira Code',monospace",
    resize: 'vertical', lineHeight: 1.6,
  },

  // Error
  errBox: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.22)',
    borderRadius: 10, padding: '10px 12px',
  },
  errTitle:  { fontSize: 12, color: '#fca5a5', fontWeight: 700 },
  errDetail: { fontSize: 11, color: '#f87171', marginTop: 3, lineHeight: 1.5 },

  // Success
  successBox: {
    display: 'flex', gap: 12, alignItems: 'center',
    background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.22)',
    borderRadius: 10, padding: '12px 14px',
  },
  successIconWrap: { fontSize: 22, flexShrink: 0 },
  successTitle: { fontSize: 13, color: '#86efac', fontWeight: 700 },
  successVct: { fontSize: 10, color: '#4ade80', fontFamily: 'monospace', marginTop: 2 },

  // Button
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 16px',
    background: `linear-gradient(135deg, ${PINK} 0%, ${RED} 100%)`,
    border: 'none', borderRadius: 999,
    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
    boxShadow: '0 6px 20px -6px rgba(232,61,111,0.55)',
    transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
    letterSpacing: '0.01em',
  },
  btnDisabled: {
    opacity: 0.35, cursor: 'not-allowed',
    boxShadow: 'none', background: 'rgba(255,255,255,0.1)',
  },
  btnSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    animation: 'spin 0.7s linear infinite',
  },

  // Privacy note
  privacyNote: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    fontSize: 10, color: 'rgba(255,255,255,0.2)',
  },
}
