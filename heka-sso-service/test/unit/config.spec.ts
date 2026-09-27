import { Config, validate } from '../../src/core/config'

describe('Config', () => {
  test('builds with defaults from an empty configuration', () => {
    const config = new Config({})

    expect(config.app.name).toBe('Heka SSO Service')
    expect(config.app.port).toBe(3005)
    expect(config.app.prefix).toBe('api')
    expect(config.db.name).toBe('heka-sso-service')
    expect(config.logger.level).toBe('info')
    expect(config.throttle.ttl).toBe(60000)
    expect(config.throttle.limit).toBe(100)
  })

  test('reads values from the provided configuration', () => {
    const config = validate({
      APP_PORT: '4000',
      APP_ENABLE_CORS: 'true',
      LOG_LEVEL: 'debug',
      DB_HOST: 'db.internal',
      DB_PORT: '5432',
    })

    expect(config.app.port).toBe(4000)
    expect(config.app.enableCors).toBe(true)
    expect(config.logger.level).toBe('debug')
    expect(config.db.host).toBe('db.internal')
    expect(config.db.port).toBe(5432)
  })

  test('rejects an invalid configuration', () => {
    expect(() => validate({ APP_PORT: 'not-a-port' })).toThrow()
    expect(() => validate({ LOG_LEVEL: 'loud' })).toThrow()
  })
})
