import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { WalletPageMessage } from '../background/service-worker'
import { getOrCreateAgent } from '../credo/lazy-agent'
import { isDisplayableLogo } from '../oid4vci/credential-display'
import { transactionCodeError } from '../oid4vci/offer-preview'
import {
  loadPendingOffer,
  loadPendingRequest,
  settlePendingOffer,
  settlePendingRequest,
  type PendingRequest,
} from '../wallet/pending-items'
import { formatOfferExpiry, type ItemSource, type PendingOffer } from '../wallet/pending-offer'
import { RECEIVE_STATUS_KEY, WALLET_STATUS_KEY } from '../wallet/storage-keys'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import { createPendingFlow, type FlowStatus, type OfferReview, type PresentationReview } from './pending-flow'

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }

/** The page that handed the item over only passes it on; it doesn't vouch for the issuer or verifier. */
const openedFrom = (from: ItemSource | undefined) => from?.origin ?? 'Pasted into the wallet'

export const WalletPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search)
  const offer = params.get('offer')
  const request = params.get('request')
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [initMs, setInitMs] = useState<number | null>(null)
  const [flow, setFlow] = useState<FlowStatus>({ state: 'idle' })
  const [offerReview, setOfferReview] = useState<OfferReview | null>(null)
  const [heldOffer, setHeldOffer] = useState<PendingOffer | null>(null)
  const [offerAccess, setOfferAccess] = useState<string[]>([])
  const [txCode, setTxCode] = useState('')
  const [presentation, setPresentation] = useState<PresentationReview | null>(null)
  const [heldRequest, setHeldRequest] = useState<PendingRequest | null>(null)
  const [requestAccess, setRequestAccess] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const currentOffer = useRef<PendingOffer | null>(null)
  const currentRequest = useRef<PendingRequest | null>(null)
  const pending = useMemo(
    () =>
      createPendingFlow(
        {
          setFlow,
          setOfferReview,
          setHeldOffer,
          setOfferAccess,
          setTxCode,
          setPresentation,
          setHeldRequest,
          setRequestAccess,
          setNotice,
        },
        { offer: currentOffer, request: currentRequest },
      ),
    [],
  )

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    // The service worker keeps this window for later requests. Registered before the first read of
    // the pending items, so a request stored while the agent starts is not missed.
    const onMessage = (message: WalletPageMessage) => {
      if (message?.type !== 'PENDING_UPDATED' || cancelled) return
      void (async () => pending.openPending(await loadPendingOffer(), await loadPendingRequest(), isCancelled))()
    }
    chrome.runtime.onMessage.addListener(onMessage)

    void (async () => {
      try {
        const started = performance.now()
        const agent = await getOrCreateAgent()
        await syncCredentialSummaryCache(agent)
        await chrome.storage.local.set({ [WALLET_STATUS_KEY]: { state: 'ready' } })
        if (cancelled) return
        setInitMs(Math.round(performance.now() - started))
        setStatus({ state: 'ready' })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Wallet initialization failed'
        await chrome.storage.local.set({ [WALLET_STATUS_KEY]: { state: 'error', message } })
        if (cancelled) return
        setStatus({ state: 'error', message })
        // The sites waiting for the pending items learn that the wallet cannot handle them.
        const [pendingOffer, pendingRequest] = await Promise.all([loadPendingOffer(), loadPendingRequest()])
        if (pendingOffer) await settlePendingOffer(pendingOffer.offerUri, { state: 'error', message }, true)
        else await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'error', message } })
        if (pendingRequest) await settlePendingRequest(pendingRequest.requestUri, { state: 'error', message }, true)
        return
      }

      if (cancelled) return
      await pending.openPending(
        offer ? { offerUri: offer } : await loadPendingOffer(),
        request ? { requestUri: request } : await loadPendingRequest(),
        isCancelled,
      )
    })()
    return () => {
      cancelled = true
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [offer, request, pending])

  const codeError = offerReview ? transactionCodeError(txCode, offerReview.preview.txCode) : null

  return (
    <main style={page.main}>
      <h1 style={page.title}>Heka Wallet</h1>
      <p id="credo-status" data-init-ms={initMs ?? undefined} style={page.status}>
        {status.state === 'loading' && 'Starting the wallet…'}
        {status.state === 'ready' && 'Wallet ready'}
        {status.state === 'error' && status.message}
      </p>
      {notice && (
        <p id="wallet-notice" style={page.notice}>
          {notice}{' '}
          <button type="button" style={page.dismiss} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
      {flow.state !== 'idle' && (
        <p id="wallet-flow" style={page.flow}>
          {flow.state === 'working' && 'Working…'}
          {flow.state === 'done' && flow.message}
          {flow.state === 'error' && flow.message}
        </p>
      )}
      {flow.state === 'done' && flow.signedBy && flow.signedBy.length > 0 && (
        <dl style={page.list}>
          <dt>Signed by</dt>
          <dd style={page.mono}>{flow.signedBy.join(', ')}</dd>
        </dl>
      )}
      {offerAccess.length > 0 && heldOffer && !offerReview && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Allow access to the issuer</h2>
          <p style={page.flow}>
            Reading this offer contacts {offerAccess.join(', ')}. Allow the wallet to contact it, then review the offer.
            Nothing is stored until you accept.
          </p>
          <dl style={page.list}>
            <dt>Opened from</dt>
            <dd>{openedFrom(heldOffer.from)}</dd>
          </dl>
          <div style={page.actions}>
            <button
              type="button"
              style={page.button}
              onClick={() => void pending.allowOfferAccess(heldOffer, offerAccess)}
            >
              Review offer
            </button>
            <button type="button" style={page.secondary} onClick={() => void pending.declineOffer(heldOffer)}>
              Decline
            </button>
          </div>
        </section>
      )}
      {offerReview && flow.state !== 'done' && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Review credential offer</h2>
          <p style={page.flow}>Nothing is stored until you accept.</p>
          <dl style={page.list}>
            <dt>Issuer</dt>
            <dd style={page.strong}>{offerReview.preview.issuerOrigin}</dd>
            {offerReview.preview.issuerUrl !== offerReview.preview.issuerOrigin && (
              <>
                <dt>Issuer URL</dt>
                <dd>{offerReview.preview.issuerUrl}</dd>
              </>
            )}
            {offerReview.preview.issuerName && (
              <>
                <dt>Name</dt>
                <dd>{offerReview.preview.issuerName} (self-declared, not verified)</dd>
              </>
            )}
            <dt>Opened from</dt>
            <dd>{openedFrom(offerReview.from)}</dd>
            {offerReview.expiresAt && (
              <>
                <dt>Expires</dt>
                <dd>{formatOfferExpiry(offerReview.expiresAt)}</dd>
              </>
            )}
            {offerReview.preview.credentials.map((credential) => (
              <React.Fragment key={credential.type}>
                <dt>Credential</dt>
                <dd>
                  {credential.logo && isDisplayableLogo(credential.logo.uri) && (
                    <img src={credential.logo.uri} alt={credential.logo.altText ?? ''} style={page.logo} />
                  )}
                  <span
                    style={
                      credential.backgroundColor
                        ? { ...page.chip, background: credential.backgroundColor, color: credential.textColor }
                        : undefined
                    }
                  >
                    {credential.name}
                  </span>
                  <br />
                  {credential.type}
                </dd>
              </React.Fragment>
            ))}
          </dl>
          {offerReview.preview.txCode && (
            <label style={page.label}>
              {offerReview.preview.txCode.description}
              <input
                value={txCode}
                inputMode={offerReview.preview.txCode.numeric ? 'numeric' : 'text'}
                autoComplete="one-time-code"
                maxLength={offerReview.preview.txCode.length}
                onChange={(event) => setTxCode(event.target.value)}
                style={page.input}
              />
            </label>
          )}
          <div style={page.actions}>
            <button
              type="button"
              style={page.button}
              onClick={() => void pending.acceptOffer(offerReview, txCode)}
              disabled={flow.state === 'working' || codeError !== null}
            >
              Accept credential
            </button>
            <button
              type="button"
              style={page.secondary}
              onClick={() => void pending.declineOffer(offerReview)}
              disabled={flow.state === 'working'}
            >
              Decline
            </button>
          </div>
        </section>
      )}
      {requestAccess.length > 0 && heldRequest && !presentation && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Allow access to the verifier</h2>
          <p style={page.flow}>
            Reading this presentation request contacts {requestAccess.join(', ')}. Allow the wallet to contact it before
            reviewing the request.
          </p>
          <dl style={page.list}>
            <dt>Opened from</dt>
            <dd>{openedFrom(heldRequest.from)}</dd>
          </dl>
          <div style={page.actions}>
            <button
              type="button"
              style={page.button}
              onClick={() => void pending.allowRequestAccess(heldRequest, requestAccess)}
            >
              Review request
            </button>
            <button type="button" style={page.secondary} onClick={() => void pending.declinePresentation(heldRequest)}>
              Decline
            </button>
          </div>
        </section>
      )}
      {presentation && flow.state !== 'done' && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Review presentation</h2>
          <dl style={page.list}>
            <dt>Verifier</dt>
            <dd style={page.strong}>
              {presentation.preview.verifier}
              {presentation.preview.clientIdPrefix &&
                ` (${presentation.preview.clientIdPrefix}${presentation.preview.clientIdVerified ? '' : ', not verified'})`}
            </dd>
            {presentation.preview.responseOrigin && (
              <>
                <dt>Sends to</dt>
                <dd>{presentation.preview.responseOrigin}</dd>
              </>
            )}
            {presentation.preview.selfDeclaredName && (
              <>
                <dt>Name</dt>
                <dd>{presentation.preview.selfDeclaredName} (self-declared, not verified)</dd>
              </>
            )}
            {presentation.preview.origin && (
              <>
                <dt>Origin</dt>
                <dd>{presentation.preview.origin}</dd>
              </>
            )}
            <dt>Opened from</dt>
            <dd>{openedFrom(presentation.from)}</dd>
            {presentation.preview.credentials.map((credential) => (
              <React.Fragment key={credential.name}>
                <dt>Credential</dt>
                <dd>{credential.name}</dd>
                <dt>Will share</dt>
                <dd>{credential.claims.length > 0 ? credential.claims.join(', ') : 'No claims selected'}</dd>
              </React.Fragment>
            ))}
          </dl>
          <div style={page.actions}>
            <button
              type="button"
              style={page.button}
              onClick={() => void pending.present(presentation)}
              disabled={flow.state === 'working'}
            >
              Present credential
            </button>
            <button
              type="button"
              style={page.secondary}
              onClick={() => void pending.declinePresentation(presentation)}
              disabled={flow.state === 'working'}
            >
              Decline
            </button>
          </div>
        </section>
      )}
      {heldOffer && !offerReview && offerAccess.length === 0 && flow.state === 'error' && (
        <div style={page.actions}>
          <button type="button" style={page.button} onClick={() => void pending.openOffer(heldOffer)}>
            Retry offer
          </button>
        </div>
      )}
      {heldRequest && !presentation && requestAccess.length === 0 && flow.state === 'error' && (
        <div style={page.actions}>
          <button type="button" style={page.button} onClick={() => void pending.openPresentation(heldRequest)}>
            Retry presentation
          </button>
          <button type="button" style={page.secondary} onClick={() => void pending.declinePresentation(heldRequest)}>
            Decline
          </button>
        </div>
      )}
    </main>
  )
}

