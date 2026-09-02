import { IncomingMessage, Server } from 'node:http'
import { Duplex } from 'node:stream'

import { ConfigService } from '@config'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Keygrip from 'keygrip'
import WebSocket, { WebSocketServer } from 'ws'

import { LoginStatus } from './identity-acquirer'
import { VerificationSessionEvent } from './identity-service-events.client'
import { VerificationSessionState } from './verification-session.client'

/**
 * `GET /interaction/:uid/events` upgraded to a WebSocket. The uid is
 * matched against the provider's uid alphabet (nanoid) directly — no
 * `decodeURIComponent`, which throws on malformed percent-encoding, and a
 * throw in an `upgrade` listener would take the process down. The length
 * bound keeps oversized segments away from the keygrip verification.
 */
const EVENTS_PATH = /^\/interaction\/([\w-]{1,128})\/events$/

/**
 * WebSocket push to the login page: the page opens
 * `ws(s)://<bridge>/interaction/:uid/events` and receives `LoginStatus`
 * pushes (same JSON shape as the `:uid/status` polling route) whenever
 * heka-identity-service reports a state change for one of the interaction's
 * verification sessions.
 *
 * The binding rule holds for the push channel exactly as for the JSON
 * routes: the endpoint lives under the interaction's cookie path, and the
 * upgrade is accepted only when the request carries the provider's **signed**
 * `_interaction` cookie whose value matches the uid in the URL (verified with
 * the same `cookies.keys` keygrip the provider signs with). No cookie, bad
 * signature, or a foreign uid → 400, no session state leaks.
 *
 * Session→interaction mapping is registered by the wallet acquirer when it
 * creates verification sessions; like the other stores it is
 * in-memory (single-instance dev) until interaction state is persisted.
 */
@Injectable()
export class LoginEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(LoginEventsService.name)
  private readonly keys: Keygrip
  private readonly ttlMs: number

  private wss: WebSocketServer | null = null
  private readonly subscribers = new Map<string, Set<WebSocket>>()
  private readonly sessions = new Map<string, { uid: string; expiresAt: number }>()

  public constructor(configService: ConfigService) {
    this.keys = new Keygrip(configService.oidcConfig.cookieKeys)
    this.ttlMs = configService.oidcConfig.ttl.interaction * 1000
  }

  /** Hook the upgrade handling onto the app's HTTP server (called from `MainModule.appConfigure`). */
  public attach(server: Server): void {
    if (this.wss) return
    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      // a throw here is an uncaught exception on the server — fail the socket, never the process
      try {
        const path = (request.url ?? '').split('?')[0]
        const match = EVENTS_PATH.exec(path)
        if (!match) {
          // no other upgrade surface exists on the bridge
          socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }

        const uid = match[1]
        if (!this.isBoundToInteraction(request, uid)) {
          this.logger.warn(`Rejected an events subscription without a valid interaction cookie (uid ${uid})`)
          socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }

        this.wss!.handleUpgrade(request, socket, head, (client) => this.subscribe(uid, client))
      } catch (error) {
        this.logger.error(`Upgrade handling failed: ${error}`)
        socket.destroy()
      }
    })
  }

  /** Map a verification session to its interaction so events can be routed (called by the wallet acquirer). */
  public registerSession(sessionId: string, interactionUid: string): void {
    this.prune()
    this.sessions.set(sessionId, { uid: interactionUid, expiresAt: Date.now() + this.ttlMs })
  }

  /** Route an identity-service verification event to the interaction's page sockets. */
  public handleSessionEvent(event: VerificationSessionEvent): void {
    const entry = this.sessions.get(event.sessionId)
    if (!entry || entry.expiresAt <= Date.now()) return

    const sockets = this.subscribers.get(entry.uid)
    if (!sockets?.size) return

    const status = LoginEventsService.toLoginStatus(event)
    this.logger.log(`Interaction ${entry.uid}: pushing '${status.status}' (session ${event.sessionId})`)
    const payload = JSON.stringify(status)
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    }
  }

  public onModuleDestroy(): void {
    for (const sockets of this.subscribers.values()) {
      for (const socket of sockets) socket.close()
    }
    this.subscribers.clear()
    this.wss?.close()
    this.wss = null
  }

  /**
   * binding for the upgrade request: the signed `_interaction` cookie
   * (name=value signed by the provider's keygrip over `cookies.keys`, sig in
   * `_interaction.sig`) must be present, valid, and match the URL's uid.
   */
  private isBoundToInteraction(request: IncomingMessage, uid: string): boolean {
    const cookies = LoginEventsService.parseCookies(request.headers.cookie)
    const value = cookies['_interaction']
    const signature = cookies['_interaction.sig']
    if (!value || !signature) return false
    if (!this.keys.verify(`_interaction=${value}`, signature)) return false
    return value === uid
  }

  private subscribe(uid: string, socket: WebSocket): void {
    let sockets = this.subscribers.get(uid)
    if (!sockets) {
      sockets = new Set()
      this.subscribers.set(uid, sockets)
    }
    sockets.add(socket)
    this.logger.log(`Interaction ${uid}: login page subscribed to push events`)

    socket.on('close', () => {
      sockets.delete(socket)
      if (sockets.size === 0) this.subscribers.delete(uid)
    })
    // the page never sends anything meaningful; ignore incoming frames
    socket.on('message', () => {})
    socket.on('error', () => socket.close())
  }

  private static toLoginStatus(event: VerificationSessionEvent): LoginStatus {
    switch (event.state) {
      case VerificationSessionState.ResponseVerified:
        return { status: 'verified' }
      case VerificationSessionState.Error:
        return { status: 'error', message: event.errorMessage ?? 'The presentation could not be verified.' }
      default:
        return { status: 'pending' }
    }
  }

  private static parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {}
    for (const pair of (header ?? '').split(';')) {
      const separator = pair.indexOf('=')
      if (separator < 0) continue
      cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim()
    }
    return cookies
  }

  private prune(): void {
    const now = Date.now()
    for (const [sessionId, entry] of this.sessions) {
      if (entry.expiresAt <= now) this.sessions.delete(sessionId)
    }
  }
}
