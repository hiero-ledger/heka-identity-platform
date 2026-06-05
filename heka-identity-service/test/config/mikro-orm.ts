import { testDbHost, testDbPassword, testDbPort, testDbUser } from './db'

export default () =>
  ({
    host: testDbHost,
    port: testDbPort,
    user: testDbUser,
    password: testDbPassword,
    dbName: 'test-heka-identity-service',
    // v7 (kysely/pg) forwards `driverOptions.connection` into pg's pool config as
    // `connection`, which breaks with "con.connect is not a function". UTC is
    // handled by `forceUtcTimezone` (default true in v7).
    forceUtcTimezone: true,
    // Each vitest test spins up a fresh Nest app (which creates its own ORM)
    // plus the standalone helper ORM used for schema management. Keeping the
    // default pool (max: 10) quickly exhausts Postgres' default 100
    // client cap within a single test file. Cap it tight for tests.
    pool: { min: 0, max: 2 },
    metadataCache: {
      enabled: false,
    },
    debug: false,
  }) as const
