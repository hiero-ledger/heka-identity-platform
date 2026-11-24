import type { DcqlCredentialsForRequest } from '@credo-ts/core'
import React, { useEffect, useRef, useState } from 'react'

import type { WalletPageMessage } from '../background/service-worker'
import { getOrCreateAgent } from '../credo/lazy-agent'
import { isDisplayableLogo } from '../oid4vci/credential-display'
import { describeCredentialOffer, transactionCodeError, type OfferPreview } from '../oid4vci/offer-preview'
import {
  acceptCredentialOffer,
  CredentialReceiveError,
  receiveResultMessage,
  resolveIncomingOffer,
  type ResolvedCredentialOffer,
} from '../oid4vci/receive'
import { handlePresentationRequest, submitPresentation, type ResolvedPresentationRequest } from '../oid4vp/present'
import { presentErrorMessage } from '../oid4vp/present-errors'
import { describePresentation, type PresentationPreview } from '../oid4vp/presentation-preview'
import { needsHostGrant, requestOptionalHostAccess } from '../wallet/host-access'
import {
  loadPendingOffer,
  loadPendingRequest,
  reportPendingOffer,
  settlePendingOffer,
  settlePendingRequest,
} from '../wallet/pending-items'
import {
  formatOfferExpiry,
  issuerRejectedExpiredOffer,
  pendingOfferExpired,
  type PendingOffer,
} from '../wallet/pending-offer'
import { RECEIVE_STATUS_KEY, WALLET_STATUS_KEY } from '../wallet/storage-keys'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }
type FlowStatus =
  { state: 'idle' } | { state: 'working' } | { state: 'done'; message: string } | { state: 'error'; message: string }

interface OfferReview extends PendingOffer {
  resolved: ResolvedCredentialOffer
  preview: OfferPreview
}

interface PresentationReview {
  resolved: ResolvedPresentationRequest
  selectedCredentials: DcqlCredentialsForRequest
  preview: PresentationPreview
}

/**
 * The offer or request the page handles now, one object per opening. A newer one replaces it; an
 * async step that finds itself replaced leaves the page state alone.
 */
type Current<T> = React.MutableRefObject<T | null>

