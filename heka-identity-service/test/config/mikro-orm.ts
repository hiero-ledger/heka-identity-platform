import { testDbHost, testDbPassword, testDbPort, testDbUser } from './db'

export default () =>
  ({
    type: 'postgresql',
    host: testDbHost,
    port: testDbPort,
    user: testDbUser,
    password: testDbPassword,
    dbName: 'test-heka-identity-service',
    driverOptions: {
      connection: {
        timezone: 'Z',
      },
    },
    // Each vitest test spins up a fresh Nest app (which creates its own ORM)
    // plus the standalone helper ORM used for schema management. Keeping the
    // default knex pool (max: 10) quickly exhausts Postgres' default 100
    // client cap within a single test file. Cap it tight for tests.
    pool: { min: 0, max: 2 },
    cache: {
      enabled: false,
    },
    debug: false,
  }) as const