const page: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    padding: 32,
    maxWidth: 640,
    margin: '0 auto',
    color: '#fff',
    background: '#100b0e',
    minHeight: '100vh',
  },
  title: { fontSize: 28, marginBottom: 8 },
  status: { fontSize: 16, color: '#86efac' },
  flow: { marginTop: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 },
  notice: { marginTop: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(198,19,106,0.15)', lineHeight: 1.5 },
  dismiss: { border: 'none', background: 'transparent', color: '#f9a8d4', cursor: 'pointer', fontWeight: 700 },
  strong: { fontWeight: 700 },
  mono: { fontFamily: 'monospace', wordBreak: 'break-all' },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.06)',
  },
  cardTitle: { fontSize: 18, margin: '0 0 8px' },
  logo: { width: 32, height: 32, objectFit: 'contain', verticalAlign: 'middle', marginRight: 8 },
  chip: { padding: '2px 8px', borderRadius: 6 },
  list: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', margin: '12px 0' },
  label: { display: 'block', marginTop: 12, fontSize: 14 },
  input: {
    display: 'block',
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    background: '#1c1418',
    color: '#fff',
    fontSize: 18,
    letterSpacing: 4,
  },
  actions: { display: 'flex', gap: 8, marginTop: 16 },
  button: {
    padding: '10px 18px',
    border: 'none',
    borderRadius: 999,
    background: '#c6136a',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
