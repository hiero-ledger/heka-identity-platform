import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONNECTED_SITES_KEY,
  PENDING_OFFER_KEY,
  PENDING_REQUEST_KEY,
  RECEIVE_STATUS_KEY,
  WALLET_STATUS_KEY,
} from '../../wallet/storage-keys'

type Listener = (...args: never[]) => unknown

const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
const offerB = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer%2Fb'
const request = 'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fr'
const received = { state: 'done', message: 'Received 1 credential.' } as const

const extensionPage = { id: 'wallet-id', url: 'chrome-extension://wallet-id/wallet.html', tab: { id: 1 } }
const siteTab = (origin: string, tabId: number) => ({
  id: 'wallet-id',
  url: `${origin}/onboarding`,
  origin,
  tab: { id: tabId },
})

function fakeChrome(contentScripts: Array<{ matches: string[] }> = []) {
  const listeners: Record<string, Listener[]> = {}
  const on = (name: string) => ({
    addListener: (listener: Listener) => (listeners[name] ??= []).push(listener),
  })
  const area = () => {
    const values = new Map<string, unknown>()
    return {
      values,
      get: vi.fn(async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) values.set(key, value)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key)
      }),
    }
  }
  let nextWindowId = 1
  const chrome = {
    runtime: {
      id: 'wallet-id',
      onInstalled: on('installed'),
      onStartup: on('startup'),
      onMessage: on('message'),
      getURL: (path: string) => `chrome-extension://wallet-id/${path}`,
      getManifest: () => ({ version: '0.1.0', content_scripts: contentScripts }),
      sendMessage: vi.fn(async () => undefined),
    },
    storage: { local: area(), session: area(), onChanged: on('storageChanged') },
    tabs: { sendMessage: vi.fn(async () => undefined) },
    windows: {
      create: vi.fn(async () => ({ id: nextWindowId++ })),
      update: vi.fn(async (id: number) => ({ id })),
      onRemoved: on('windowRemoved'),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async (_filter?: { ids?: string[] }): Promise<Array<{ id: string }>> => []),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
    },
    permissions: {
      contains: vi.fn(async (_permissions: { origins: string[] }) => true),
      onRemoved: on('permissionsRemoved'),
    },
    action: { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) },
  }
  return { chrome, listeners }
}

async function loadServiceWorker(contentScripts?: Array<{ matches: string[] }>) {
  const fake = fakeChrome(contentScripts)
  vi.stubGlobal('chrome', fake.chrome)
  vi.resetModules()
  await import('../service-worker')
  const sendFrom = (sender: object, message: unknown) =>
    new Promise((resolve) => {
      const [listener] = fake.listeners.message as ((...args: unknown[]) => boolean)[]
      listener(message, sender, resolve)
    })
  const send = (message: unknown) => sendFrom(extensionPage, message)
  return { ...fake, send, sendFrom }
}

describe('service worker: the wallet window', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens one wallet window and hands later requests to it', async () => {
    const { chrome, send } = await loadServiceWorker()

    await send({ type: 'RECEIVE_OFFER', offerUri: offer })
    expect(chrome.windows.create).toHaveBeenCalledTimes(1)

    await send({ type: 'RECEIVE_OFFER', offerUri: `${offer}-2` })
    expect(chrome.windows.create).toHaveBeenCalledTimes(1)
    expect(chrome.windows.update).toHaveBeenCalledWith(1, { focused: true })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PENDING_UPDATED' })
    expect(chrome.storage.local.values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: `${offer}-2` })
  })

  it('opens one window for requests that arrive together, and hands the later one to it', async () => {
    const { chrome, send } = await loadServiceWorker()

    await Promise.all([
      send({ type: 'RECEIVE_OFFER', offerUri: offer }),
      send({ type: 'PRESENT_REQUEST', requestUri: request }),
    ])

    expect(chrome.windows.create).toHaveBeenCalledTimes(1)
    expect(chrome.windows.update).toHaveBeenCalledWith(1, { focused: true })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PENDING_UPDATED' })
  })

  it('opens a new window when the stored one is gone', async () => {
    const { chrome, send } = await loadServiceWorker()
    await send({ type: 'RECEIVE_OFFER', offerUri: offer })
    chrome.windows.update.mockRejectedValueOnce(new Error('No window with id: 1.'))

    await send({ type: 'RECEIVE_OFFER', offerUri: offer })

    expect(chrome.windows.create).toHaveBeenCalledTimes(2)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('forgets the window when the user closes it', async () => {
    const { chrome, listeners, send } = await loadServiceWorker()
    await send({ type: 'OPEN_WALLET' })
    ;(listeners.windowRemoved[0] as (id: number) => void)(1)
    await vi.waitFor(() => expect(chrome.storage.session.remove).toHaveBeenCalled())

    await send({ type: 'OPEN_WALLET' })

    expect(chrome.windows.update).not.toHaveBeenCalled()
    expect(chrome.windows.create).toHaveBeenCalledTimes(2)
  })
})

