import React, { useEffect, useState } from 'react'

import { builtInBridgeOrigins, connectSite, disconnectSite, loadConnectedSites } from '../../wallet/connected-sites'
import { grantableOrigin } from '../../wallet/host-access'

type Site = { origin: string; tabId?: number; connection: 'none' | 'connected' | 'built-in' }

const PINK = '#c6136a'
const CARD = '#1a1118'

/** The active tab's site: connect it so its pages can hand offers and requests to the wallet. */
export const SiteConnection: React.FC = () => {
  const [site, setSite] = useState<Site | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      // activeTab: opening the popup lets the wallet read the active tab's URL.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const origin = grantableOrigin(tab?.url)
      if (!origin) return
      if (builtInBridgeOrigins().includes(origin)) setSite({ origin, connection: 'built-in' })
      else {
        const connected = (await loadConnectedSites()).includes(origin)
        setSite({ origin, tabId: tab.id, connection: connected ? 'connected' : 'none' })
      }
    })()
  }, [])

  if (!site) return null

  const onConnect = async () => {
    try {
      const connected = await connectSite(site.origin, site.tabId)
      if (!connected) {
        setNote(`Access to ${site.origin} was not allowed.`)
        return
      }
      setSite({ ...site, connection: 'connected' })
      setNote(connected.injected ? 'Connected.' : 'Connected. Reload the page to use the wallet there.')
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not connect this site.')
    }
  }

  const onDisconnect = async () => {
    await disconnectSite(site.origin)
    setSite({ ...site, connection: 'none' })
    setNote('Disconnected. Pages already open keep the bridge until they reload, but the wallet ignores them.')
  }

  return (
    <div style={s.card}>
      <div style={s.row}>
        <span style={s.origin}>{site.origin}</span>
        {site.connection === 'none' && (
          <button type="button" style={s.button} onClick={() => void onConnect()}>
            Connect this site
          </button>
        )}
        {site.connection === 'connected' && (
          <button type="button" style={s.secondary} onClick={() => void onDisconnect()}>
            Disconnect
          </button>
        )}
      </div>
      <p style={s.note}>
        {note ??
          (site.connection === 'built-in'
            ? 'Connected by this development build.'
            : site.connection === 'connected'
              ? 'This site can send credential offers and presentation requests to the wallet.'
              : 'Connect this site to let it send credential offers and presentation requests to the wallet.')}
      </p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card: {
    background: CARD,
    border: '1px solid rgba(198,19,106,0.2)',
    borderRadius: 14,
    padding: '10px 14px',
    marginBottom: 12,
  },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  origin: { flex: 1, fontSize: 12, color: '#fff', fontWeight: 700, wordBreak: 'break-all' },
  button: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 999,
    background: PINK,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  secondary: {
    padding: '6px 12px',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 999,
    background: 'transparent',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  note: { marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 },
}
