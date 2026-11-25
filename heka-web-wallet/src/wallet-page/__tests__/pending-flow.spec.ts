import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingRequest } from '../../wallet/pending-items'
import type { PendingOffer } from '../../wallet/pending-offer'
import { createPendingFlow, type FlowView, type OfferReview, type PresentationReview } from '../pending-flow'

const mocks = vi.hoisted(() => ({
  resolveIncomingOffer: vi.fn(),
  acceptCredentialOffer: vi.fn(),
  handlePresentationRequest: vi.fn(),
  submitPresentation: vi.fn(),
}))

vi.mock('../../oid4vci/receive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../oid4vci/receive')>()),
  resolveIncomingOffer: mocks.resolveIncomingOffer,
  acceptCredentialOffer: mocks.acceptCredentialOffer,
}))

vi.mock('../../oid4vp/present', () => ({
  handlePresentationRequest: mocks.handlePresentationRequest,
  submitPresentation: mocks.submitPresentation,
}))

const offerFrom = (host: string): PendingOffer => ({
  offerUri: `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(`https://${host}/offers/1`)}`,
  from: { origin: 'https://heka.example', tabId: 7 },
})
const offerA = offerFrom('issuer-a.example')
const offerB = offerFrom('issuer-b.example')
const request: PendingRequest = {
  requestUri: 'openid4vp://?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Fr%2F1',
  from: { origin: 'https://heka.example', tabId: 7 },
}

const resolvedFor = (offer: PendingOffer) => ({
  metadata: {
    credentialIssuer: {
      credential_issuer: new URL(new URL(offer.offerUri).searchParams.get('credential_offer_uri')!).origin,
    },
  },
  credentialOfferPayload: {},
  offeredCredentialConfigurations: {},
})

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

function recordingView() {
  const state = {
    flow: { state: 'idle' } as Parameters<FlowView['setFlow']>[0],
    offerReview: null as OfferReview | null,
    heldOffer: null as PendingOffer | null,
    offerAccess: [] as string[],
    txCode: '',
    presentation: null as PresentationReview | null,
    heldRequest: null as PendingRequest | null,
    requestAccess: [] as string[],
    notice: null as string | null,
  }
  const view = {
    setFlow: vi.fn((value) => void (state.flow = value)),
    setOfferReview: vi.fn((value) => void (state.offerReview = value)),
    setHeldOffer: vi.fn((value) => void (state.heldOffer = value)),
    setOfferAccess: vi.fn((value) => void (state.offerAccess = value)),
    setTxCode: vi.fn((value) => void (state.txCode = value)),
    setPresentation: vi.fn((value) => void (state.presentation = value)),
    setHeldRequest: vi.fn((value) => void (state.heldRequest = value)),
    setRequestAccess: vi.fn((value) => void (state.requestAccess = value)),
    setNotice: vi.fn((value) => void (state.notice = value)),
  } satisfies FlowView
  const flow = createPendingFlow(view, { offer: { current: null }, request: { current: null } })
  return { state, view, flow }
}

const notCancelled = () => false

