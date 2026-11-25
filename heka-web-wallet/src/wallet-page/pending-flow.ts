import type { DcqlCredentialsForRequest } from '@credo-ts/core'

import type { ItemStatus } from '../bridge/protocol'
import { describeCredentialOffer, transactionCodeError, type OfferPreview } from '../oid4vci/offer-preview'
import {
  acceptCredentialOffer,
  CredentialReceiveError,
  receiveResultMessage,
  resolveIncomingOffer,
  UnsupportedOfferError,
  type ResolvedCredentialOffer,
} from '../oid4vci/receive'
import { handlePresentationRequest, submitPresentation, type ResolvedPresentationRequest } from '../oid4vp/present'
import { presentErrorMessage } from '../oid4vp/present-errors'
import { describePresentation, type PresentationPreview } from '../oid4vp/presentation-preview'
import {
  missingHostAccess,
  offerAcceptOrigins,
  presentationOrigins,
  requestHostAccess,
  reviewOrigins,
} from '../wallet/host-access'
import { settlePendingOffer, settlePendingRequest, type PendingRequest } from '../wallet/pending-items'
import {
  formatOfferExpiry,
  issuerRejectedExpiredOffer,
  pendingOfferExpired,
  type PendingOffer,
} from '../wallet/pending-offer'

export type FlowStatus =
  | { state: 'idle' }
  | { state: 'working' }
  | { state: 'done'; message: string; signedBy?: string[] }
  | { state: 'error'; message: string }

export interface OfferReview extends PendingOffer {
  resolved: ResolvedCredentialOffer
  preview: OfferPreview
}

export interface PresentationReview extends PendingRequest {
  resolved: ResolvedPresentationRequest
  selectedCredentials: DcqlCredentialsForRequest
  preview: PresentationPreview
}

/** The wallet page's state setters. */
export interface FlowView {
  setFlow(status: FlowStatus): void
  setOfferReview(review: OfferReview | null): void
  setHeldOffer(offer: PendingOffer | null): void
  /** The origins the holder must allow before the held offer is read; empty when none. */
  setOfferAccess(origins: string[]): void
  setTxCode(code: string): void
  setPresentation(review: PresentationReview | null): void
  setHeldRequest(request: PendingRequest | null): void
  setRequestAccess(origins: string[]): void
  setNotice(notice: string | null): void
}

/**
 * The offer and the request the page handles now, one object per opening. A newer one replaces
 * it; an async step that finds itself replaced leaves the page state alone.
 */
export interface FlowRefs {
  offer: { current: PendingOffer | null }
  request: { current: PendingRequest | null }
}

const OFFER_EXPIRED: ItemStatus = {
  state: 'error',
  message: 'This credential offer expired. Request a new one in Heka.',
}
const OFFER_DECLINED: ItemStatus = { state: 'error', message: 'Credential offer declined.' }
const PRESENTATION_SUBMITTED: ItemStatus = { state: 'done', message: 'Presentation submitted.' }
const PRESENTATION_REJECTED: ItemStatus = { state: 'error', message: 'The verifier rejected the presentation.' }
const REQUEST_DECLINED: ItemStatus = { state: 'error', message: 'Presentation request declined.' }

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * Asks for host access from the holder's click. Returns why the wallet still cannot contact the
 * origins, or null when it can. A refusal and a failed request both leave the item as it is.
 */
async function askHostAccess(origins: string[], kept: string): Promise<string | null> {
  try {
    const denied = await requestHostAccess(origins)
    return denied.length > 0 ? `Access to ${denied.join(', ')} was not allowed. ${kept}` : null
  } catch (error: unknown) {
    return `Could not ask for access to ${origins.join(', ')}: ${errorText(error, 'the request failed')}. ${kept}`
  }
}

/**
 * Why a step stops before it contacts anything: some URL it would contact is on a host the wallet
 * can never ask access for, and without access only the server's CORS headers would gate the call.
 */
function refusedText(refused: string[], kept: string): string | null {
  if (refused.length === 0) return null
  const hosts = refused.length === 1 ? 'its host' : 'their hosts'
  return `This wallet can't contact ${refused.join(', ')}: ${hosts} can't be allowed. ${kept}`
}

