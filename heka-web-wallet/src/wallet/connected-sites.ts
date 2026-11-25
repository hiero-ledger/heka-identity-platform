import { grantableOrigin, originPattern } from './host-access'
import { CONNECTED_SITES_KEY } from './storage-keys'

const SCRIPT_ID_PREFIX = 'heka-bridge:'
const BRIDGE_SCRIPT = 'content-scripts/heka-bridge.js'

const scriptId = (origin: string) => `${SCRIPT_ID_PREFIX}${origin}`

/** Origins the build injects the bridge into without connecting them: the development build's web UI. */
export function builtInBridgeOrigins(): string[] {
  const scripts = chrome.runtime.getManifest().content_scripts ?? []
  return scripts
    .flatMap((script) => script.matches ?? [])
    .map((pattern) => grantableOrigin(pattern.replace(/\*$/, '')))
    .filter((origin): origin is string => origin !== null)
}

export async function loadConnectedSites(): Promise<string[]> {
  const stored = await chrome.storage.local.get(CONNECTED_SITES_KEY)
  const sites = stored[CONNECTED_SITES_KEY]
  return Array.isArray(sites) ? sites.filter((site): site is string => typeof site === 'string') : []
}

/** Whether the bridge may forward messages from a page on `origin`. */
export async function isConnectedOrigin(origin: string | undefined): Promise<boolean> {
  if (!origin) return false
  return builtInBridgeOrigins().includes(origin) || (await loadConnectedSites()).includes(origin)
}

async function registerBridge(origin: string): Promise<void> {
  const id = scriptId(origin)
  if ((await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length > 0) return
  await chrome.scripting.registerContentScripts([
    { id, matches: [originPattern(origin)], js: [BRIDGE_SCRIPT], runAt: 'document_idle', persistAcrossSessions: true },
  ])
}

async function unregisterBridge(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids })
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: registered.map(({ id }) => id) })
}

/**
 * Asks for access to `origin`, then runs the bridge on its pages from their next load, and now in
 * the page open in `tabId`. Returns null when the holder refused, else whether that page has the
 * bridge already. Must run from a click: Chrome rejects permissions.request without a user gesture.
 */
export async function connectSite(origin: string, tabId?: number): Promise<{ injected: boolean } | null> {
  if (!(await chrome.permissions.request({ origins: [originPattern(origin)] }))) return null
  try {
    await registerBridge(origin)
    const sites = await loadConnectedSites()
    if (!sites.includes(origin)) await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: [...sites, origin] })
  } catch (error) {
    // Not connected, so the site keeps neither its bridge nor the access just granted.
    await unregisterBridge([scriptId(origin)]).catch(() => undefined)
    await chrome.permissions.remove({ origins: [originPattern(origin)] }).catch(() => false)
    throw error
  }
  if (tabId === undefined) return { injected: false }
  const injected = await chrome.scripting
    .executeScript({ target: { tabId }, files: [BRIDGE_SCRIPT] })
    .then(() => true)
    .catch(() => false)
  return { injected }
}

/** Stops the bridge on `origin` and gives up the access to it. */
export async function disconnectSite(origin: string): Promise<void> {
  const sites = await loadConnectedSites()
  await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites.filter((site) => site !== origin) })
  await unregisterBridge([scriptId(origin)])
  // Fails for an origin the manifest grants at install (localhost in the development build).
  await chrome.permissions.remove({ origins: [originPattern(origin)] }).catch(() => false)
}

/**
 * Disconnects the stored sites whose access the holder removed in Chrome: forgets them and
 * unregisters their bridge. Returns the sites still connected.
 */
export async function dropRevokedSites(): Promise<string[]> {
  const sites = await loadConnectedSites()
  const granted = await Promise.all(
    sites.map((origin) => chrome.permissions.contains({ origins: [originPattern(origin)] })),
  )
  const kept = sites.filter((_, index) => granted[index])
  if (kept.length === sites.length) return kept
  await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: kept })
  await unregisterBridge(sites.filter((_, index) => !granted[index]).map(scriptId))
  return kept
}

/**
 * Registers the bridge for each stored site that still has its permission, and unregisters every
 * other bridge registration. A site whose access the holder removed in Chrome is disconnected.
 */
export async function reconcileConnectedSites(): Promise<void> {
  const kept = await dropRevokedSites()

  const registered = (await chrome.scripting.getRegisteredContentScripts())
    .map(({ id }) => id)
    .filter((id) => id.startsWith(SCRIPT_ID_PREFIX))
  const wanted = kept.map(scriptId)
  await unregisterBridge(registered.filter((id) => !wanted.includes(id)))
  for (const origin of kept) await registerBridge(origin)
}
