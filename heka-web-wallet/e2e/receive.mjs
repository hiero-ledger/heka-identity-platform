// Drives the Heka Web Wallet in Chrome for Testing: a page served where the development build
// injects the bridge hands a credential offer to the extension, the wallet page receives it with
// the transaction code, and optionally presents it to a verifier's request. Not part of CI; see README.md.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  walletFlowResult,
  walletPage,
  walletPages,
} from './lib.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
// The development build injects the bridge here without connecting the site.
const HEKA_PAGE_PORT = 8000
// Offers for issuers that do not exist: they are only handed over, never redeemed.
const placeholderOffer = (issuer) =>
  'openid-credential-offer://?credential_offer=' +
  encodeURIComponent(
    JSON.stringify({
      credential_issuer: issuer,
      credential_configuration_ids: ['Placeholder'],
      grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': 'placeholder' } },
    }),
  )
const PLACEHOLDER_ISSUER = 'https://issuer.invalid'
const NEXT_PLACEHOLDER_ISSUER = 'https://issuer-2.invalid'

/** The offer to receive: given directly, or created by the identity service for HEKA_TOKEN's user. */
async function getOffer() {
  if (process.env.HEKA_OFFER_URI) {
    return {
      credentialOffer: process.env.HEKA_OFFER_URI,
      txCode: process.env.HEKA_TX_CODE,
      expiresAt: process.env.HEKA_OFFER_EXPIRES_AT,
    }
  }
  if (!process.env.HEKA_TOKEN) return null
  const response = await fetch(`${identityUrl}/v2/contributor-credential/offer`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.HEKA_TOKEN}` },
  })
  if (!response.ok)
    throw new Error(`POST /v2/contributor-credential/offer: ${response.status} ${await response.text()}`)
  return response.json()
}

function serveHekaPage() {
  const html = readFileSync(join(here, 'heka-page.html'))
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(html)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(HEKA_PAGE_PORT, '127.0.0.1', () => resolveServer(server))
  })
}

const offer = await getOffer()
const requestUri = process.env.HEKA_REQUEST_URI
const server = await serveHekaPage()
const { browser, serviceWorker, close } = await launchWithWallet()
let wallet

try {
  const heka = await newPage(browser, 'heka page')
  await heka.goto(`http://127.0.0.1:${HEKA_PAGE_PORT}/`, { waitUntil: 'load' })

  // The content script loads as a classic script and announces itself.
  check('bridge: content script loaded (EXTENSION_READY)', Boolean(await bridgeEvent(heka, 'EXTENSION_READY')))
  await heka.evaluate(() => window.sendBridge('PING'))
  const pong = await bridgeEvent(heka, 'PING_RESPONSE')
  check(
    'bridge: PING answered with protocol version 1',
    pong.payload?.type === 'PONG' && pong.payload?.protocolVersion === 1,
    JSON.stringify(pong.payload),
  )

  await heka.evaluate(
    (uri, expiresAt) => window.sendBridge('RECEIVE_OFFER', { offerUri: uri, expiresAt }),
    offer?.credentialOffer ?? placeholderOffer(PLACEHOLDER_ISSUER),
    offer?.expiresAt,
  )
  const acknowledged = await bridgeEvent(heka, 'RECEIVE_OFFER_RESPONSE')
  check('bridge: offer handed to the wallet', acknowledged.payload?.type === 'OFFER_ACKNOWLEDGED')

  wallet = await walletPage(browser)
  await bodyIncludes(wallet, 'Wallet ready')
  check('wallet: agent started', true)

  if (offer) {
    await bodyIncludes(wallet, 'Review credential offer')
    const review = await bodyText(wallet)
    check('wallet: offer resolved for review', true, review.split('\n').slice(0, 12).join(' | '))
    if (offer.txCode) await wallet.type('input', offer.txCode)
    await clickButton(wallet, 'Accept credential')
    const flow = await walletFlowResult(wallet, 'Received|redeemed|failed|expired')
    check('wallet: credential received', /^Received 1 credential/.test(flow), flow)

    const status = await bridgeEvent(heka, 'RECEIVE_STATUS', offer.credentialOffer)
    check(
      'bridge: Heka page told the credential is stored',
      status.payload?.state === 'done',
      JSON.stringify(status.payload),
    )

    const stored = await serviceWorker.evaluate(() =>
      chrome.storage.local.get(['credentialCount', 'credentialsSummary']),
    )
    const [summary] = stored.credentialsSummary ?? []
    check('popup summary: one credential', stored.credentialCount === 1, JSON.stringify(summary))
    check('popup summary: display name from issuer metadata', Boolean(summary?.display?.name), summary?.display?.name)
    check('popup summary: issued date from iat', Boolean(summary?.issuedAt), summary?.issuedAt)

    if (requestUri) {
      await heka.evaluate((uri) => window.sendBridge('PRESENT_REQUEST', { requestUri: uri }), requestUri)
      await bodyIncludes(wallet, 'Review presentation')
      check('wallet: request resolved for review', true, (await bodyText(wallet)).split('\n').slice(0, 14).join(' | '))
      await clickButton(wallet, 'Present credential')
      const presented = await walletFlowResult(wallet, 'submitted|rejected|failed|saved')
      check('wallet: presentation submitted', presented === 'Presentation submitted.', presented)
      const presentStatus = await bridgeEvent(heka, 'PRESENT_STATUS', requestUri)
      check('bridge: Heka page told the presentation is done', presentStatus.payload?.state === 'done')
    }
  } else {
    console.log('note: no offer source (HEKA_TOKEN or HEKA_OFFER_URI), so nothing is redeemed; see README.md')
    await bodyIncludes(wallet, `Reading this offer contacts ${PLACEHOLDER_ISSUER}.`)
    check('wallet: placeholder offer held until its issuer is allowed', true)
  }

  // A later request goes to the open wallet window instead of a new one, and replaces the item there.
  await heka.evaluate(
    (uri) => window.sendBridge('RECEIVE_OFFER', { offerUri: uri }),
    placeholderOffer(NEXT_PLACEHOLDER_ISSUER),
  )
  await bodyIncludes(wallet, `Reading this offer contacts ${NEXT_PLACEHOLDER_ISSUER}.`)
  check(
    'wallet: the next offer reuses the open window',
    walletPages(browser).length === 1,
    `${walletPages(browser).length} wallet window(s)`,
  )
} catch (error) {
  check('harness run', false, error instanceof Error ? error.message : String(error))
  await dumpPages(browser)
} finally {
  await close()
  server.close()
}

finish()
