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
    cache: {
      enabled: false,
    },
    debug: false,
  }) as const
