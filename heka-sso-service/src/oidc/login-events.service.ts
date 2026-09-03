import { IncomingMessage, Server } from 'node:http'
import { Duplex } from 'node:stream'

import { ConfigService } from '@config'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Keygrip from 'keygrip'
import WebSocket, { WebSocketServer } from 'ws'

import { LoginStatus } from './identity-acquirer'
import { VerificationSessionEvent } from './identity-service-events.client'
import { VerificationSessionState } from './verification-session.client'

const EVENTS_PATH = /^\/interaction\/([\w-]{1,128})\/events$/

/**
 * WebSocket push to the login page
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

  public attach(server: Server): void {
    if (this.wss) return
    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      try {
        const path = (request.url ?? '').split('?')[0]
        const match = EVENTS_PATH.exec(path)
        if (!match) {
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

  public registerSession(sessionId: string, interactionUid: string): void {
    this.prune()
    this.sessions.set(sessionId, { uid: interactionUid, expiresAt: Date.now() + this.ttlMs })
  }

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
   * binding for the upgrade request: the signed `_interaction` cookie must be present, valid,
   * and match the URL's uid.
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
