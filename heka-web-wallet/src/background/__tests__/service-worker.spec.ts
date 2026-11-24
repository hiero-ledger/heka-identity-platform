import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PENDING_OFFER_KEY, WALLET_STATUS_KEY } from '../../wallet/storage-keys'

type Listener = (...args: never[]) => unknown

const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

function fakeChrome() {
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
      onMessage: on('message'),
      getURL: (path: string) => `chrome-extension://wallet-id/${path}`,
      getManifest: () => ({ version: '0.1.0' }),
      sendMessage: vi.fn(async () => undefined),
    },
    storage: { local: area(), session: area(), onChanged: on('storageChanged') },
    windows: {
      create: vi.fn(async () => ({ id: nextWindowId++ })),
      update: vi.fn(async (id: number) => ({ id })),
      onRemoved: on('windowRemoved'),
    },
    action: { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) },
  }
  return { chrome, listeners }
}

async function loadServiceWorker() {
  const fake = fakeChrome()
  vi.stubGlobal('chrome', fake.chrome)
  vi.resetModules()
  await import('../service-worker')
  const send = (message: unknown) =>
    new Promise((resolve) => {
      const [listener] = fake.listeners.message as ((...args: unknown[]) => boolean)[]
      listener(message, { id: 'wallet-id' }, resolve)
    })
  return { ...fake, send }
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
