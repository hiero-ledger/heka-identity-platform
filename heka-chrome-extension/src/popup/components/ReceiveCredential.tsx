import React, { useState } from 'react'


interface Props {
  initialOfferUri?: string
  onReceived: () => void
}

type ReceiveState = { status: 'idle' } | { status: 'error'; error: string }

const PINK = '#c6136a'
const RED  = '#e83d6f'

export const ReceiveCredential: React.FC<Props> = ({ initialOfferUri, onReceived }) => {
  const [offerUri, setOfferUri] = useState(initialOfferUri ?? '')
  const [state, setState] = useState<ReceiveState>({ status: 'idle' })

  const handleReceive = () => {
    const trimmed = offerUri.trim()
    if (!trimmed.startsWith('openid-credential-offer:')) {
      setState({ status: 'error', error: 'Paste an openid-credential-offer URI' })
      return
    }
    void chrome.runtime.sendMessage({ type: 'RECEIVE_OFFER', offerUri: trimmed })
    onReceived()
  }

  const isDisabled = !offerUri.trim()

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
        Paste the <code style={s.code}>openid-credential-offer://</code> URI from Heka.
        The wallet page receives it. This popup never loads the credential agent.
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
            disabled={false}
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
          </div>
        </div>
      )}

      <button
        style={{ ...s.btn, ...(isDisabled ? s.btnDisabled : {}) }}
        onClick={handleReceive}
        disabled={isDisabled}
      >
        <span style={{ fontSize: 15 }}>↓</span>
        Open in wallet
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
  errTitle: { fontSize: 12, color: '#fca5a5', fontWeight: 700 },

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

  // Privacy note
  privacyNote: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    fontSize: 10, color: 'rgba(255,255,255,0.2)',
  },
}
