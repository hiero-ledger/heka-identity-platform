import type { DcqlCredentialsForRequest } from '@credo-ts/core'
import React, { useEffect, useState } from 'react'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { receiveCredentialOffer } from '../oid4vci/receive'
import { handlePresentationRequest, submitPresentation, type ResolvedPresentationRequest } from '../oid4vp/present'
import { PENDING_OFFER_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }
type FlowStatus = { state: 'idle' } | { state: 'working' } | { state: 'done'; message: string } | { state: 'error'; message: string }

export const WalletPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search)
  const offer = params.get('offer')
  const request = params.get('request')
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [initMs, setInitMs] = useState<number | null>(null)
  const [flow, setFlow] = useState<FlowStatus>({ state: 'idle' })
  const [presentation, setPresentation] = useState<{
    resolved: ResolvedPresentationRequest
    selectedCredentials: DcqlCredentialsForRequest
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const started = performance.now()
        await getOrCreateAgent()
        if (cancelled) return
        setInitMs(Math.round(performance.now() - started))
        setStatus({ state: 'ready' })
        const pendingOffer = offer ?? (await takePendingOffer())
        if (pendingOffer) await receiveOffer(pendingOffer, setFlow)
        if (request) await resolvePresentation(request, setFlow, setPresentation)
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Wallet initialization failed'
        setStatus({ state: 'error', message })
        await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'error', message } })
      } finally {
        if (!cancelled) void chrome.runtime.sendMessage({ type: 'WALLET_TASK_DONE' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [offer, request])

  const onSubmitPresentation = async () => {
    if (!presentation) return
    setFlow({ state: 'working' })
    try {
      const result = await submitPresentation(presentation.resolved, presentation.selectedCredentials)
      setFlow({
        state: 'done',
        message: result.ok ? 'Presentation submitted.' : 'The verifier rejected the presentation.',
      })
    } catch (error: unknown) {
      setFlow({ state: 'error', message: error instanceof Error ? error.message : 'Presentation failed' })
    }
  }

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
      {presentation && flow.state !== 'done' && (
        <button type="button" style={page.button} onClick={() => void onSubmitPresentation()} disabled={flow.state === 'working'}>
          Present credential
        </button>
      )}
    </main>
  )
}

async function takePendingOffer(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_OFFER_KEY)
  const pending = stored[PENDING_OFFER_KEY]
  if (typeof pending !== 'string' || pending.length === 0) return null
  await chrome.storage.local.remove(PENDING_OFFER_KEY)
  return pending
}

async function receiveOffer(offer: string, setFlow: (status: FlowStatus) => void): Promise<void> {
  setFlow({ state: 'working' })
  try {
    const credentials = await receiveCredentialOffer(offer)
    const message = `Received ${credentials.length} credential${credentials.length === 1 ? '' : 's'}.`
    setFlow({ state: 'done', message })
    await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'done', message } })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Credential receive failed'
    setFlow({ state: 'error', message })
    await chrome.storage.local.set({
      [PENDING_OFFER_KEY]: offer,
      [RECEIVE_STATUS_KEY]: {
        state: 'error',
        message: `${message} The offer is still saved — retry from this popup.`,
      },
    })
  }
}

async function resolvePresentation(
  request: string,
  setFlow: (status: FlowStatus) => void,
  setPresentation: (value: { resolved: ResolvedPresentationRequest; selectedCredentials: DcqlCredentialsForRequest }) => void,
): Promise<void> {
  setFlow({ state: 'working' })
  try {
    const resolved = await handlePresentationRequest(request)
    setPresentation(resolved)
    setFlow({ state: 'idle' })
  } catch (error: unknown) {
    setFlow({ state: 'error', message: error instanceof Error ? error.message : 'Presentation request failed' })
  }
}

const page: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: "'Inter', system-ui, sans-serif",
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
  button: {
    marginTop: 16,
    padding: '10px 18px',
    border: 'none',
    borderRadius: 999,
    background: '#c6136a',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
