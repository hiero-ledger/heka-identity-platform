import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: never[]) => unknown

const origin = 'https://heka.example'
const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

/** One page with the extension's isolated world: a script injected twice shares its globals. */
function fakePage() {
  const listeners: Record<string, Listener[]> = {}
  const page = {
    location: { origin },
    postMessage: vi.fn(),
    addEventListener: vi.fn((name: string, listener: Listener) => (listeners[name] ??= []).push(listener)),
  }
  const chrome = {
    runtime: {
      id: 'wallet-id',
      lastError: undefined as { message: string } | undefined,
      getManifest: () => ({ version: '0.1.0' }),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn((listener: Listener) => (listeners.status ??= []).push(listener)) },
    },
  }
  vi.stubGlobal('window', page)
  vi.stubGlobal('chrome', chrome)
  return { page, chrome, listeners }
}

async function inject() {
  vi.resetModules()
  await import('../heka-bridge')
}

describe('the bridge content script', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts once per page, however often it is injected', async () => {
    const { page, chrome } = fakePage()

    await inject()
    await inject()

    expect(page.addEventListener).toHaveBeenCalledTimes(1)
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1)
    expect(page.postMessage).toHaveBeenCalledTimes(1)
    expect(page.postMessage).toHaveBeenCalledWith(
      {
        source: 'heka-extension-bridge',
        type: 'EXTENSION_READY',
        payload: { protocolVersion: 1, extensionVersion: '0.1.0' },
      },
      origin,
    )
  })

  it("forwards the page's offer and posts the wallet's answer back", async () => {
    const { page, chrome, listeners } = fakePage()
    await inject()
    chrome.runtime.sendMessage.mockImplementation((_message: unknown, reply: (response: unknown) => void) =>
      reply({ type: 'OFFER_ACKNOWLEDGED' }),
    )

    ;(listeners.message[0] as (event: object) => void)({
      source: page,
      origin,
      data: { source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: offer } },
    })

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'RECEIVE_OFFER', offerUri: offer },
      expect.any(Function),
    )
    expect(page.postMessage).toHaveBeenLastCalledWith(
      { source: 'heka-extension-bridge', type: 'RECEIVE_OFFER_RESPONSE', payload: { type: 'OFFER_ACKNOWLEDGED' } },
      origin,
    )
  })

  it('posts a status only on the origin that handed the item over', async () => {
    const { page, listeners } = fakePage()
    await inject()
    const status = {
      source: 'heka-extension-bridge',
      type: 'RECEIVE_STATUS',
      payload: { offerUri: offer, state: 'done', message: 'Received 1 credential.' },
    }
    const deliver = listeners.status[0] as (message: object, sender: object) => void

    deliver({ type: 'BRIDGE_STATUS', origin: 'https://other.example', message: status }, { id: 'wallet-id' })
    deliver({ type: 'BRIDGE_STATUS', origin, message: status }, { id: 'another-extension' })
    expect(page.postMessage).toHaveBeenCalledTimes(1)

    deliver({ type: 'BRIDGE_STATUS', origin, message: status }, { id: 'wallet-id' })
    expect(page.postMessage).toHaveBeenLastCalledWith(status, origin)
  })
})
