import { ConfigService } from '@config'
import { User, UserRole } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { hashPassword } from '@utils'

/**
 * Creates the first `Admin` from `ADMIN_NAME` / `ADMIN_PASSWORD` when no `Admin` exists. Further roles are assigned
 * through the role assignment API. An existing user with that name is never promoted, so a name registered by someone
 * else cannot become an `Admin`.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name)

  public constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const { adminName, adminPassword } = this.configService.appConfig
    if (!adminName || !adminPassword) {
      return
    }

    const em = this.em.fork()
    if (await em.count(User, { role: UserRole.Admin })) {
      return
    }

    if (await em.findOne(User, { name: adminName })) {
      this.logger.warn(`No Admin is created: user '${adminName}' already exists and is not promoted`)
      return
    }

    em.persist(new User({ name: adminName, password: await hashPassword(adminPassword), role: UserRole.Admin }))
    await em.flush()
    this.logger.log(`Created the first Admin '${adminName}'`)
  }
}
