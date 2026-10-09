import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import pg from 'pg'

import { InjectLogger, Logger } from 'common/logger'
import MikroOrmConfig from 'config/mikro-orm'

/** PostgreSQL `lock_not_available`: `lock_timeout` elapsed while waiting. */
const LOCK_NOT_AVAILABLE = '55P03'

/**
 * A lock per wallet that holds across Identity Service instances: a PostgreSQL advisory lock on the wallet id.
 *
 * The lock is held by a dedicated connection, not one of the ORM pool: callers waiting for a lock would otherwise
 * occupy the pool connections the lock holder needs to finish. Closing the connection releases the lock, also when
 * the process dies.
 */
@Injectable()
export class WalletLockService {
  public constructor(
    @Inject(MikroOrmConfig.KEY)
    private readonly ormConfig: ConfigType<typeof MikroOrmConfig>,
    @InjectLogger(WalletLockService)
    private readonly logger: Logger,
  ) {}

  /**
   * Runs `operation` while holding the lock of `walletId`. Waits at most `timeoutSeconds` for the lock, then fails with
   * 503 so the caller can retry.
   */
  public async runExclusive<T>(walletId: string, timeoutSeconds: number, operation: () => Promise<T>): Promise<T> {
    const logger = this.logger.child('runExclusive', { walletId })
    const client = new pg.Client({
      host: this.ormConfig.host,
      port: this.ormConfig.port,
      user: this.ormConfig.user,
      password: this.ormConfig.password,
      database: this.ormConfig.dbName,
    })
    await client.connect()
    try {
      // `SET` takes no bind parameters; the value is an integer
      await client.query(`SET lock_timeout = ${Math.max(1, Math.round(timeoutSeconds * 1000))}`)
      try {
        await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`heka:wallet:${walletId}`])
      } catch (error) {
        if ((error as { code?: string }).code === LOCK_NOT_AVAILABLE) {
          logger.info(`Gave up waiting ${timeoutSeconds}s for the lock of wallet ${walletId}`)
          throw new ServiceUnavailableException(`Wallet ${walletId} is being prepared by another request; retry later`)
        }
        throw error
      }
      return await operation()
    } finally {
      // Ends the session, which releases the advisory lock
      await client.end().catch((error: unknown) => logger.warn({ err: error }, 'Failed to close the lock connection'))
    }
  }
}