export const WalletPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search)
  const offer = params.get('offer')
  const request = params.get('request')
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [initMs, setInitMs] = useState<number | null>(null)
  const [flow, setFlow] = useState<FlowStatus>({ state: 'idle' })
  const [offerReview, setOfferReview] = useState<OfferReview | null>(null)
  const [heldOffer, setHeldOffer] = useState<PendingOffer | null>(null)
  const [offerNeedsAccess, setOfferNeedsAccess] = useState(false)
  const [txCode, setTxCode] = useState('')
  const [presentation, setPresentation] = useState<PresentationReview | null>(null)
  const [heldRequest, setHeldRequest] = useState<string | null>(null)
  const [requestNeedsAccess, setRequestNeedsAccess] = useState(false)
  const currentOffer = useRef<PendingOffer | null>(null)
  const currentRequest = useRef<{ requestUri: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    // PENDING_UPDATED also comes when only the other pending item changed, or from the popup's "Open
    // wallet", so an item already on the page is not opened again.
    const openPending = async (pendingOffer: PendingOffer | null, presentationRequest: string | null) => {
      if (pendingOffer && pendingOffer.offerUri !== currentOffer.current?.offerUri) {
        setTxCode('')
        await openOffer(pendingOffer, currentOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)
      }
      if (cancelled) return
      if (presentationRequest && presentationRequest !== currentRequest.current?.requestUri) {
        await openPresentation(
          presentationRequest,
          currentRequest,
          setFlow,
          setPresentation,
          setHeldRequest,
          setRequestNeedsAccess,
        )
      }
    }
    // The service worker keeps this window for later requests. Registered before the first read of
    // the pending items, so a request stored while the agent starts is not missed.
    const onMessage = (message: WalletPageMessage) => {
      if (message?.type !== 'PENDING_UPDATED' || cancelled) return
      void (async () => openPending(await loadPendingOffer(), await loadPendingRequest()))()
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
        await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'error', message } })
        return
      } finally {
        if (!cancelled) void chrome.runtime.sendMessage({ type: 'WALLET_TASK_DONE' })
      }

      if (cancelled) return
      await openPending(offer ? { offerUri: offer } : await loadPendingOffer(), request ?? (await loadPendingRequest()))
    })()
    return () => {
      cancelled = true
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [offer, request])

  const onGrantOfferAccess = async () => {
    if (!heldOffer) return
    const granted = await requestOptionalHostAccess()
    if (currentOffer.current?.offerUri !== heldOffer.offerUri) return
    if (!granted) {
      setFlow({ state: 'error', message: 'Remote issuer access was not allowed. The offer is still saved.' })
      return
    }
    await openOffer(heldOffer, currentOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)
  }

  const onAcceptOffer = async () => {
    if (!offerReview) return
    const handling = currentOffer.current
    if (handling?.offerUri !== offerReview.offerUri) return
    const replaced = () => currentOffer.current !== handling
    const codeError = transactionCodeError(txCode, offerReview.preview.txCode)
    if (codeError) {
      setFlow({ state: 'error', message: codeError })
      return
    }
    if (await needsHostGrant(offerReview.offerUri)) {
      const granted = await requestOptionalHostAccess()
      if (replaced()) return
      if (!granted) {
        setFlow({ state: 'error', message: 'Remote issuer access was not allowed. The offer is still saved.' })
        return
      }
    }
    if (replaced()) return
    setFlow({ state: 'working' })
    try {
      const { received, deferred } = await acceptCredentialOffer(
        offerReview.resolved,
        offerReview.preview.txCode ? txCode.trim() : undefined,
      )
      const message = receiveResultMessage(received, deferred)
      // Only a stored credential is 'done'; the Heka page treats 'done' as received.
      const state = received > 0 ? 'done' : 'error'
      await settlePendingOffer(offerReview.offerUri, { state, message })
      if (replaced()) return
      currentOffer.current = null
      setFlow({ state, message })
      setOfferReview(null)
      setHeldOffer(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Credential receive failed'
      if (issuerRejectedExpiredOffer(message)) {
        await settlePendingOffer(offerReview.offerUri, {
          state: 'error',
          message: 'This credential offer expired. Request a new one in Heka.',
        })
        if (replaced()) return
        currentOffer.current = null
        setHeldOffer(null)
        setOfferReview(null)
        setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
        return
      }
      if (error instanceof CredentialReceiveError && !error.retryable) {
        const text = `${message} The issuer has already redeemed this offer, so it cannot be retried. Request a new credential in Heka.`
        await settlePendingOffer(offerReview.offerUri, { state: 'error', message: text })
        if (replaced()) return
        currentOffer.current = null
        setHeldOffer(null)
        setOfferReview(null)
        setFlow({ state: 'error', message: text })
        return
      }
      const text = `${message} The offer is still saved. Open the wallet page to retry.`
      await reportPendingOffer(offerReview.offerUri, { state: 'error', message: text })
      if (replaced()) return
      setFlow({ state: 'error', message: text })
    }
  }

  const onDeclineOffer = async () => {
    const declined = offerReview ?? heldOffer
    if (!declined || currentOffer.current?.offerUri !== declined.offerUri) return
    currentOffer.current = null
    setOfferReview(null)
    setHeldOffer(null)
    setOfferNeedsAccess(false)
    setFlow({ state: 'error', message: 'Credential offer declined.' })
    await settlePendingOffer(declined.offerUri, { state: 'error', message: 'Credential offer declined.' })
  }

  const onGrantRequestAccess = async () => {
    if (!heldRequest) return
    const granted = await requestOptionalHostAccess()
    if (currentRequest.current?.requestUri !== heldRequest) return
    if (!granted) {
      setFlow({ state: 'error', message: 'Remote verifier access was not allowed. The request is still saved.' })
      return
    }
    await openPresentation(heldRequest, currentRequest, setFlow, setPresentation, setHeldRequest, setRequestNeedsAccess)
  }

  const onSubmitPresentation = async () => {
    if (!presentation || !heldRequest) return
    const handling = currentRequest.current
    if (handling?.requestUri !== heldRequest) return
    const replaced = () => currentRequest.current !== handling
    if (await needsHostGrant(heldRequest)) {
      const granted = await requestOptionalHostAccess()
      if (replaced()) return
      if (!granted) {
        setFlow({ state: 'error', message: 'Remote verifier access was not allowed. The request is still saved.' })
        return
      }
    }
    if (replaced()) return
    setFlow({ state: 'working' })
    try {
      const result = await submitPresentation(presentation.resolved, presentation.selectedCredentials)
      if (result.ok) await settlePendingRequest(heldRequest)
      if (replaced()) return
      const message = result.ok ? 'Presentation submitted.' : 'The verifier rejected the presentation.'
      setFlow({ state: result.ok ? 'done' : 'error', message })
      setPresentation(null)
      if (result.ok) {
        currentRequest.current = null
        setHeldRequest(null)
      }
    } catch (error: unknown) {
      if (replaced()) return
      const message = error instanceof Error ? error.message : 'Presentation failed'
      setFlow({
        state: 'error',
        message: `${message} The request is still saved. Retry when the verifier is reachable.`,
      })
    }
  }

  const onDeclinePresentation = async () => {
    const declined = heldRequest
    if (!declined || currentRequest.current?.requestUri !== declined) return
    currentRequest.current = null
    setPresentation(null)
    setHeldRequest(null)
    setRequestNeedsAccess(false)
    setFlow({ state: 'error', message: 'Presentation request declined.' })
    await settlePendingRequest(declined)
  }

  const codeError = offerReview ? transactionCodeError(txCode, offerReview.preview.txCode) : null

  return (
    <main style={page.main}>
      <h1 style={page.title}>Heka Wallet</h1>
      <p id="credo-status" data-init-ms={initMs ?? undefined} style={page.status}>
        {status.state === 'loading' && 'Starting the wallet…'}
        {status.state === 'ready' && 'Wallet ready'}
        {status.state === 'error' && status.message}
      </p>
      {flow.state !== 'idle' && (
        <p id="wallet-flow" style={page.flow}>
          {flow.state === 'working' && 'Working…'}
          {flow.state === 'done' && flow.message}
          {flow.state === 'error' && flow.message}
        </p>
      )}
      {offerNeedsAccess && heldOffer && !offerReview && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Allow remote issuer access</h2>
          <p style={page.flow}>
            This offer is on an HTTPS issuer. Allow network access, then review it. Nothing is stored until you accept.
          </p>
          <div style={page.actions}>
            <button type="button" style={page.button} onClick={() => void onGrantOfferAccess()}>
              Review offer
            </button>
            <button type="button" style={page.secondary} onClick={() => void onDeclineOffer()}>
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
            <dd>{offerReview.preview.issuerName}</dd>
            <dt>Issuer URL</dt>
            <dd>{offerReview.preview.issuerUrl}</dd>
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
              onClick={() => void onAcceptOffer()}
              disabled={flow.state === 'working' || codeError !== null}
            >
              Accept credential
            </button>
            <button
              type="button"
              style={page.secondary}
              onClick={() => void onDeclineOffer()}
              disabled={flow.state === 'working'}
            >
              Decline
            </button>
          </div>
        </section>
      )}
      {requestNeedsAccess && heldRequest && !presentation && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Allow remote verifier access</h2>
          <p style={page.flow}>
            This presentation request contacts an HTTPS verifier. Allow network access before reviewing it.
          </p>
          <div style={page.actions}>
            <button type="button" style={page.button} onClick={() => void onGrantRequestAccess()}>
              Review request
            </button>
            <button type="button" style={page.secondary} onClick={() => void onDeclinePresentation()}>
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
            <dd>{presentation.preview.verifier}</dd>
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
            <dt>Origin</dt>
            <dd>{presentation.preview.origin}</dd>
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
              onClick={() => void onSubmitPresentation()}
              disabled={flow.state === 'working'}
            >
              Present credential
            </button>
            <button
              type="button"
              style={page.secondary}
              onClick={() => void onDeclinePresentation()}
              disabled={flow.state === 'working'}
            >
              Decline
            </button>
          </div>
        </section>
      )}
      {heldOffer && !offerReview && !offerNeedsAccess && flow.state === 'error' && (
        <div style={page.actions}>
          <button
            type="button"
            style={page.button}
            onClick={() =>
              void openOffer(heldOffer, currentOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)
            }
          >
            Retry offer
          </button>
        </div>
      )}
      {heldRequest && !presentation && !requestNeedsAccess && flow.state === 'error' && (
        <div style={page.actions}>
          <button
            type="button"
            style={page.button}
            onClick={() =>
              void openPresentation(
                heldRequest,
                currentRequest,
                setFlow,
                setPresentation,
                setHeldRequest,
                setRequestNeedsAccess,
              )
            }
          >
            Retry presentation
          </button>
          <button type="button" style={page.secondary} onClick={() => void onDeclinePresentation()}>
            Decline
          </button>
        </div>
      )}
    </main>
  )
}

