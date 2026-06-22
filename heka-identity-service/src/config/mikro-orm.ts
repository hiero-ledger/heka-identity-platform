import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { registerAs } from '@nestjs/config'

export default registerAs('mikro-orm', () => ({
  driver: PostgreSqlDriver,
  host: process.env.MIKRO_ORM_HOST || 'localhost',
  port: process.env.MIKRO_ORM_PORT ? parseInt(process.env.MIKRO_ORM_PORT, 10) : 5432,
  user: process.env.MIKRO_ORM_USER || 'heka',
  password: process.env.MIKRO_ORM_PASSWORD || 'heka1',
  dbName: process.env.MIKRO_ORM_DATABASE || 'heka-identity-service',
  logging: process.env.MIKRO_ORM_LOGGING || 'all',
  forceUtcTimezone: true,
  metadataCache: {
    enabled: false,
  },
  debug: false,
}))
