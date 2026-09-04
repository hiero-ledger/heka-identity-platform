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
const dcApiLink = element<HTMLAnchorElement>('dc-api-link')
const qrSection = element<HTMLElement>('qr')
const qrImage = element<HTMLImageElement>('qr-image')
const deepLink = element<HTMLAnchorElement>('deep-link')
const qrStatus = element<HTMLParagraphElement>('qr-status')
let qrStarted = false

const getJson = <T>(url: string, options?: RequestInit): Promise<T> => fetch(url, options).then((res) => res.json() as Promise<T>)

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

function dcApiSupported(): boolean {
  if (!('credentials' in navigator) || typeof navigator.credentials.get !== 'function') return false
  if (!('DigitalCredential' in window)) return false
  const digitalCredential = (window as { DigitalCredential?: DigitalCredentialConstructor }).DigitalCredential
  const allows = digitalCredential?.userAgentAllowsProtocol
  if (typeof allows !== 'function') return true
  return allows.call(digitalCredential, 'openid4vp-v1-signed') || allows.call(digitalCredential, 'openid4vp-v1-unsigned')
}

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
      if (isMobilePlatform() && data.authorizationRequest) {
        deepLink.href = data.authorizationRequest
        deepLink.hidden = false
      }
      qrStatus.textContent = 'Waiting for the wallet presentation…'
      connectPush()
    })
    .catch(() => {
      qrStatus.textContent = 'The sign-in attempt could not be started.'
    })
}

let finished = false
let pollingActive = false
let pollTimer: ReturnType<typeof setTimeout> | null = null

function handleStatus(data: LoginStatus | null | undefined): void {
  if (finished || !data) return
  if (data.status === 'verified') {
    finished = true
    stopPolling()
    qrStatus.textContent = 'Presentation verified — signing you in…'
    window.location.href = completeUrl
  } else if (data.status === 'error') {
    stopPolling()
    qrStatus.textContent = data.message || 'Sign-in failed.'
  }
}

const fetchStatus = (): Promise<LoginStatus> => getJson<LoginStatus>(`${base}/status`, { headers: { accept: 'application/json' } })

function pollLoop(delay: number): void {
  pollTimer = setTimeout(() => {
    fetchStatus()
      .then((data) => {
        handleStatus(data)
        if (pollingActive && !finished) pollLoop(2000)
      })
      .catch(() => {
        if (pollingActive && !finished) pollLoop(5000)
      })
  }, delay)
}

function startPolling(): void {
  if (pollingActive || finished) return
  pollingActive = true
  pollLoop(2000)
}

function stopPolling(): void {
  pollingActive = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function connectPush(): void {
  if (!('WebSocket' in window)) {
    startPolling()
    return
  }
  let socket: WebSocket
  try {
    const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
    socket = new WebSocket(`${scheme}${window.location.host}${base}/events`)
  } catch {
    startPolling()
    return
  }
  let opened = false
  const openGuard = setTimeout(() => {
    if (!opened) startPolling()
  }, 4000)
  socket.onopen = () => {
    opened = true
    clearTimeout(openGuard)
    stopPolling()
    // catch up on anything that happened before the socket connected
    fetchStatus()
      .then(handleStatus)
      .catch(() => {})
  }
  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      handleStatus(JSON.parse(event.data) as LoginStatus)
    } catch {
      // ignore malformed frames
    }
  }
  socket.onclose = () => {
    clearTimeout(openGuard)
    if (!finished) startPolling()
  }
  socket.onerror = () => {
    // onclose follows and starts polling
  }
}

function startDcApi(statusEl: HTMLParagraphElement): void {
  dcApiButton.disabled = true
  statusEl.textContent = 'Waiting for your wallet…'
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
      statusEl.textContent = 'Verifying the presentation…'
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
      statusEl.textContent = 'Presentation verified — signing you in…'
      window.location.href = completeUrl
    })
    .catch((error: unknown) => {
      dcApiButton.disabled = false
      const name = error instanceof Error ? error.name : undefined
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // picker dismissed / no credential chosen — let the user retry
        statusEl.textContent = 'Sign-in was cancelled — try again.'
      } else {
        let message = error instanceof Error ? error.message : ''
        if (message === 'start-failed' || message === 'no-credential') message = ''
        statusEl.textContent = message || 'Sign-in failed — try again.'
      }
    })
}

function isMobilePlatform(): boolean {
  const hints = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData
  if (typeof hints?.mobile === 'boolean') return hints.mobile
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

applyBranding()

if (isMobilePlatform() && dcApiSupported()) {
  dcApiSection.hidden = false
  dcApiButton.addEventListener('click', () => startDcApi(dcApiStatus))
} else {
  startQr()
  if (!isMobilePlatform() && dcApiSupported()) {
    dcApiLink.hidden = false
    dcApiLink.addEventListener('click', (event) => {
      event.preventDefault()
      startDcApi(qrStatus)
    })
  }
}