describe('service worker: GET_STATUS', () => {
  it('reports the wallet as initialized only after the wallet page started its agent', async () => {
    const { chrome, send } = await loadServiceWorker()
    await expect(send({ type: 'GET_STATUS' })).resolves.toEqual({
      type: 'STATUS',
      initialized: false,
      credentialCount: 0,
    })

    chrome.storage.local.values.set(WALLET_STATUS_KEY, { state: 'ready' })
    await expect(send({ type: 'GET_STATUS' })).resolves.toMatchObject({ initialized: true })

    chrome.storage.local.values.set(WALLET_STATUS_KEY, { state: 'error', message: 'IndexedDB is not available' })
    await expect(send({ type: 'GET_STATUS' })).resolves.toMatchObject({ initialized: false })
  })
})

describe('service worker: connected sites', () => {
  const notConnected = { type: 'ERROR', message: 'This site is not connected to the wallet.' }

  it('takes bridge commands only from a connected site', async () => {
    const { chrome, sendFrom } = await loadServiceWorker()
    const heka = siteTab('https://heka.example', 7)

    await expect(sendFrom(heka, { type: 'RECEIVE_OFFER', offerUri: offer })).resolves.toEqual(notConnected)
    expect(chrome.storage.local.values.has(PENDING_OFFER_KEY)).toBe(false)

    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://heka.example'])
    await expect(sendFrom(heka, { type: 'RECEIVE_OFFER', offerUri: offer })).resolves.toEqual({
      type: 'OFFER_ACKNOWLEDGED',
    })
    expect(chrome.storage.local.values.get(PENDING_OFFER_KEY)).toEqual({
      offerUri: offer,
      from: { origin: 'https://heka.example', tabId: 7 },
    })
    await expect(sendFrom(siteTab('https://heka.example.evil', 8), { type: 'GET_STATUS' })).resolves.toEqual(
      notConnected,
    )
  })

  it("never takes the wallet pages' own messages from a site, even a connected one", async () => {
    const { chrome, sendFrom } = await loadServiceWorker()
    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://heka.example'])
    chrome.storage.local.values.set(PENDING_OFFER_KEY, { offerUri: offer })
    const heka = siteTab('https://heka.example', 7)

    await expect(
      sendFrom(heka, { type: 'SETTLE_OFFER', offerUri: offer, status: received, keep: false }),
    ).resolves.toEqual(notConnected)
    await expect(sendFrom(heka, { type: 'OPEN_WALLET' })).resolves.toEqual(notConnected)
    expect(chrome.storage.local.values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: offer })
    expect(chrome.windows.create).not.toHaveBeenCalled()
  })

  it("takes bridge commands from the development build's web UI without connecting it", async () => {
    const { sendFrom } = await loadServiceWorker([{ matches: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'] }])

    await expect(sendFrom(siteTab('http://127.0.0.1:8000', 3), { type: 'GET_STATUS' })).resolves.toMatchObject({
      type: 'STATUS',
    })
    await expect(sendFrom(siteTab('http://localhost:3000', 4), { type: 'GET_STATUS' })).resolves.toEqual(notConnected)
  })

  it('disconnects a site as soon as the holder removes its access in Chrome', async () => {
    const { chrome, listeners, sendFrom } = await loadServiceWorker()
    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://heka.example', 'https://revoked.example'])
    chrome.permissions.contains.mockImplementation(
      async ({ origins }: { origins: string[] }) => !origins.includes('https://revoked.example/*'),
    )
    chrome.scripting.getRegisteredContentScripts.mockImplementation(async (filter?: { ids?: string[] }) =>
      ['heka-bridge:https://heka.example', 'heka-bridge:https://revoked.example']
        .filter((id) => !filter?.ids || filter.ids.includes(id))
        .map((id) => ({ id })),
    )

    ;(listeners.permissionsRemoved[0] as (removed: chrome.permissions.Permissions) => void)({
      origins: ['https://revoked.example/*'],
    })

    await vi.waitFor(() =>
      expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({
        ids: ['heka-bridge:https://revoked.example'],
      }),
    )
    expect(chrome.storage.local.values.get(CONNECTED_SITES_KEY)).toEqual(['https://heka.example'])
    await expect(
      sendFrom(siteTab('https://revoked.example', 5), { type: 'RECEIVE_OFFER', offerUri: offer }),
    ).resolves.toEqual(notConnected)
  })

  it('registers the bridge again for the connected sites when the browser starts', async () => {
    const { chrome, listeners } = await loadServiceWorker()
    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://heka.example'])

    ;(listeners.startup[0] as () => void)()

    await vi.waitFor(() =>
      expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'heka-bridge:https://heka.example', matches: ['https://heka.example/*'] }),
      ]),
    )
  })
})

