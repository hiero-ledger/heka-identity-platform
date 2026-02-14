import { IncomingMessage } from 'http'

import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Mutex } from 'async-mutex'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { User, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import { AuthInfo, isRole } from './auth-info.interface'
import { TokenPayload } from './token-payload.interface'

@Injectable()
export class AuthService {
  private readonly ensureUserAndWalletMutex: Mutex
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    private readonly jwtService: JwtService,
    private readonly em: EntityManager,
    @InjectLogger(AuthService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
    this.ensureUserAndWalletMutex = new Mutex()
  }

  public async validateRequestToken(request: IncomingMessage): Promise<AuthInfo> {
    const logger = this.logger.child('validateRequestToken', { request })
    logger.trace('>')

    const token = extractTokenFromHeader(request)
    if (!token) {
      throw new Error('Authorization token is missing')
    }
    logger.traceObject({ token })

    const payload = await this.jwtService.verifyAsync<TokenPayload>(token)
    logger.traceObject({ payload })

    return this.validateTokenPayload(payload)
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
      await this.em.persistAndFlush(user)
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

      await this.em.persistAndFlush(wallet)
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