export function createPendingFlow(view: FlowView, refs: FlowRefs) {
  async function openOffer(held: PendingOffer): Promise<void> {
    const handling = { ...held }
    refs.offer.current = handling
    const replaced = () => refs.offer.current !== handling
    view.setOfferReview(null)

    if (pendingOfferExpired(held)) {
      refs.offer.current = null
      view.setHeldOffer(null)
      view.setOfferAccess([])
      const message = `This offer expired at ${formatOfferExpiry(held.expiresAt ?? '')}. Request a new credential in Heka.`
      view.setFlow({ state: 'error', message })
      await settlePendingOffer(held.offerUri, OFFER_EXPIRED)
      return
    }

    view.setHeldOffer(held)
    try {
      const step = reviewOrigins(held.offerUri)
      const refused = refusedText(step.refused, 'The offer is still saved.')
      if (refused) {
        // No grant can fix this, so it is an open failure: the tab hears of it now.
        view.setOfferAccess([])
        view.setFlow({ state: 'error', message: refused })
        await settlePendingOffer(held.offerUri, { state: 'error', message: refused }, true)
        return
      }
      const missing = await missingHostAccess(step.origins)
      if (replaced()) return
      view.setOfferAccess(missing)
      if (missing.length > 0) {
        view.setFlow({ state: 'idle' })
        return
      }

      view.setFlow({ state: 'working' })
      const resolved = await resolveIncomingOffer(held.offerUri)
      if (replaced()) return
      view.setOfferReview({ ...held, resolved, preview: describeCredentialOffer(resolved) })
      view.setFlow({ state: 'idle' })
    } catch (error: unknown) {
      if (replaced()) return
      view.setOfferAccess([])
      const message = errorText(error, 'Could not read this offer')
      if (issuerRejectedExpiredOffer(message)) {
        refs.offer.current = null
        view.setHeldOffer(null)
        view.setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
        await settlePendingOffer(held.offerUri, OFFER_EXPIRED)
        return
      }
      const text = `${message} The offer is still saved. Open the wallet page to retry.`
      view.setFlow({ state: 'error', message: text })
      await settlePendingOffer(held.offerUri, { state: 'error', message: text }, true)
    }
  }

  /** The "Review offer" click: asks for the origins reading the offer contacts. */
  async function allowOfferAccess(held: PendingOffer, origins: string[]): Promise<void> {
    const refused = await askHostAccess(origins, 'The offer is still saved.')
    if (refs.offer.current?.offerUri !== held.offerUri) return
    if (refused) {
      view.setFlow({ state: 'error', message: refused })
      return
    }
    await openOffer(held)
  }

  async function acceptOffer(review: OfferReview, txCode: string): Promise<void> {
    const handling = refs.offer.current
    if (handling?.offerUri !== review.offerUri) return
    const replaced = () => refs.offer.current !== handling
    const codeError = transactionCodeError(txCode, review.preview.txCode)
    if (codeError) {
      view.setFlow({ state: 'error', message: codeError })
      return
    }
    const step = offerAcceptOrigins(review.resolved)
    const refused =
      refusedText(step.refused, 'The offer is still saved.') ??
      (await askHostAccess(step.origins, 'The offer is still saved.'))
    if (replaced()) return
    if (refused) {
      view.setFlow({ state: 'error', message: refused })
      return
    }
    view.setFlow({ state: 'working' })
    try {
      const result = await acceptCredentialOffer(
        review.offerUri,
        review.resolved,
        review.preview.txCode ? txCode.trim() : undefined,
      )
      const message = receiveResultMessage(result.received, result.deferred, result.summaryUpdated)
      // Only a stored credential is 'done'; the Heka page treats 'done' as received.
      const state = result.received > 0 ? 'done' : 'error'
      await settlePendingOffer(review.offerUri, { state, message })
      if (replaced()) {
        if (result.received > 0) {
          view.setNotice(`A credential from ${review.preview.issuerOrigin} was saved while you reviewed another offer.`)
        }
        return
      }
      refs.offer.current = null
      view.setFlow(state === 'done' ? { state, message, signedBy: result.signedBy } : { state, message })
      view.setOfferReview(null)
      view.setHeldOffer(null)
    } catch (error: unknown) {
      const message = errorText(error, 'Credential receive failed')
      if (issuerRejectedExpiredOffer(message)) {
        await settlePendingOffer(review.offerUri, OFFER_EXPIRED)
        if (replaced()) return
        refs.offer.current = null
        view.setHeldOffer(null)
        view.setOfferReview(null)
        view.setFlow({ state: 'error', message: `${message} Request a new credential in Heka.` })
        return
      }
      const unsupported = error instanceof UnsupportedOfferError
      if (unsupported || (error instanceof CredentialReceiveError && !error.retryable)) {
        const text = unsupported
          ? `This wallet can't hold this credential. ${message}`
          : `${message} The issuer has already redeemed this offer, so it cannot be retried. Request a new credential in Heka.`
        await settlePendingOffer(review.offerUri, { state: 'error', message: text })
        if (replaced()) return
        refs.offer.current = null
        view.setHeldOffer(null)
        view.setOfferReview(null)
        view.setFlow({ state: 'error', message: text })
        return
      }
      const text = `${message} The offer is still saved. Open the wallet page to retry.`
      await settlePendingOffer(review.offerUri, { state: 'error', message: text }, true)
      if (replaced()) return
      view.setFlow({ state: 'error', message: text })
    }
  }

  async function declineOffer(declined: PendingOffer): Promise<void> {
    if (refs.offer.current?.offerUri !== declined.offerUri) return
    refs.offer.current = null
    view.setOfferReview(null)
    view.setHeldOffer(null)
    view.setOfferAccess([])
    view.setFlow({ state: 'error', message: OFFER_DECLINED.message })
    await settlePendingOffer(declined.offerUri, OFFER_DECLINED)
  }

  async function openPresentation(held: PendingRequest): Promise<void> {
    const handling = { ...held }
    refs.request.current = handling
    const replaced = () => refs.request.current !== handling
    view.setPresentation(null)
    view.setHeldRequest(held)
    try {
      const step = reviewOrigins(held.requestUri)
      const refused = refusedText(step.refused, 'The request is still saved.')
      if (refused) {
        view.setRequestAccess([])
        view.setFlow({ state: 'error', message: refused })
        await settlePendingRequest(held.requestUri, { state: 'error', message: refused }, true)
        return
      }
      const missing = await missingHostAccess(step.origins)
      if (replaced()) return
      view.setRequestAccess(missing)
      if (missing.length > 0) {
        view.setFlow({ state: 'idle' })
        return
      }

      view.setFlow({ state: 'working' })
      const resolved = await handlePresentationRequest(held.requestUri)
      if (replaced()) return
      view.setPresentation({
        ...held,
        ...resolved,
        preview: describePresentation(resolved.resolved, resolved.selectedCredentials),
      })
      view.setFlow({ state: 'idle' })
    } catch (error: unknown) {
      if (replaced()) return
      view.setRequestAccess([])
      const message = presentErrorMessage(error)
      view.setFlow({ state: 'error', message })
      await settlePendingRequest(held.requestUri, { state: 'error', message }, true)
    }
  }

  /** The "Review request" click: asks for the origins reading the request contacts. */
  async function allowRequestAccess(held: PendingRequest, origins: string[]): Promise<void> {
    const refused = await askHostAccess(origins, 'The request is still saved.')
    if (refs.request.current?.requestUri !== held.requestUri) return
    if (refused) {
      view.setFlow({ state: 'error', message: refused })
      return
    }
    await openPresentation(held)
  }

  async function present(review: PresentationReview): Promise<void> {
    const handling = refs.request.current
    if (handling?.requestUri !== review.requestUri) return
    const replaced = () => refs.request.current !== handling
    const step = presentationOrigins(review.resolved)
    const refused =
      refusedText(step.refused, 'The request is still saved.') ??
      (await askHostAccess(step.origins, 'The request is still saved.'))
    if (replaced()) return
    if (refused) {
      view.setFlow({ state: 'error', message: refused })
      return
    }
    view.setFlow({ state: 'working' })
    try {
      const result = await submitPresentation(review.resolved, review.selectedCredentials)
      const status = result.ok ? PRESENTATION_SUBMITTED : PRESENTATION_REJECTED
      // A rejected presentation stays saved for a retry, as below.
      await settlePendingRequest(review.requestUri, status, !result.ok)
      if (replaced()) return
      view.setFlow(status)
      view.setPresentation(null)
      if (result.ok) {
        refs.request.current = null
        view.setHeldRequest(null)
      }
    } catch (error: unknown) {
      const message = `${errorText(error, 'Presentation failed')} The request is still saved. Retry when the verifier is reachable.`
      await settlePendingRequest(review.requestUri, { state: 'error', message }, true)
      if (replaced()) return
      view.setFlow({ state: 'error', message })
    }
  }

  async function declinePresentation(declined: PendingRequest): Promise<void> {
    if (refs.request.current?.requestUri !== declined.requestUri) return
    refs.request.current = null
    view.setPresentation(null)
    view.setHeldRequest(null)
    view.setRequestAccess([])
    view.setFlow({ state: 'error', message: REQUEST_DECLINED.message })
    await settlePendingRequest(declined.requestUri, REQUEST_DECLINED)
  }

  /**
   * Opens what the service worker has pending. PENDING_UPDATED also comes when only the other
   * pending item changed, or from the popup's "Open wallet", so an item already on the page is not
   * opened again.
   */
  async function openPending(
    offer: PendingOffer | null,
    request: PendingRequest | null,
    cancelled: () => boolean,
  ): Promise<void> {
    if (offer && offer.offerUri !== refs.offer.current?.offerUri) {
      view.setTxCode('')
      await openOffer(offer)
    }
    if (cancelled()) return
    if (request && request.requestUri !== refs.request.current?.requestUri) await openPresentation(request)
  }

  return {
    openPending,
    openOffer,
    allowOfferAccess,
    acceptOffer,
    declineOffer,
    openPresentation,
    allowRequestAccess,
    present,
    declinePresentation,
  }
}

export type PendingFlow = ReturnType<typeof createPendingFlow>
