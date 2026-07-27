import { PostgreSqlDriver } from '@mikro-orm/postgresql'

export default () =>
  ({
    dbName: process.env.MIKRO_ORM_DB || 'heka-auth-service',
    driver: PostgreSqlDriver,
    logging: process.env.MIKRO_ORM_LOGGING || 'all',
    password: process.env.MIKRO_ORM_PASSWORD || 'heka1',
    user: process.env.MIKRO_ORM_USER || 'heka',
    port: parseInt(process.env.MIKRO_ORM_PORT || '5432'),
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
