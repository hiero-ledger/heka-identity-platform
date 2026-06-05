import { PostgreSqlDriver } from '@mikro-orm/postgresql'

export default () =>
  ({
    dbName: process.env.MIKRO_ORM_DB || 'heka-auth-service',
    driver: PostgreSqlDriver,
    logging: process.env.MIKRO_ORM_LOGGING || 'all',
    password: process.env.MIKRO_ORM_PASSWORD || 'heka1',
    user: process.env.MIKRO_ORM_USER || 'heka',
    port: parseInt(process.env.MIKRO_ORM_PORT || '5432'),
    // v7 uses kysely/pg; a `driverOptions.connection` object is forwarded to pg's
    // pool config as `connection`, which pg treats as the Connection instance and
    // breaks with "con.connect is not a function". UTC handling is covered by
    // `forceUtcTimezone` (default true in v7).
    forceUtcTimezone: true,
    metadataCache: {
      enabled: false,
    },
    debug: false,
  }) as const
