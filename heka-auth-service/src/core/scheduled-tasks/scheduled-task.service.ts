import { Token } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'

@Injectable()
export class ScheduledTaskService {
  private readonly logger: Logger = new Logger(ScheduledTaskService.name)
  private readonly em: EntityManager

  constructor(em: EntityManager) {
    this.logger.verbose('>')
    this.em = em.fork()
    this.logger.verbose('<')
  }

  @Interval(1000 * 60 * 60) // 1 hr
  async removeObsoleteTokens() {
    this.logger.verbose('removeObsoleteTokens >')

    const expirationDate = new Date()
    await this.em.nativeDelete(Token, {
      $or: [{ expireIn: { $lt: expirationDate } }, { isRevoked: true }],
    })

    this.logger.verbose('removeObsoleteTokens <')
  }
}