describe('the wallet page flow', () => {
  const granted = new Set<string>()
  const sendMessage = vi.fn()
  const requestPermission = vi.fn()

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.resolveIncomingOffer.mockImplementation(async (offerUri: string) => resolvedFor({ offerUri }))
    granted.clear()
    granted.add('https://issuer-a.example/*').add('https://issuer-b.example/*').add('https://verifier.example/*')
    sendMessage.mockReset().mockResolvedValue({ type: 'SETTLED', settled: true })
    requestPermission.mockReset().mockResolvedValue(false)
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin)),
        request: requestPermission,
      },
    })
  })

  it("lets a newer offer replace the older one; the older one's late result leaves the page alone", async () => {
    const { state, view, flow } = recordingView()
    const resolvingA = deferred<object>()
    mocks.resolveIncomingOffer.mockImplementationOnce(() => resolvingA.promise)

    const openingA = flow.openOffer(offerA)
    await vi.waitFor(() => expect(mocks.resolveIncomingOffer).toHaveBeenCalledTimes(1))
    await flow.openOffer(offerB)
    resolvingA.resolve(resolvedFor(offerA))
    await openingA

    expect(state.offerReview?.offerUri).toBe(offerB.offerUri)
    expect(state.heldOffer?.offerUri).toBe(offerB.offerUri)
    expect(view.setOfferReview).not.toHaveBeenCalledWith(expect.objectContaining({ offerUri: offerA.offerUri }))
    expect(state.flow).toEqual({ state: 'idle' })
  })

  it('does not reopen the offer on the page, and clears the tx code only for a new offer', async () => {
    const { state, view, flow } = recordingView()

    await flow.openPending(offerA, null, notCancelled)
    view.setTxCode('1234')
    await flow.openPending(offerA, request, notCancelled)
    expect(mocks.resolveIncomingOffer).toHaveBeenCalledTimes(1)
    expect(state.txCode).toBe('1234')

    await flow.openPending(offerB, request, notCancelled)
    expect(mocks.resolveIncomingOffer).toHaveBeenCalledTimes(2)
    expect(state.txCode).toBe('')
    expect(mocks.handlePresentationRequest).toHaveBeenCalledTimes(1)
  })

  it('shows the requesting site and the verified issuer origin in the review', async () => {
    const { state, flow } = recordingView()

    await flow.openOffer(offerA)

    expect(state.offerReview?.from).toEqual({ origin: 'https://heka.example', tabId: 7 })
    expect(state.offerReview?.preview).toMatchObject({ issuerOrigin: 'https://issuer-a.example', issuerName: null })
  })

  it('keeps an offer whose issuer access was refused, and names the origin', async () => {
    granted.clear()
    const { state, flow } = recordingView()

    await flow.openOffer(offerA)
    expect(state.offerAccess).toEqual(['https://issuer-a.example'])
    expect(mocks.resolveIncomingOffer).not.toHaveBeenCalled()

    await flow.allowOfferAccess(offerA, state.offerAccess)

    expect(requestPermission).toHaveBeenCalledWith({ origins: ['https://issuer-a.example/*'] })
    expect(state.flow).toEqual({
      state: 'error',
      message: 'Access to https://issuer-a.example was not allowed. The offer is still saved.',
    })
    expect(state.heldOffer?.offerUri).toBe(offerA.offerUri)
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SETTLE_OFFER' }))
  })

  it('asks for the authorization server at accept, and accepts nothing when refused', async () => {
    const { state, flow } = recordingView()
    mocks.resolveIncomingOffer.mockResolvedValueOnce({
      ...resolvedFor(offerA),
      metadata: {
        credentialIssuer: { credential_issuer: 'https://issuer-a.example' },
        authorizationServers: [{ issuer: 'https://auth.example', token_endpoint: 'https://auth.example/token' }],
      },
    })
    await flow.openOffer(offerA)

    await flow.acceptOffer(state.offerReview!, '')

    expect(requestPermission).toHaveBeenCalledWith({ origins: ['https://auth.example/*'] })
    expect(mocks.acceptCredentialOffer).not.toHaveBeenCalled()
    expect(state.flow).toMatchObject({ message: expect.stringMatching(/^Access to https:\/\/auth\.example was not/) })
  })

  it('settles an accepted offer, and shows who signed the credential', async () => {
    const { state, flow } = recordingView()
    mocks.acceptCredentialOffer.mockResolvedValue({
      received: 1,
      deferred: 0,
      signedBy: ['did:key:z6Mkissuer'],
      summaryUpdated: true,
    })
    await flow.openOffer(offerA)

    await flow.acceptOffer(state.offerReview!, '')

    expect(mocks.acceptCredentialOffer).toHaveBeenCalledWith(offerA.offerUri, expect.anything(), undefined)
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SETTLE_OFFER',
      offerUri: offerA.offerUri,
      status: { state: 'done', message: 'Received 1 credential.' },
      keep: false,
    })
    expect(state.flow).toEqual({ state: 'done', message: 'Received 1 credential.', signedBy: ['did:key:z6Mkissuer'] })
    expect(state.offerReview).toBeNull()
  })

  it('notes a credential that a replaced accept stored, and stays on the newer offer', async () => {
    const { state, flow } = recordingView()
    await flow.openOffer(offerA)
    const reviewA = state.offerReview!
    const accepting = deferred<object>()
    mocks.acceptCredentialOffer.mockReturnValueOnce(accepting.promise)

    const acceptingA = flow.acceptOffer(reviewA, '')
    await vi.waitFor(() => expect(mocks.acceptCredentialOffer).toHaveBeenCalled())
    await flow.openOffer(offerB)
    accepting.resolve({ received: 1, deferred: 0, signedBy: [], summaryUpdated: true })
    await acceptingA

    expect(state.notice).toBe('A credential from https://issuer-a.example was saved while you reviewed another offer.')
    expect(state.offerReview?.offerUri).toBe(offerB.offerUri)
    expect(state.flow).toEqual({ state: 'idle' })
  })

  it('reports the presentation result to the requesting site, and keeps a rejected request', async () => {
    const { state, flow } = recordingView()
    mocks.handlePresentationRequest.mockResolvedValue({
      resolved: { verifier: { effectiveClientId: 'verifier' }, authorizationRequestPayload: {}, origin: '' },
      selectedCredentials: {},
    })
    await flow.openPresentation(request)
    mocks.submitPresentation.mockResolvedValueOnce({ ok: false })

    await flow.present(state.presentation!)

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'SETTLE_REQUEST',
      requestUri: request.requestUri,
      status: { state: 'error', message: 'The verifier rejected the presentation.' },
      keep: true,
    })
    expect(state.heldRequest?.requestUri).toBe(request.requestUri)

    await flow.declinePresentation(request)
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'SETTLE_REQUEST',
      requestUri: request.requestUri,
      status: { state: 'error', message: 'Presentation request declined.' },
      keep: false,
    })
  })

  it('reports a request that cannot be opened to the requesting site, and keeps it for a retry', async () => {
    const { state, flow } = recordingView()
    mocks.handlePresentationRequest.mockRejectedValueOnce(new Error('DCQL query cannot be satisfied'))

    await flow.openPresentation(request)

    const message =
      'No stored credential matches this request. Receive a GitHub contributor credential, then try again.'
    expect(state.flow).toEqual({ state: 'error', message })
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SETTLE_REQUEST',
      requestUri: request.requestUri,
      status: { state: 'error', message },
      keep: true,
    })
    expect(state.heldRequest?.requestUri).toBe(request.requestUri)
  })

  it('reports nothing while the request waits for access to the verifier', async () => {
    granted.clear()
    const { state, flow } = recordingView()

    await flow.openPresentation(request)

    expect(state.requestAccess).toEqual(['https://verifier.example'])
    expect(mocks.handlePresentationRequest).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
