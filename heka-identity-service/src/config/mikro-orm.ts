import { registerAs } from '@nestjs/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

export default registerAs('mikro-orm', () => ({
  type: process.env.MIKRO_ORM_DATABASE_TYPE || 'postgresql',
  host: process.env.MIKRO_ORM_HOST || 'localhost',
  port: process.env.MIKRO_ORM_PORT ? parseInt(process.env.MIKRO_ORM_PORT, 10) : 5432,
  user: requireEnv('MIKRO_ORM_USER'),
  password: requireEnv('MIKRO_ORM_PASSWORD'),
  dbName: process.env.MIKRO_ORM_DATABASE || 'heka-identity-service',
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
}))
