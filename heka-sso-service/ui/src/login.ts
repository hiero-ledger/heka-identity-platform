/**
 * Wallet login page logic (INTEGRATION.md P1.6 + P2.1 + P2.10.2 — the typed,
 * lintable source of what used to be an inline script). Behavior contract:
 *
 * - DC API preferred (P2.1): feature-detect `navigator.credentials.get()` +
 *   `DigitalCredential`, hand the signed request to the OS credential picker,
 *   forward the wallet's response to the bridge's origin-bound verify route.
 * - QR + polling fallback (P1.6.3): `/data` creates the `direct_post`
 *   verification session lazily (P2.1.1 — never before the QR path engages).
 * - Completion always navigates the SAME cookie-bound browser session to
 *   `/interaction/:uid/complete` (§3.3 binding rule).
 * - Per-client branding (P2.10.3) from `/interaction/:uid/branding` — purely
 *   cosmetic, failures ignored.
 */
import './styles.scss'

interface LoginStatus {
  status?: 'pending' | 'verified' | 'error'
  message?: string
}

interface LoginPageData extends LoginStatus {
  qrDataUrl?: string
  authorizationRequest?: string
}

interface DcApiStart extends LoginStatus {
  protocol?: string
  request?: unknown
}

interface Branding extends LoginStatus {
  productName?: string
  logoUrl?: string
  colors?: Record<string, string>
  customCss?: string
}

/** The Digital Credentials API surface the page feature-detects (P2.1). */
interface DigitalCredentialConstructor {
  userAgentAllowsProtocol?: (protocol: string) => boolean
}

interface DigitalCredentialLike {
  data?: unknown
}

const uidMatch = window.location.pathname.match(/\/interaction\/([^/]+)/)
const base = `/interaction/${uidMatch ? uidMatch[1] : ''}`
const completeUrl = `${base}/complete`

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const dcApiSection = element<HTMLElement>('dc-api')
const dcApiButton = element<HTMLButtonElement>('dc-api-button')
const dcApiStatus = element<HTMLParagraphElement>('dc-api-status')
const qrSection = element<HTMLElement>('qr')
const qrImage = element<HTMLImageElement>('qr-image')
const deepLink = element<HTMLAnchorElement>('deep-link')
const qrStatus = element<HTMLParagraphElement>('qr-status')
let qrStarted = false

const getJson = <T>(url: string, options?: RequestInit): Promise<T> =>
  fetch(url, options).then((res) => res.json() as Promise<T>)

/**
 * Per-client branding (P2.10.3): product name, logo, colors, custom CSS from
 * the login configuration — purely cosmetic, so failures are ignored.
 */
function applyBranding(): void {
  getJson<Branding>(`${base}/branding`)
    .then((branding) => {
      if (!branding || branding.status === 'error') return
      if (branding.productName) {
        document.title = `Sign in — ${branding.productName}`
        element<HTMLSpanElement>('brand-name').textContent = branding.productName
      }
      if (branding.logoUrl) element<HTMLImageElement>('brand-logo').src = branding.logoUrl
      if (branding.colors) {
        for (const [name, value] of Object.entries(branding.colors)) {
          const property = name.startsWith('--') ? name : `--${name}`
          document.documentElement.style.setProperty(property, String(value))
        }
      }
      if (branding.customCss) {
        const style = document.createElement('style')
        style.textContent = branding.customCss
        document.head.appendChild(style)
      }
    })
    .catch(() => {})
}

/**
 * Feature detection (P2.1): the DC API surface must exist, and where the
 * browser can tell us, it must route the OpenID4VP protocol ids we emit.
 */
function dcApiSupported(): boolean {
  if (!('credentials' in navigator) || typeof navigator.credentials.get !== 'function') return false
  if (!('DigitalCredential' in window)) return false
  const digitalCredential = (window as { DigitalCredential?: DigitalCredentialConstructor }).DigitalCredential
  const allows = digitalCredential?.userAgentAllowsProtocol
  if (typeof allows !== 'function') return true
  return (
    allows.call(digitalCredential, 'openid4vp-v1-signed') || allows.call(digitalCredential, 'openid4vp-v1-unsigned')
  )
}