describe('service worker: settling pending items', () => {
  it('sends the final status only to the tab that handed the offer over', async () => {
    const { chrome, send, sendFrom } = await loadServiceWorker()
    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://heka.example'])
    await sendFrom(siteTab('https://heka.example', 7), { type: 'RECEIVE_OFFER', offerUri: offer })
    await sendFrom(siteTab('https://heka.example', 8), { type: 'RECEIVE_OFFER', offerUri: offerB })

    await expect(send({ type: 'SETTLE_OFFER', offerUri: offer, status: received, keep: false })).resolves.toEqual({
      type: 'SETTLED',
      settled: false,
    })
    await expect(send({ type: 'SETTLE_OFFER', offerUri: offerB, status: received, keep: false })).resolves.toEqual({
      type: 'SETTLED',
      settled: true,
    })

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(8, {
      type: 'BRIDGE_STATUS',
      origin: 'https://heka.example',
      message: {
        source: 'heka-extension-bridge',
        type: 'RECEIVE_STATUS',
        payload: { offerUri: offerB, state: 'done', message: 'Received 1 credential.' },
      },
    })
    expect(chrome.storage.local.values.has(PENDING_OFFER_KEY)).toBe(false)
    expect(chrome.storage.local.values.get(RECEIVE_STATUS_KEY)).toEqual(received)
  })

  it('sends PRESENT_STATUS to the tab that sent the request, and keeps the request when asked to', async () => {
    const { chrome, send, sendFrom } = await loadServiceWorker()
    chrome.storage.local.values.set(CONNECTED_SITES_KEY, ['https://verifier.example'])
    await sendFrom(siteTab('https://verifier.example', 9), { type: 'PRESENT_REQUEST', requestUri: request })
    const rejected = { state: 'error', message: 'The verifier rejected the presentation.' }

    await send({ type: 'SETTLE_REQUEST', requestUri: request, status: rejected, keep: true })

    expect(chrome.storage.local.values.get(PENDING_REQUEST_KEY)).toMatchObject({ requestUri: request })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, {
      type: 'BRIDGE_STATUS',
      origin: 'https://verifier.example',
      message: {
        source: 'heka-extension-bridge',
        type: 'PRESENT_STATUS',
        payload: { requestUri: request, ...rejected },
      },
    })
  })

  it('sends no status for an offer pasted into the wallet', async () => {
    const { chrome, send } = await loadServiceWorker()
    await send({ type: 'RECEIVE_OFFER', offerUri: offer })

    await send({ type: 'SETTLE_OFFER', offerUri: offer, status: received, keep: false })

    expect(chrome.storage.local.values.has(PENDING_OFFER_KEY)).toBe(false)
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('keeps a newer offer that arrives between the read and the removal of a settled one', async () => {
    const { chrome, send } = await loadServiceWorker()
    await send({ type: 'RECEIVE_OFFER', offerUri: offer })
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { values } = chrome.storage.local
    chrome.storage.local.get.mockImplementationOnce(async (key: string) => {
      const read = values.has(key) ? { [key]: values.get(key) } : {}
      await held
      return read
    })

    const settling = send({ type: 'SETTLE_OFFER', offerUri: offer, status: received, keep: false })
    const receiving = send({ type: 'RECEIVE_OFFER', offerUri: offerB })
    release()
    await Promise.all([settling, receiving])

    expect(values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: offerB })
  })

  it("shows a replaced offer's progress nowhere", async () => {
    const { chrome, send } = await loadServiceWorker()
    await send({ type: 'RECEIVE_OFFER', offerUri: offerB })

    await expect(send({ type: 'OFFER_PROGRESS', offerUri: offer, message: 'Saving the credential…' })).resolves.toEqual(
      { type: 'SETTLED', settled: false },
    )
    expect(chrome.storage.local.values.get(RECEIVE_STATUS_KEY)).toEqual({
      state: 'working',
      message: 'Opening the wallet so you can review this offer…',
    })

    await send({ type: 'OFFER_PROGRESS', offerUri: offerB, message: 'Saving the credential…' })
    expect(chrome.storage.local.values.get(RECEIVE_STATUS_KEY)).toEqual({
      state: 'working',
      message: 'Saving the credential…',
    })
  })
})
