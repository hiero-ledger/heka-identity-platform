import { validateSync } from 'class-validator'
import { JwtConfig } from '../jwt.config'

describe('JwtConfig', () => {
  const validEnv = {
    JWT_ISSUER: 'Heka',
    JWT_AUDIENCE: 'Heka Identity Service',
    JWT_SECRET: 'a]3Fj$9kL!mN0pQrStUvWxYz12345678',
    JWT_ACCESS_EXPIRY: '3600',
    JWT_REFRESH_EXPIRY: '86400',
    DEMO_USER: 'demo',
  }

  test('accepts a valid JWT_SECRET with 32+ characters', () => {
    const config = new JwtConfig(validEnv)
    const errors = validateSync(config, { skipMissingProperties: false })
    expect(errors.length).toBe(0)
    expect(config.secret).toBe(validEnv.JWT_SECRET)
  })

  test('rejects when JWT_SECRET is missing', () => {
    const env = { ...validEnv }
    delete (env as Record<string, any>).JWT_SECRET
    const config = new JwtConfig(env)
    const errors = validateSync(config, { skipMissingProperties: false })
    expect(errors.length).toBeGreaterThan(0)
  })

  test('rejects when JWT_SECRET is shorter than 32 characters', () => {
    const env = { ...validEnv, JWT_SECRET: 'tooshort' }
    const config = new JwtConfig(env)
    const errors = validateSync(config, { skipMissingProperties: false })
    expect(errors.length).toBeGreaterThan(0)
  })

  test('rejects when JWT_SECRET is "test"', () => {
    const env = { ...validEnv, JWT_SECRET: 'test' }
    const config = new JwtConfig(env)
    const errors = validateSync(config, { skipMissingProperties: false })
    expect(errors.length).toBeGreaterThan(0)
  })
})
