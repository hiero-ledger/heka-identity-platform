import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  builtInBridgeOrigins,
  connectSite,
  disconnectSite,
  dropRevokedSites,
  isConnectedOrigin,
  loadConnectedSites,
  reconcileConnectedSites,
} from '../connected-sites'
import { CONNECTED_SITES_KEY } from '../storage-keys'

const heka = 'https://heka.example'

function fakeChrome(contentScripts: Array<{ matches: string[] }> = []) {
  const values = new Map<string, unknown>()
  const granted = new Set<string>()
  const registered = new Map<string, chrome.scripting.RegisteredContentScript>()
  const chrome = {
    runtime: { getManifest: () => ({ content_scripts: contentScripts }) },
    storage: {
      local: {
        get: async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {}),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) values.set(key, value)
        },
      },
    },
    permissions: {
      contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin)),
      request: vi.fn(async ({ origins }: { origins: string[] }) => {
        for (const origin of origins) granted.add(origin)
        return true
      }),
      remove: vi.fn(async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.delete(origin))),
    },
    scripting: {
      getRegisteredContentScripts: async (filter?: { ids?: string[] }) =>
        [...registered.values()].filter((script) => !filter?.ids || filter.ids.includes(script.id)),
      registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        for (const script of scripts) {
          if (registered.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`)
          registered.set(script.id, script)
        }
      }),
      unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
        for (const id of ids) {
          if (!registered.delete(id)) throw new Error(`Nonexistent script ID '${id}'`)
        }
      }),
      executeScript: vi.fn(async () => [{ frameId: 0, result: undefined }]),
    },
  }
  vi.stubGlobal('chrome', chrome)
  return { chrome, values, granted, registered }
}

describe('connected sites', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects a site: asks for its origin only, then registers the bridge for its pages', async () => {
    const { chrome, registered } = fakeChrome()

    expect(await connectSite(heka)).toEqual({ injected: false })

    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://heka.example/*'] })
    expect([...registered.values()]).toEqual([
      {
        id: 'heka-bridge:https://heka.example',
        matches: ['https://heka.example/*'],
        js: ['content-scripts/heka-bridge.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ])
    expect(await loadConnectedSites()).toEqual([heka])
    expect(await isConnectedOrigin(heka)).toBe(true)

    expect(await connectSite(heka)).toEqual({ injected: false })
    expect(chrome.scripting.registerContentScripts).toHaveBeenCalledTimes(1)
    expect(await loadConnectedSites()).toEqual([heka])
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it('injects the bridge into the page already open in the tab, without a reload', async () => {
    const { chrome } = fakeChrome()

    expect(await connectSite(heka, 42)).toEqual({ injected: true })
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content-scripts/heka-bridge.js'],
    })

    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents of the page.'))
    expect(await connectSite(heka, 42)).toEqual({ injected: false })
    expect(await isConnectedOrigin(heka)).toBe(true)
  })

  it('connects nothing when the holder refuses the access', async () => {
    const { chrome, registered } = fakeChrome()
    chrome.permissions.request.mockResolvedValueOnce(false)

    expect(await connectSite(heka, 42)).toBeNull()
    expect(registered.size).toBe(0)
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(await isConnectedOrigin(heka)).toBe(false)
  })

  it('gives the access back when the site cannot be connected, so it is never half-connected', async () => {
    const { chrome, granted, registered } = fakeChrome()
    chrome.scripting.registerContentScripts.mockRejectedValueOnce(new Error('Could not load content script'))

    await expect(connectSite(heka, 42)).rejects.toThrow('Could not load content script')

    expect(granted.size).toBe(0)
    expect(registered.size).toBe(0)
    expect(await loadConnectedSites()).toEqual([])
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()

    // Registered, but not stored: the registration goes as well.
    const set = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    await expect(connectSite(heka, 42)).rejects.toThrow('QUOTA_BYTES')
    expect(set).toHaveBeenCalled()
    expect(granted.size).toBe(0)
    expect(registered.size).toBe(0)
    expect(await isConnectedOrigin(heka)).toBe(false)
  })

  it('disconnects a site: forgets it, unregisters the bridge and gives up the access', async () => {
    const { chrome, granted, registered } = fakeChrome()
    await connectSite(heka)

    await disconnectSite(heka)

    expect(await isConnectedOrigin(heka)).toBe(false)
    expect(registered.size).toBe(0)
    expect(granted.size).toBe(0)
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ origins: ['https://heka.example/*'] })
    await expect(disconnectSite(heka)).resolves.toBeUndefined()
  })

  it('reconciles: registers stored sites, drops sites whose access was removed, unregisters strays', async () => {
    const { values, granted, registered } = fakeChrome()
    values.set(CONNECTED_SITES_KEY, [heka, 'https://revoked.example'])
    granted.add('https://heka.example/*')
    registered.set('heka-bridge:https://gone.example', {
      id: 'heka-bridge:https://gone.example',
      matches: ['https://gone.example/*'],
    })
    registered.set('other-script', { id: 'other-script', matches: ['https://other.example/*'] })

    await reconcileConnectedSites()

    expect(await loadConnectedSites()).toEqual([heka])
    expect([...registered.keys()].sort()).toEqual(['heka-bridge:https://heka.example', 'other-script'])
  })

  it('drops only the sites whose access was removed, and stops their bridge', async () => {
    const { granted, registered } = fakeChrome()
    await connectSite(heka)
    await connectSite('https://revoked.example')
    granted.delete('https://revoked.example/*')

    expect(await dropRevokedSites()).toEqual([heka])

    expect(await loadConnectedSites()).toEqual([heka])
    expect([...registered.keys()]).toEqual(['heka-bridge:https://heka.example'])
    expect(await dropRevokedSites()).toEqual([heka])
  })

  it("treats the development build's static bridge origins as connected", async () => {
    fakeChrome([{ matches: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'] }])

    expect(builtInBridgeOrigins()).toEqual(['http://localhost:8000', 'http://127.0.0.1:8000'])
    expect(await isConnectedOrigin('http://localhost:8000')).toBe(true)
    expect(await isConnectedOrigin('http://localhost:3000')).toBe(false)
    expect(await isConnectedOrigin(undefined)).toBe(false)
  })
})
