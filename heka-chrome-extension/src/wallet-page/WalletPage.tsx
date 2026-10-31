import type { DcqlCredentialsForRequest } from '@credo-ts/core'
import React, { useEffect, useState } from 'react'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { describeCredentialOffer, transactionCodeError, type OfferPreview } from '../oid4vci/offer-preview'
import { acceptCredentialOffer, resolveIncomingOffer, type ResolvedCredentialOffer } from '../oid4vci/receive'
import { handlePresentationRequest, submitPresentation, type ResolvedPresentationRequest } from '../oid4vp/present'
import { presentErrorMessage } from '../oid4vp/present-errors'
import { describePresentation, type PresentationPreview } from '../oid4vp/presentation-preview'
import { needsHostGrant, requestOptionalHostAccess } from '../wallet/host-access'
import {
  formatOfferExpiry,
  issuerRejectedExpiredOffer,
  pendingOfferExpired,
  readPendingOffer,
  type PendingOffer,
} from '../wallet/pending-offer'
import { PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }
type FlowStatus = { state: 'idle' } | { state: 'working' } | { state: 'done'; message: string } | { state: 'error'; message: string }

interface OfferReview extends PendingOffer {
  resolved: ResolvedCredentialOffer
  preview: OfferPreview
}

interface PresentationReview {
  resolved: ResolvedPresentationRequest
  selectedCredentials: DcqlCredentialsForRequest
  preview: PresentationPreview
}

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const started = performance.now()
        const agent = await getOrCreateAgent()
        await syncCredentialSummaryCache(agent)
        if (cancelled) return
        setInitMs(Math.round(performance.now() - started))
        setStatus({ state: 'ready' })
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Wallet initialization failed'
        setStatus({ state: 'error', message })
        await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'error', message } })
        return
      } finally {
        if (!cancelled) void chrome.runtime.sendMessage({ type: 'WALLET_TASK_DONE' })
      }

      if (cancelled) return
      const pendingOffer = offer ? { offerUri: offer } : await loadPendingOffer()
      if (pendingOffer) await openOffer(pendingOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)
      if (cancelled) return
      const presentationRequest = request ?? (await peekPendingRequest())
      if (presentationRequest) {
        await openPresentation(presentationRequest, setFlow, setPresentation, setHeldRequest, setRequestNeedsAccess)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [offer, request])

  const onGrantOfferAccess = async () => {
    if (!heldOffer) return
    const granted = await requestOptionalHostAccess()
    if (!granted) {
      setFlow({ state: 'error', message: 'Remote issuer access was not allowed. The offer is still saved.' })
      return
    }
    await openOffer(heldOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)
  }

  const onAcceptOffer = async () => {
    if (!offerReview) return
    const codeError = transactionCodeError(txCode, offerReview.preview.txCode)
    if (codeError) {
      setFlow({ state: 'error', message: codeError })
      return
    }
    if (await needsHostGrant(offerReview.offerUri)) {
      const granted = await requestOptionalHostAccess()
      if (!granted) {
        setFlow({ state: 'error', message: 'Remote issuer access was not allowed. The offer is still saved.' })
        return
      }
    }
    setFlow({ state: 'working' })
    try {
      const credentials = await acceptCredentialOffer(
        offerReview.resolved,
        offerReview.preview.txCode ? txCode.trim() : undefined,
      )
      const message = `Received ${credentials.length} credential${credentials.length === 1 ? '' : 's'}.`
      setFlow({ state: 'done', message })
      setOfferReview(null)
      setHeldOffer(null)
      await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'done', message } })
      await chrome.storage.local.remove(PENDING_OFFER_KEY)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Credential receive failed'
      if (issuerRejectedExpiredOffer(message)) {
        setHeldOffer(null)
        setOfferReview(null)
        setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
        await chrome.storage.local.remove(PENDING_OFFER_KEY)
        await chrome.storage.local.set({
          [RECEIVE_STATUS_KEY]: { state: 'error', message: 'This credential offer expired. Request a new one in Heka.' },
        })
        return
      }
      setFlow({ state: 'error', message: `${message} The offer is still saved. Open the wallet page to retry.` })
      await chrome.storage.local.set({
        [PENDING_OFFER_KEY]: storedOffer(offerReview),
        [RECEIVE_STATUS_KEY]: {
          state: 'error',
          message: `${message} The offer is still saved. Open the wallet page to retry.`,
        },
      })
    }
  }

  const onDeclineOffer = async () => {
    setOfferReview(null)
    setHeldOffer(null)
    setOfferNeedsAccess(false)
    setFlow({ state: 'error', message: 'Credential offer declined.' })
    await chrome.storage.local.remove(PENDING_OFFER_KEY)
    await chrome.storage.local.set({
      [RECEIVE_STATUS_KEY]: { state: 'error', message: 'Credential offer declined.' },
    })
  }

  const onGrantRequestAccess = async () => {
    if (!heldRequest) return
    const granted = await requestOptionalHostAccess()
    if (!granted) {
      setFlow({ state: 'error', message: 'Remote verifier access was not allowed. The request is still saved.' })
      return
    }
    await openPresentation(heldRequest, setFlow, setPresentation, setHeldRequest, setRequestNeedsAccess)
  }

  const onSubmitPresentation = async () => {
    if (!presentation || !heldRequest) return
    if (await needsHostGrant(heldRequest)) {
      const granted = await requestOptionalHostAccess()
      if (!granted) {
        setFlow({ state: 'error', message: 'Remote verifier access was not allowed. The request is still saved.' })
        return
      }
    }
    setFlow({ state: 'working' })
    try {
      const result = await submitPresentation(presentation.resolved, presentation.selectedCredentials)
      const message = result.ok ? 'Presentation submitted.' : 'The verifier rejected the presentation.'
      setFlow({ state: result.ok ? 'done' : 'error', message })
      setPresentation(null)
      if (result.ok) {
        setHeldRequest(null)
        await chrome.storage.local.remove(PENDING_REQUEST_KEY)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Presentation failed'
      setFlow({
        state: 'error',
        message: `${message} The request is still saved. Retry when the verifier is reachable.`,
      })
    }
  }

  const onDeclinePresentation = async () => {
    setPresentation(null)
    setHeldRequest(null)
    setRequestNeedsAccess(false)
    setFlow({ state: 'error', message: 'Presentation request declined.' })
    await chrome.storage.local.remove(PENDING_REQUEST_KEY)
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
                  {credential.name}
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
            <button type="button" style={page.button} onClick={() => void onAcceptOffer()} disabled={flow.state === 'working' || codeError !== null}>
              Accept credential
            </button>
            <button type="button" style={page.secondary} onClick={() => void onDeclineOffer()} disabled={flow.state === 'working'}>
              Decline
            </button>
          </div>
        </section>
      )}
      {requestNeedsAccess && heldRequest && !presentation && (
        <section style={page.card}>
          <h2 style={page.cardTitle}>Allow remote verifier access</h2>
          <p style={page.flow}>This presentation request contacts an HTTPS verifier. Allow network access before reviewing it.</p>
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
            <button type="button" style={page.button} onClick={() => void onSubmitPresentation()} disabled={flow.state === 'working'}>
              Present credential
            </button>
            <button type="button" style={page.secondary} onClick={() => void onDeclinePresentation()} disabled={flow.state === 'working'}>
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
            onClick={() => void openOffer(heldOffer, setFlow, setOfferReview, setHeldOffer, setOfferNeedsAccess)}
          >
            Retry offer
          </button>
        </div>
      )}
      {heldRequest && !presentation && !requestNeedsAccess && flow.state === 'error' && (
        <div style={page.actions}>
          <button type="button" style={page.button} onClick={() => void openPresentation(heldRequest, setFlow, setPresentation, setHeldRequest, setRequestNeedsAccess)}>
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

function storedOffer(offer: PendingOffer): PendingOffer {
  return offer.expiresAt ? { offerUri: offer.offerUri, expiresAt: offer.expiresAt } : { offerUri: offer.offerUri }
}

async function loadPendingOffer(): Promise<PendingOffer | null> {
  const stored = await chrome.storage.local.get(PENDING_OFFER_KEY)
  return readPendingOffer(stored[PENDING_OFFER_KEY])
}

async function peekPendingRequest(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_REQUEST_KEY)
  const pending = stored[PENDING_REQUEST_KEY]
  return typeof pending === 'string' && pending.length > 0 ? pending : null
}

async function openOffer(
  held: PendingOffer,
  setFlow: (status: FlowStatus) => void,
  setOfferReview: (value: OfferReview | null) => void,
  setHeldOffer: (value: PendingOffer | null) => void,
  setOfferNeedsAccess: (value: boolean) => void,
): Promise<void> {
  if (pendingOfferExpired(held)) {
    setHeldOffer(null)
    setOfferNeedsAccess(false)
    setOfferReview(null)
    const message = `This offer expired at ${formatOfferExpiry(held.expiresAt ?? '')}. Request a new credential in Heka.`
    setFlow({ state: 'error', message })
    await chrome.storage.local.remove(PENDING_OFFER_KEY)
    await chrome.storage.local.set({
      [RECEIVE_STATUS_KEY]: { state: 'error', message: 'This credential offer expired. Request a new one in Heka.' },
    })
    return
  }

  setHeldOffer(held)
  if (await needsHostGrant(held.offerUri)) {
    setOfferNeedsAccess(true)
    setFlow({ state: 'idle' })
    return
  }

  setOfferNeedsAccess(false)
  setFlow({ state: 'working' })
  try {
    const resolved = await resolveIncomingOffer(held.offerUri)
    setOfferReview({ ...held, resolved, preview: describeCredentialOffer(resolved) })
    setFlow({ state: 'idle' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not read this offer'
    if (issuerRejectedExpiredOffer(message)) {
      setHeldOffer(null)
      setOfferReview(null)
      setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
      await chrome.storage.local.remove(PENDING_OFFER_KEY)
      await chrome.storage.local.set({
        [RECEIVE_STATUS_KEY]: { state: 'error', message: 'This credential offer expired. Request a new one in Heka.' },
      })
      return
    }
    setFlow({ state: 'error', message: `${message} The offer is still saved. Open the wallet page to retry.` })
    await chrome.storage.local.set({
      [RECEIVE_STATUS_KEY]: {
        state: 'error',
        message: `${message} The offer is still saved. Open the wallet page to retry.`,
      },
    })
  }
}

async function openPresentation(
  requestUri: string,
  setFlow: (status: FlowStatus) => void,
  setPresentation: (value: PresentationReview | null) => void,
  setHeldRequest: (value: string | null) => void,
  setRequestNeedsAccess: (value: boolean) => void,
): Promise<void> {
  setHeldRequest(requestUri)
  if (await needsHostGrant(requestUri)) {
    setRequestNeedsAccess(true)
    setFlow({ state: 'idle' })
    return
  }

  setRequestNeedsAccess(false)
  setFlow({ state: 'working' })
  try {
    const resolved = await handlePresentationRequest(requestUri)
    setPresentation({
      ...resolved,
      preview: describePresentation(resolved.resolved, resolved.selectedCredentials),
    })
    setFlow({ state: 'idle' })
  } catch (error: unknown) {
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
