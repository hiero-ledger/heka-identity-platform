import { ConfigService, IdentityServiceConfig } from '@config'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import WebSocket from 'ws'

import { IdentityServiceTokenProvider } from './identity-service-token.provider'
import { VerificationSessionState } from './verification-session.client'

/** A verification-session state change pushed by heka-identity-service (P3.7). */
export interface VerificationSessionEvent {
  sessionId: string
  state: VerificationSessionState
  errorMessage?: string
}

/** Credo's `OpenId4VcVerifierEvents.VerificationSessionStateChanged` — the event type the bridge consumes. */
const VERIFICATION_SESSION_STATE_CHANGED = 'OpenId4VcVerifier.VerificationSessionStateChanged'

/** Close code the identity-service gateway uses for failed token validation. */
const CLOSE_UNAUTHORIZED = 3000

/**
 * WebSocket subscription to heka-identity-service's notification gateway
 * (INTEGRATION.md P3.7, §3 "Async completion signals"): one server-side
 * connection to `ws(s)://<identity-service>/notifications`, authenticated with
 * the same bearer token as the REST client (P1.6.7). Verification-session
 * state changes are forwarded to the handler; everything else is ignored.
 *
 * The gateway keys connections **per user id** (last connection wins), so the
 * bridge must use its own dedicated service account — sharing an account with
 * another consumer would silently steal each other's notifications.
 *
 * Push is an optimization, not a dependency: on any failure the client
 * reconnects with capped exponential backoff, and the login page's polling
 * fallback (P1.6.3) keeps working regardless.
 */
@Injectable()
export class IdentityServiceEventsClient implements OnModuleDestroy {
  private readonly logger = new Logger(IdentityServiceEventsClient.name)
  private readonly config: IdentityServiceConfig

  private handler: ((event: VerificationSessionEvent) => void) | null = null
  private socket: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelayMs: number
  private connectionLogged = false

  /** Reconnect pacing — overridable in tests. */
  public reconnectBaseMs = 1_000
  public reconnectMaxMs = 30_000

  public constructor(
    configService: ConfigService,
    private readonly tokens: IdentityServiceTokenProvider,
  ) {
    this.config = configService.oidcConfig.identityService
    this.reconnectDelayMs = this.reconnectBaseMs
  }

  /** Start (and keep) the subscription; safe to call once from the module wiring. */
  public start(handler: (event: VerificationSessionEvent) => void): void {
    if (this.handler) return
    this.handler = handler
    this.reconnectDelayMs = this.reconnectBaseMs
    void this.connect()
  }

  public stop(): void {
    this.handler = null
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.discardSocket()
  }

  public onModuleDestroy(): void {
    this.stop()
  }

  private async connect(): Promise<void> {
    if (!this.handler) return

    let token: string | undefined
    try {
      token = await this.tokens.getToken()
    } catch (error) {
      this.logger.warn(`Could not acquire a token for the notification subscription: ${error}`)
      this.scheduleReconnect()
      return
    }

    const url = `${this.config.baseUrl.replace(/^http/, 'ws')}/notifications`
    const socket = new WebSocket(url, { headers: { ...(token && { authorization: `Bearer ${token}` }) } })
    this.socket = socket

    socket.on('open', () => {
      this.reconnectDelayMs = this.reconnectBaseMs
      this.connectionLogged = true
      this.logger.log(`Subscribed to identity-service verification events (${url})`)
    })

    socket.on('message', (data) => {
      try {
        const notification = JSON.parse(String(data))
        if (notification?.type !== VERIFICATION_SESSION_STATE_CHANGED) return
        const session = notification.verificationSession
        if (!session?.id || !session?.state) return
        this.handler?.({
          sessionId: session.id,
          state: session.state as VerificationSessionState,
          errorMessage: session.errorMessage,
        })
      } catch (error) {
        this.logger.warn(`Discarding unparseable notification: ${error}`)
      }
    })

    socket.on('close', (code) => {
      if (code === CLOSE_UNAUTHORIZED) {
        // token rejected — drop the cached one so the reconnect logs in afresh
        this.logger.warn('Notification subscription closed as unauthorized — re-acquiring the service-account token')
        this.tokens.invalidate()
      }
      this.scheduleReconnect()
    })

    socket.on('error', (error) => {
      // 'close' follows and schedules the reconnect; log the first failure prominently, then quietly
      if (this.connectionLogged) {
        this.logger.warn(`Notification subscription error: ${error.message}`)
        this.connectionLogged = false
      } else {
        this.logger.debug(`Notification subscription error: ${error.message}`)
      }
    })
  }

  private scheduleReconnect(): void {
    if (!this.handler || this.reconnectTimer) return
    this.discardSocket()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, this.reconnectDelayMs)
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.reconnectMaxMs)
  }

  /** Detach and close the socket; a parked error listener absorbs late failures (no unhandled 'error'). */
  private discardSocket(): void {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    socket.removeAllListeners()
    socket.on('error', () => {})
    socket.close()
  }
}
