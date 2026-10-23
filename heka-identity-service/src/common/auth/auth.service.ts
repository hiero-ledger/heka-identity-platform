import { IncomingMessage } from 'http'

import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Mutex } from 'async-mutex'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { User, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import { AuthInfo, isRole } from './auth-info.interface'
import { TokenPayload } from './token-payload.interface'
import { TokenVerifier } from './token-verifier.service'

@Injectable()
export class AuthService {
  private readonly ensureUserAndWalletMutex: Mutex
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    private readonly tokenVerifier: TokenVerifier,
    private readonly em: EntityManager,
    @InjectLogger(AuthService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
    this.ensureUserAndWalletMutex = new Mutex()
  }

  /**
   * Authenticates an incoming HTTP or WebSocket upgrade request by its bearer token.
   * Throws `UnauthorizedException` when the token is missing, invalid, or does not meet the claim contract.
   */
  public async validateRequestToken(request: IncomingMessage): Promise<AuthInfo> {
    // Bind only the method and URL: the request carries the access token in its headers
    const logger = this.logger.child('validateRequestToken', { method: request.method, url: request.url })
    logger.trace('>')

    const token = extractTokenFromHeader(request)
    const { authInfo } = await this.authenticateToken(token)

    logger.trace({ userId: authInfo.userId }, '<')
    return authInfo
  }

  /**
   * Authenticates a WebSocket upgrade request. Browsers cannot set headers on a WebSocket, so the token
   * may arrive as the second entry of `Sec-WebSocket-Protocol` after {@link WEBSOCKET_BEARER_PROTOCOL};
   * the `Authorization` header still works for other clients.
   * Returns the token's `exp` (seconds since epoch) so the caller can close the socket when it expires.
   */
  public async validateWebSocketToken(request: IncomingMessage): Promise<{ authInfo: AuthInfo; expiresAt?: number }> {
    const logger = this.logger.child('validateWebSocketToken', { url: request.url })
    logger.trace('>')

    const token = extractTokenFromProtocolHeader(request) ?? extractTokenFromHeader(request)
    const result = await this.authenticateToken(token)

    logger.trace({ userId: result.authInfo.userId, expiresAt: result.expiresAt }, '<')
    return result
  }

  /** Verifies a bearer token and resolves its user and wallet; `expiresAt` is the token's `exp`. */
  private async authenticateToken(token: string | undefined): Promise<{ authInfo: AuthInfo; expiresAt?: number }> {
    if (!token) {
      throw new UnauthorizedException('Authorization token is missing')
    }

    const payload = await this.tokenVerifier.verify(token)
    const authInfo = await this.validateTokenPayload(payload)
    return { authInfo, expiresAt: payload.exp }
  }

  public async validateTokenPayload(tokenPayload: TokenPayload): Promise<AuthInfo> {
    const logger = this.logger.child('validateTokenPayload', { tokenPayload })
    logger.trace('>')

    const userId = tokenPayload.sub
    const orgId = tokenPayload.org_id
    const userName = tokenPayload.name

    if (tokenPayload.roles.length !== 1 || !isRole(tokenPayload.roles[0])) {
      throw new UnauthorizedException()
    }

    const role = tokenPayload.roles[0]
    const walletId = getWalletId({ role, userId, orgId })

    const [user, wallet] = await this.ensureUserAndWalletMutex.runExclusive(async () => {
      const user = await this.ensureUser(userId)
      const wallet = await this.ensureWallet(walletId)

      await user.wallets.init()

      if (!user.wallets.contains(wallet)) {
        user.wallets.add(wallet)
        await this.em.flush()
      }
      return [user, wallet]
    })

    const res = {
      userId,
      user,
      userName,
      role,
      orgId,
      walletId,
      tenantId: wallet.tenantId,
    }

    logger.trace({ res }, '<')
    return res
  }

  private async ensureUser(id: string): Promise<User> {
    const logger = this.logger.child('ensureUser', { id })
    logger.trace('>')

    let user = await this.em.findOne(User, { id })

    if (!user) {
      user = new User({ id })
      this.em.persist(user)
      await this.em.flush()
      logger.info(`Created user: id=${id}`)
    }

    logger.trace({ res: user }, '<')
    return user
  }

  private async ensureWallet(id: string): Promise<Wallet> {
    const logger = this.logger.child('ensureWallet', { id })
    logger.trace('>')

    let wallet = await this.em.findOne(Wallet, { id })

    if (!wallet) {
      const tenantRecord = await this.agent.modules.tenants.createTenant({
        config: { label: id },
      })

      wallet = new Wallet({ id, tenantId: tenantRecord.id })

      this.em.persist(wallet)
      await this.em.flush()
      logger.info(`Created wallet: id=${id}, tenantId=${tenantRecord.id}`)

      await withTenantAgent(
        {
          agent: this.agent,
          tenantId: wallet.tenantId,
        },
        async (tenantAgent) => {
          await tenantAgent.modules.anoncreds.createLinkSecret()
          logger.info(`Created default link secret for tenant with id=${tenantRecord.id}`)
        },
      )
    }

    logger.trace({ res: wallet }, '<')
    return wallet
  }
}

function extractTokenFromHeader(request: IncomingMessage): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? []
  return type === 'Bearer' ? token : undefined
}

/** Subprotocol a browser offers first, followed by its access token, when opening the notifications socket. */
export const WEBSOCKET_BEARER_PROTOCOL = 'heka.bearer'

function extractTokenFromProtocolHeader(request: IncomingMessage): string | undefined {
  const protocols = (request.headers['sec-websocket-protocol'] ?? '').split(',').map((value) => value.trim())
  const markerIndex = protocols.indexOf(WEBSOCKET_BEARER_PROTOCOL)
  if (markerIndex === -1) return undefined
  return protocols[markerIndex + 1] || undefined
}
