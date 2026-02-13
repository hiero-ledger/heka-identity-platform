import { SqliteDriver } from '@mikro-orm/sqlite'

export default () =>
  ({
    dbName: `${process.env.HOME}/.heka-auth/data/heka-auth.db`,
    driver: SqliteDriver,
    logging: process.env.MIKRO_ORM_LOGGING || 'all',
    driverOptions: {
      connection: {
        timezone: 'Z',
      },
    },
    cache: {
      enabled: false,
    },
    debug: false,
  }) as const
