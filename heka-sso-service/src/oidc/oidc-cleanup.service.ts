import { OidcEntity } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'

/**
 * Hourly purge of expired `oidc-provider` artifacts (INTEGRATION.md P1.5,
 * §5-Inherit-2 — the platform's expired-row cleanup pattern). The adapter
 * already treats expired rows as absent on read; this reclaims the storage.
 */
@Injectable()
export class OidcCleanupService {
  private readonly logger = new Logger(OidcCleanupService.name)
  private readonly em: EntityManager

  public constructor(em: EntityManager) {
    this.em = em.fork()
  }

  @Interval(1000 * 60 * 60) // 1 hr
  public async removeExpiredEntities(): Promise<number> {
    const removed = await this.em.nativeDelete(OidcEntity, { expiresAt: { $lt: new Date() } })
    if (removed > 0) this.logger.log(`Purged ${removed} expired OIDC artifact(s)`)
    return removed
  }
}
