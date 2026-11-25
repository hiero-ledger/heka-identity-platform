// Drives the Heka web UI and the Web Wallet together in Chrome for Testing, against a running identity
// service (see README.md): the contributor receives the GitHub contributor credential from the web UI's
// credential step through the wallet button, then presents it on the public /present page to a DCQL
// request a verifier created. Not part of CI.
import {
  bodyIncludes,
  bodyText,
  bridgeEvent,
  check,
  clickButton,
  dumpPages,
  finish,
  identityUrl,
  launchWithWallet,
  newPage,
  recordBridgeEvents,
  snapshot,
  TIMEOUT_MS,
  waitFor,
  walletFlowResult,
  walletPage,
} from './lib.mjs'

const webUiUrl = (process.env.HEKA_WEB_UI_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const oidcAuthority = process.env.HEKA_OIDC_AUTHORITY
const oidcClientId = process.env.HEKA_OIDC_CLIENT_ID ?? 'heka-identity-web-ui'
const contributorToken = process.env.HEKA_CONTRIBUTOR_TOKEN
const verifierToken = process.env.HEKA_VERIFIER_TOKEN
const expectedIssuerDid = process.env.HEKA_ISSUER_DID
const WALLET_BUTTON = 'Open in Heka Web Wallet'

if (!oidcAuthority || !contributorToken) {
  console.error(
    'Set HEKA_OIDC_AUTHORITY and HEKA_CONTRIBUTOR_TOKEN (and HEKA_VERIFIER_TOKEN for /present); see README.md.',
  )
  process.exit(2)
}

async function api(method, path, token, body, { conflictOk = false } = {}) {
  const response = await fetch(`${identityUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  if (!response.ok && !(conflictOk && response.status === 409)) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : undefined
}

/** Signs the web UI's OIDC client in with `token`, as its own sign-in would store the session. */
function signIn(page, token) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const user = {
    access_token: token,
    token_type: 'Bearer',
    scope: 'openid profile',
    profile: claims,
    expires_at: claims.exp,
  }
  return page.evaluateOnNewDocument(
    (key, value) => sessionStorage.setItem(key, value),
    `oidc.user:${oidcAuthority}:${oidcClientId}`,
    JSON.stringify(user),
  )
}

/** The claims of the stored SD-JWT VC: its signed payload and the names of its disclosures. */
function storedCredential(wallet) {
  return wallet.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('heka-wallet-credo')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const decode = (part) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    const compact = records.find((record) => record.type === 'SdJwtVcRecord')?.json.credentialInstances[0]
      .compactSdJwtVc
    if (!compact) return null
    const [jwt, ...disclosures] = compact.split('~').filter((part) => part.length > 0)
    return { payload: decode(jwt.split('.')[1]), disclosed: disclosures.map((part) => decode(part)[1]) }
  })
}

/** A DCQL request for the contributor credential from a verifier in its own wallet; its URI and session. */
async function createVerificationRequest() {
  // A verifier that ran before already has its DID and verifier record.
  const [held] = await api('GET', '/dids?own=true', verifierToken)
  const did = held ?? (await api('POST', '/dids', verifierToken, {}))
  await api('POST', '/openid4vc/verifier', verifierToken, { publicVerifierId: did.id }, { conflictOk: true })
  const { authorizationRequest, verificationSession } = await api(
    'POST',
    '/openid4vc/verification-session/request',
    verifierToken,
    {
      publicVerifierId: did.id,
      requestSigner: { method: 'did', did: did.authentication[0] },
      dcql: {
        query: {
          credentials: [
            {
              id: 'contributor',
              format: 'vc+sd-jwt',
              meta: { vct_values: ['GitHub Contributor'] },
              claims: [{ path: ['githubUsername'] }],
            },
          ],
        },
      },
    },
  )
  return { authorizationRequest, sessionId: verificationSession.id }
}

async function verificationState(sessionId) {
  const deadline = Date.now() + TIMEOUT_MS
  let state
  while (Date.now() < deadline) {
    state = (await api('GET', `/openid4vc/verification-session/${sessionId}`, verifierToken)).state
    if (state === 'ResponseVerified' || state === 'Error') break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return state
}

const { browser, close } = await launchWithWallet()
let wallet

try {
  // The contributor's credential step: an offer, then the wallet button.
  const contributor = await newPage(browser, 'contributor page')
  await recordBridgeEvents(contributor)
  await signIn(contributor, contributorToken)
  const offerResponse = new Promise((resolve) =>
    contributor.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/v2/contributor-credential/offer')) {
        resolve(response.json())
      }
    }),
  )
  // As after a sign-in: the home page, then the menu. Opened directly, the onboarding page doesn't load
  // the contributor's status (see README.md).
  await contributor.goto(webUiUrl, { waitUntil: 'load' })
  await waitFor(contributor, () =>
    [...document.querySelectorAll('a, [role="link"]')].some((link) => link.innerText.trim() === 'Contributor Hub'),
  )
  await contributor.evaluate(() =>
    [...document.querySelectorAll('a, [role="link"]')]
      .find((link) => link.innerText.trim() === 'Contributor Hub')
      .click(),
  )
  await clickButton(contributor, 'Start Contributor Onboarding')
  await clickButton(contributor, 'Request credential offer')
  const offer = await offerResponse
  check(
    'web UI: the contributor offer has a tx code and an expiry',
    offer.credentialOffer?.startsWith('openid-credential-offer:') &&
      /^\d{8}$/.test(offer.txCode) &&
      Boolean(offer.expiresAt),
    `session ${offer.issuanceSessionId}, expires ${offer.expiresAt}`,
  )
  await bodyIncludes(contributor, offer.txCode)
  await snapshot(contributor, '1-offer-view')
  const offerView = await bodyText(contributor)
  check(
    'web UI: the offer view shows the tx code, the expiry and a QR code',
    offerView.includes('The offer expires') &&
      // qrcode.react's QRCodeSVG
      (await contributor.evaluate(() => document.querySelector('svg[role="img"]') !== null)),
  )
  await clickButton(contributor, WALLET_BUTTON)

  wallet = await walletPage(browser)
  await bodyIncludes(wallet, 'Review credential offer')
  await snapshot(wallet, '2-wallet-offer-review')
  const review = await bodyText(wallet)
  // The issuer's OpenID4VCI endpoint, which serves the offer (not necessarily the API's origin)
  const issuerOrigin = new URL(new URL(offer.credentialOffer).searchParams.get('credential_offer_uri')).origin
  check('wallet: the review names the issuer by its origin', review.includes(`Issuer\n${issuerOrigin}`), issuerOrigin)
  check(
    'wallet: the review names the site it was opened from',
    review.includes(`Opened from\n${new URL(webUiUrl).origin}`),
    review.split('\n').slice(4, 16).join(' | '),
  )
  await wallet.type('input', offer.txCode)
  await clickButton(wallet, 'Accept credential')
  const received = await walletFlowResult(wallet, 'Received|redeemed|failed|expired')
  check('wallet: credential received', /^Received 1 credential/.test(received), received)
  const signedBy = await bodyText(wallet)
  check('wallet: shows the signing DID', /Signed by\ndid:/.test(signedBy), signedBy.match(/Signed by\n(.*)/)?.[1])

  const receiveStatus = await bridgeEvent(contributor, 'RECEIVE_STATUS', offer.credentialOffer)
  check(
    'bridge: RECEIVE_STATUS done for this offer',
    receiveStatus.payload?.state === 'done',
    receiveStatus.payload?.message,
  )
  await bodyIncludes(contributor, 'Your wallet has received the credential.')
  await snapshot(wallet, '3-wallet-received')
  await snapshot(contributor, '4-credential-step-done')
  check('web UI: the credential step completes', true)

  const credential = await storedCredential(wallet)
  check(
    'credential: vct "GitHub Contributor"',
    credential?.payload.vct === 'GitHub Contributor',
    credential?.payload.vct,
  )
  check(
    'credential: iss is the pinned organization DID',
    expectedIssuerDid ? credential?.payload.iss === expectedIssuerDid : /^did:/.test(credential?.payload.iss ?? ''),
    credential?.payload.iss,
  )
  check(
    'credential: status.status_list present',
    Boolean(credential?.payload.status?.status_list?.uri),
    JSON.stringify(credential?.payload.status),
  )
  check(
    'credential: the GitHub claims are disclosures, and no walletId',
    ['githubAccountId', 'githubUsername', 'gpgFingerprint'].every((name) => credential?.disclosed.includes(name)) &&
      !('walletId' in (credential?.payload ?? {})) &&
      !credential?.disclosed.includes('walletId'),
    credential?.disclosed.join(', '),
  )
  const offerState = await api('GET', `/v2/contributor-credential/offer/${offer.issuanceSessionId}`, contributorToken)
  check('identity service: the offer state is Completed', offerState.state === 'Completed', offerState.state)

  // The public /present page, signed out: the verifier's request, the wallet button, consent.
  if (verifierToken) {
    const { authorizationRequest, sessionId } = await createVerificationRequest()
    const query = new URL(authorizationRequest).searchParams
    const link = new URL(`${webUiUrl}/present`)
    link.searchParams.set('client_id', query.get('client_id'))
    link.searchParams.set('request_uri', query.get('request_uri'))
    const present = await newPage(browser, 'present page')
    await recordBridgeEvents(present)
    await present.goto(link.toString(), { waitUntil: 'load' })
    await bodyIncludes(present, 'Present a credential')
    await clickButton(present, WALLET_BUTTON)

    await bodyIncludes(wallet, 'Review presentation')
    await snapshot(wallet, '5-wallet-presentation-review')
    const presentation = await bodyText(wallet)
    check(
      'wallet: the presentation review names the verifier, its id prefix and the site it was opened from',
      /Verifier\ndid:key:\S+ \(decentralized_identifier\)/.test(presentation) &&
        presentation.includes(`Opened from\n${new URL(webUiUrl).origin}`),
      presentation.split('\n').slice(4, 20).join(' | '),
    )
    await clickButton(wallet, 'Present credential')
    const presented = await walletFlowResult(wallet, 'submitted|rejected|failed|saved')
    check('wallet: presentation submitted', presented === 'Presentation submitted.', presented)

    const presentStatus = await waitFor(present, () =>
      window.__events.find((event) => event.type === 'PRESENT_STATUS'),
    ).then((handle) => handle.jsonValue())
    check(
      'bridge: PRESENT_STATUS done on /present',
      presentStatus.payload?.state === 'done' && presentStatus.payload?.requestUri?.startsWith('openid4vp:'),
      JSON.stringify(presentStatus.payload),
    )
    await bodyIncludes(present, 'Your wallet has answered the verifier.')
    await snapshot(present, '6-present-done')
    check('web UI: /present shows the answer', true)
    const state = await verificationState(sessionId)
    check('identity service: the verification session is ResponseVerified', state === 'ResponseVerified', state)
  } else {
    console.log('note: no HEKA_VERIFIER_TOKEN, so /present is not exercised; see README.md')
  }
} catch (error) {
  check('harness run', false, error instanceof Error ? error.message : String(error))
  await dumpPages(browser)
} finally {
  await close()
}

finish()