/**
 * Cross-device fallback (P1.6.3): fetch the QR/deep-link data — this is what
 * creates the direct_post verification session — then poll status.
 */
function startQr(): void {
  qrSection.hidden = false
  if (qrStarted) return
  qrStarted = true
  getJson<LoginPageData>(`${base}/data`)
    .then((data) => {
      if (!data || !data.qrDataUrl) {
        qrStatus.textContent = (data && data.message) || 'The sign-in attempt could not be started.'
        return
      }
      qrImage.src = data.qrDataUrl
      qrImage.hidden = false
      deepLink.href = data.authorizationRequest ?? ''
      deepLink.hidden = false
      qrStatus.textContent = 'Waiting for the wallet presentation…'
      setTimeout(poll, 2000)
    })
    .catch(() => {
      qrStatus.textContent = 'The sign-in attempt could not be started.'
    })
}

function poll(): void {
  getJson<LoginStatus>(`${base}/status`, { headers: { accept: 'application/json' } })
    .then((data) => {
      if (data.status === 'verified') {
        qrStatus.textContent = 'Presentation verified — signing you in…'
        window.location.href = completeUrl
      } else if (data.status === 'error') {
        qrStatus.textContent = data.message || 'Sign-in failed.'
      } else {
        setTimeout(poll, 2000)
      }
    })
    .catch(() => setTimeout(poll, 5000))
}

/**
 * Same-device DC API path (P2.1): create a dc_api session, hand the request
 * to the OS credential picker, and forward the wallet's response to the
 * bridge, which verifies it via the identity service's origin-bound verify
 * endpoint. Requires a user gesture, hence the button.
 */
function startDcApi(): void {
  dcApiButton.disabled = true
  dcApiStatus.textContent = 'Waiting for your wallet…'
  getJson<DcApiStart>(`${base}/dc-api/start`, { method: 'POST' })
    .then((start) => {
      if (!start || !start.request) throw new Error((start && start.message) || 'start-failed')
      return navigator.credentials.get({
        digital: { requests: [{ protocol: start.protocol, data: start.request }] },
      } as CredentialRequestOptions) as Promise<DigitalCredentialLike | null>
    })
    .then((credential) => {
      if (!credential || !credential.data) throw new Error('no-credential')
      const data = credential.data
      const authorizationResponse = typeof data === 'string' ? (JSON.parse(data) as unknown) : data
      dcApiStatus.textContent = 'Verifying the presentation…'
      return getJson<LoginStatus>(`${base}/dc-api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorizationResponse }),
      })
    })
    .then((result) => {
      if (result.status !== 'verified') {
        throw new Error(result.message || 'The presentation could not be verified.')
      }
      dcApiStatus.textContent = 'Presentation verified — signing you in…'
      window.location.href = completeUrl
    })
    .catch((error: unknown) => {
      dcApiButton.disabled = false
      const name = error instanceof Error ? error.name : undefined
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // picker dismissed / no credential chosen — let the user retry or fall back
        dcApiStatus.textContent = 'Sign-in was cancelled — try again or use the QR code.'
      } else {
        let message = error instanceof Error ? error.message : ''
        if (message === 'start-failed' || message === 'no-credential') message = ''
        dcApiStatus.textContent = message || 'Sign-in failed — try the QR code instead.'
      }
      startQr()
    })
}

applyBranding()

if (dcApiSupported()) {
  dcApiSection.hidden = false
  dcApiButton.addEventListener('click', startDcApi)
  element<HTMLAnchorElement>('show-qr').addEventListener('click', (event) => {
    event.preventDefault()
    startQr()
  })
} else {
  startQr()
}