async function openOffer(
  held: PendingOffer,
  current: Current<PendingOffer>,
  setFlow: (status: FlowStatus) => void,
  setOfferReview: (value: OfferReview | null) => void,
  setHeldOffer: (value: PendingOffer | null) => void,
  setOfferNeedsAccess: (value: boolean) => void,
): Promise<void> {
  const handling = { ...held }
  current.current = handling
  const replaced = () => current.current !== handling
  setOfferReview(null)

  if (pendingOfferExpired(held)) {
    current.current = null
    setHeldOffer(null)
    setOfferNeedsAccess(false)
    const message = `This offer expired at ${formatOfferExpiry(held.expiresAt ?? '')}. Request a new credential in Heka.`
    setFlow({ state: 'error', message })
    await settlePendingOffer(held.offerUri, {
      state: 'error',
      message: 'This credential offer expired. Request a new one in Heka.',
    })
    return
  }

  setHeldOffer(held)
  const needsGrant = await needsHostGrant(held.offerUri)
  if (replaced()) return
  if (needsGrant) {
    setOfferNeedsAccess(true)
    setFlow({ state: 'idle' })
    return
  }

  setOfferNeedsAccess(false)
  setFlow({ state: 'working' })
  try {
    const resolved = await resolveIncomingOffer(held.offerUri)
    if (replaced()) return
    setOfferReview({ ...held, resolved, preview: describeCredentialOffer(resolved) })
    setFlow({ state: 'idle' })
  } catch (error: unknown) {
    if (replaced()) return
    const message = error instanceof Error ? error.message : 'Could not read this offer'
    if (issuerRejectedExpiredOffer(message)) {
      current.current = null
      setHeldOffer(null)
      setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
      await settlePendingOffer(held.offerUri, {
        state: 'error',
        message: 'This credential offer expired. Request a new one in Heka.',
      })
      return
    }
    const text = `${message} The offer is still saved. Open the wallet page to retry.`
    setFlow({ state: 'error', message: text })
    await reportPendingOffer(held.offerUri, { state: 'error', message: text })
  }
}

async function openPresentation(
  requestUri: string,
  current: Current<{ requestUri: string }>,
  setFlow: (status: FlowStatus) => void,
  setPresentation: (value: PresentationReview | null) => void,
  setHeldRequest: (value: string | null) => void,
  setRequestNeedsAccess: (value: boolean) => void,
): Promise<void> {
  const handling = { requestUri }
  current.current = handling
  const replaced = () => current.current !== handling
  setPresentation(null)
  setHeldRequest(requestUri)
  const needsGrant = await needsHostGrant(requestUri)
  if (replaced()) return
  if (needsGrant) {
    setRequestNeedsAccess(true)
    setFlow({ state: 'idle' })
    return
  }

  setRequestNeedsAccess(false)
  setFlow({ state: 'working' })
  try {
    const resolved = await handlePresentationRequest(requestUri)
    if (replaced()) return
    setPresentation({
      ...resolved,
      preview: describePresentation(resolved.resolved, resolved.selectedCredentials),
    })
    setFlow({ state: 'idle' })
  } catch (error: unknown) {
    if (replaced()) return
    setFlow({ state: 'error', message: presentErrorMessage(error) })
  }
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
