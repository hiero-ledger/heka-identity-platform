// Shared by the harness scripts: Chrome for Testing with the built extension, the checks, page waits
// and the bridge messages a page received.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer'

const here = fileURLToPath(new URL('.', import.meta.url))
export const TIMEOUT_MS = Number(process.env.HEKA_E2E_TIMEOUT_MS ?? 60000)
export const identityUrl = (process.env.HEKA_IDENTITY_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const results = []
export const pageErrors = []

export function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`)
  return ok
}

/** Chrome for Testing with the extension from HEKA_WALLET_DIST, in a new profile. */
export async function launchWithWallet() {
  const dist = resolve(process.env.HEKA_WALLET_DIST ?? join(here, '../dist'))
  const profile = mkdtempSync(join(tmpdir(), 'heka-web-wallet-e2e-'))
  const browser = await puppeteer.launch({
    headless: process.env.HEKA_E2E_HEADFUL ? false : true,
    pipe: true,
    userDataDir: profile,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
  })
  const worker = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
    { timeout: TIMEOUT_MS },
  )
  console.log(`extension ${new URL(worker.url()).host} from ${dist}`)
  const close = async () => {
    await browser.close()
    rmSync(profile, { recursive: true, force: true })
  }
  return { browser, serviceWorker: await worker.worker(), close }
}

export async function newPage(browser, name) {
  const page = await browser.newPage()
  // Tall enough for a screenshot of a whole step: the web UI scrolls inside its own container.
  await page.setViewport({ width: 1280, height: 1800 })
  page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`))
  return page
}

export const walletPages = (browser) => browser.targets().filter((target) => target.url().includes('/wallet.html'))

const watchedWalletPages = new WeakSet()

/** The wallet window, once the service worker has opened it. */
export async function walletPage(browser) {
  const target = await browser.waitForTarget((candidate) => candidate.url().includes('/wallet.html'), {
    timeout: TIMEOUT_MS,
  })
  const page = await target.page()
  if (!watchedWalletPages.has(page)) {
    watchedWalletPages.add(page)
    page.on('pageerror', (error) => pageErrors.push(`wallet: ${error.message}`))
  }
  return page
}

export const waitFor = (page, fn, ...args) => page.waitForFunction(fn, { timeout: TIMEOUT_MS, polling: 100 }, ...args)
export const bodyIncludes = (page, text) => waitFor(page, (t) => document.body.innerText.includes(t), text)
export const bodyText = (page) => page.evaluate(() => document.body.innerText)

export async function clickButton(page, label) {
  await waitFor(
    page,
    (text) => [...document.querySelectorAll('button')].some((b) => !b.disabled && b.textContent.includes(text)),
    label,
  )
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((b) => !b.disabled && b.textContent.includes(text))
    button.click()
  }, label)
}

/** Records the bridge's messages to the page in window.__events, from the page's first script on. */
export const recordBridgeEvents = (page) =>
  page.evaluateOnNewDocument(() => {
    window.__events = []
    window.addEventListener('message', (event) => {
      if (event.data && event.data.source === 'heka-extension-bridge') {
        window.__events.push({ origin: event.origin, type: event.data.type, payload: event.data.payload })
      }
    })
  })

/** The first bridge message of `type` (and, when given, about `item`: its offerUri or requestUri). */
export const bridgeEvent = (page, type, item) =>
  waitFor(
    page,
    (t, uri) =>
      window.__events.find(
        (event) => event.type === t && (!uri || event.payload?.offerUri === uri || event.payload?.requestUri === uri),
      ),
    type,
    item,
  ).then((handle) => handle.jsonValue())

/** Text of the wallet page's flow line once it shows a result. */
export async function walletFlowResult(wallet, pattern) {
  await waitFor(
    wallet,
    (source) => new RegExp(source, 'i').test(document.getElementById('wallet-flow')?.textContent ?? ''),
    pattern,
  )
  return wallet.$eval('#wallet-flow', (element) => element.textContent)
}

/**
 * A screenshot of `page` in HEKA_E2E_SCREENSHOTS, when that names a directory. Of the viewport only: a
 * full-page capture resizes it, and the web UI remounts its page when the width crosses its desktop
 * breakpoint, which drops a step's state.
 */
export async function snapshot(page, name) {
  const directory = process.env.HEKA_E2E_SCREENSHOTS
  if (directory) await page.screenshot({ path: join(directory, `${name}.png`) }).catch(() => {})
}

/**
 * After a failure: each open page's URL and text, and a screenshot of it in HEKA_E2E_SCREENSHOTS
 * when that names a directory.
 */
export async function dumpPages(browser) {
  const pages = await browser.pages()
  for (const [index, page] of pages.entries()) {
    const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    console.log(`--- page ${index}: ${page.url()}\n${text.split('\n').filter(Boolean).slice(0, 40).join('\n')}`)
    await snapshot(page, `failure-${index}`)
  }
}

/** Prints the result and exits with its status. */
export function finish() {
  for (const message of pageErrors) console.log(`page error: ${message}`)
  const failed = results.filter((result) => !result.ok).length + pageErrors.length
  console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} check(s) failed.`)
  process.exit(failed === 0 ? 0 : 1)
}
