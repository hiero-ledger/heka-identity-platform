import { testDbHost, testDbPassword, testDbPort, testDbUser } from './db'

export default () =>
  ({
    host: testDbHost,
    port: testDbPort,
    user: testDbUser,
    password: testDbPassword,
    dbName: 'test-heka-identity-service',
    forceUtcTimezone: true,
    metadataCache: {
      enabled: false,
    },
    debug: false,
  }) as const
