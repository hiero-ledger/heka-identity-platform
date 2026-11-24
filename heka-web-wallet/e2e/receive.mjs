// Drives the Heka Web Wallet in Chrome for Testing: a Heka page on a trusted origin hands a
// credential offer to the extension through the content-script bridge, and the wallet page
// receives it with the transaction code. Not part of CI; see README.md.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer'

const here = fileURLToPath(new URL('.', import.meta.url))
const dist = resolve(process.env.HEKA_WALLET_DIST ?? join(here, '../dist'))
const identityUrl = (process.env.HEKA_IDENTITY_URL ?? 'http://localhost:3000').replace(/\/$/, '')
// The content script runs only on the origins in manifest.json and trusted-origins.ts.
const HEKA_PAGE_PORT = 8000
const TIMEOUT_MS = Number(process.env.HEKA_E2E_TIMEOUT_MS ?? 60000)
// An offer for an issuer that does not exist: it is only handed over, never redeemed.
const PLACEHOLDER_OFFER =
  'openid-credential-offer://?credential_offer=' +
  encodeURIComponent(
    JSON.stringify({
      credential_issuer: 'https://issuer.invalid',
      credential_configuration_ids: ['Placeholder'],
      grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': 'placeholder' } },
    }),
  )

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`)
  return ok
}

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

const waitFor = (page, fn, ...args) => page.waitForFunction(fn, { timeout: TIMEOUT_MS, polling: 100 }, ...args)
const bodyIncludes = (page, text) => waitFor(page, (t) => document.body.innerText.includes(t), text)
const bridgeEvent = (page, type) =>
  waitFor(page, (t) => window.__events.find((event) => event.type === t), type).then((handle) => handle.jsonValue())

async function clickButton(page, label) {
  await waitFor(
    page,
    (text) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(text)),
    label,
  )
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))
    button.click()
  }, label)
}

const offer = await getOffer()
const server = await serveHekaPage()
const profile = mkdtempSync(join(tmpdir(), 'heka-web-wallet-e2e-'))
const browser = await puppeteer.launch({
  headless: process.env.HEKA_E2E_HEADFUL ? false : true,
  pipe: true,
  userDataDir: profile,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
})
const pageErrors = []
let wallet
const walletPages = () => browser.targets().filter((target) => target.url().includes('/wallet.html'))

try {
  const worker = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
    { timeout: TIMEOUT_MS },
  )
  const serviceWorker = await worker.worker()
  console.log(`extension ${new URL(worker.url()).host} from ${dist}`)

  const heka = await browser.newPage()
  heka.on('pageerror', (error) => pageErrors.push(`heka page: ${error.message}`))
  await heka.goto(`http://127.0.0.1:${HEKA_PAGE_PORT}/`, { waitUntil: 'load' })

  // X3: the content script loads as a classic script and announces itself.
  check('bridge: content script loaded (EXTENSION_READY)', Boolean(await bridgeEvent(heka, 'EXTENSION_READY')))
  await heka.evaluate(() => window.sendBridge('PING'))
  const pong = await bridgeEvent(heka, 'PING_RESPONSE')
  check('bridge: PING answered', pong.payload?.type === 'PONG', JSON.stringify(pong.payload))

  await heka.evaluate(
    (uri, expiresAt) => window.sendBridge('RECEIVE_OFFER', { offerUri: uri, expiresAt }),
    offer?.credentialOffer ?? PLACEHOLDER_OFFER,
    offer?.expiresAt,
  )
  const acknowledged = await bridgeEvent(heka, 'RECEIVE_OFFER_RESPONSE')
  check('bridge: offer handed to the wallet', acknowledged.payload?.type === 'OFFER_ACKNOWLEDGED')

  const walletTarget = await browser.waitForTarget((target) => target.url().includes('/wallet.html'), {
    timeout: TIMEOUT_MS,
  })
  wallet = await walletTarget.page()
  wallet.on('pageerror', (error) => pageErrors.push(`wallet page: ${error.message}`))
  await bodyIncludes(wallet, 'Wallet ready')
  check('wallet: agent started', true)

  if (offer) {
    await bodyIncludes(wallet, 'Review credential offer')
    const review = await wallet.evaluate(() => document.body.innerText)
    check('wallet: offer resolved for review', true, review.split('\n').slice(0, 12).join(' | '))
    if (offer.txCode) await wallet.type('input', offer.txCode)
    await clickButton(wallet, 'Accept credential')
    await waitFor(wallet, () =>
      /Received|redeemed|failed|expired/i.test(document.getElementById('wallet-flow')?.textContent ?? ''),
    )
    const flow = await wallet.$eval('#wallet-flow', (element) => element.textContent)
    check('wallet: credential received', /^Received 1 credential/.test(flow), flow)

    const status = await bridgeEvent(heka, 'RECEIVE_STATUS')
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
    check(
      'popup summary: display name from issuer metadata (X9)',
      Boolean(summary?.display?.name),
      summary?.display?.name,
    )
    check('popup summary: issued date from iat (X9)', Boolean(summary?.issuedAt), summary?.issuedAt)
  } else {
    console.log('note: no offer source (HEKA_TOKEN or HEKA_OFFER_URI), so nothing is redeemed; see README.md')
    await bodyIncludes(wallet, 'Allow remote issuer access')
    check('wallet: placeholder offer held for review', true)
  }

  // X6: a later request goes to the open wallet window instead of a new one.
  await heka.evaluate((uri) => window.sendBridge('RECEIVE_OFFER', { offerUri: uri }), PLACEHOLDER_OFFER)
  await bodyIncludes(wallet, 'Allow remote issuer access')
  check(
    'wallet: the next offer reuses the open window',
    walletPages().length === 1,
    `${walletPages().length} wallet window(s)`,
  )
} catch (error) {
  check('harness run', false, error instanceof Error ? error.message : String(error))
  const text = await wallet?.evaluate(() => document.body.innerText).catch(() => undefined)
  if (text) console.log(`wallet page at the failure:\n${text}`)
} finally {
  for (const message of pageErrors) console.log(`page error: ${message}`)
  await browser.close()
  server.close()
  rmSync(profile, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok).length + pageErrors.length
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
