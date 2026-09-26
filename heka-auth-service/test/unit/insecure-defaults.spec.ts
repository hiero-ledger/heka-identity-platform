import { Logger } from '@nestjs/common'

import { validate } from '../../src/core/config/config.type'
import { dbConfigDefaults } from '../../src/core/config/configs/db.config'
import { jwtConfigDefaults } from '../../src/core/config/configs/jwt.config'
import {
  assertSecureConfiguration,
  findInsecureDefaults,
  INSECURE_DEFAULTS,
} from '../../src/core/config/insecure-defaults'

const secureEnv: Record<string, string> = {
  JWT_SECRET: 'a-long-random-secret-that-is-not-the-default',
  DB_PASSWORD: 'custom-db-password',
}

function thrownMessage(fn: () => void): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('Expected the function to throw')
}

describe('insecure defaults', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('config defaults reference the single source of truth', () => {
    expect(jwtConfigDefaults.secret).toBe(INSECURE_DEFAULTS.JWT_SECRET)
    expect(dbConfigDefaults.password).toBe(INSECURE_DEFAULTS.DB_PASSWORD)
  })

  describe('findInsecureDefaults', () => {
    it('returns nothing when every sensitive variable has a custom value', () => {
      expect(findInsecureDefaults(secureEnv)).toEqual([])
    })

    it.each(['JWT_SECRET', 'DB_PASSWORD'] as const)(
      'flags %s when unset, empty or equal to the known default',
      (name) => {
        const withoutVar = { ...secureEnv }
        delete withoutVar[name]
        expect(findInsecureDefaults(withoutVar)).toEqual([name])
        expect(findInsecureDefaults({ ...secureEnv, [name]: '' })).toEqual([name])
        expect(findInsecureDefaults({ ...secureEnv, [name]: INSECURE_DEFAULTS[name] })).toEqual([name])
      },
    )

    it('flags both variables when the environment is empty', () => {
      expect(findInsecureDefaults({})).toEqual(['JWT_SECRET', 'DB_PASSWORD'])
    })
  })

  describe('assertSecureConfiguration', () => {
    it('does nothing when the configuration is secure', () => {
      expect(() => assertSecureConfiguration(secureEnv)).not.toThrow()
      expect(() => assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'production' })).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('throws in production and names every insecure variable', () => {
      const env = { NODE_ENV: 'production', JWT_SECRET: 'test', DB_PASSWORD: 'heka1' }

      expect(() => assertSecureConfiguration(env)).toThrow(/JWT_SECRET, DB_PASSWORD/)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it.each([undefined, '', '  ', 'development', 'test', 'Development', ' TEST '])(
      'only warns outside production (NODE_ENV=%j)',
      (nodeEnv) => {
        const env: Record<string, unknown> = { ...secureEnv, JWT_SECRET: 'test' }
        if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv

        expect(() => assertSecureConfiguration(env)).not.toThrow()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/JWT_SECRET is unset/))
      },
    )

    it.each(['production', 'Production', ' PRODUCTION ', 'prod', 'prodution', 'staging', 'dev'])(
      'fails closed for any other NODE_ENV (NODE_ENV=%j)',
      (nodeEnv) => {
        const env = { NODE_ENV: nodeEnv, JWT_SECRET: 'test', DB_PASSWORD: 'heka1' }

        expect(() => assertSecureConfiguration(env)).toThrow(/JWT_SECRET, DB_PASSWORD/)
        expect(warnSpy).not.toHaveBeenCalled()
      },
    )

    it('explains when an unrecognized NODE_ENV is treated as production', () => {
      expect(() => assertSecureConfiguration({ NODE_ENV: 'staging', JWT_SECRET: 'test' })).toThrow(
        /NODE_ENV is set to a value other than development or test, so it is treated as production/,
      )
      expect(
        thrownMessage(() => assertSecureConfiguration({ NODE_ENV: ' Production ', JWT_SECRET: 'test' })),
      ).not.toContain('treated as production')
    })

    it('does nothing for a secure configuration under an unrecognized NODE_ENV', () => {
      expect(() => assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'staging' })).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('never includes secret or NODE_ENV values in the error or warning', () => {
      const env = { NODE_ENV: 'staging-xyz', JWT_SECRET: 'test', DB_PASSWORD: 'heka1' }

      const message = thrownMessage(() => assertSecureConfiguration(env))
      expect(message).toMatch(/JWT_SECRET, DB_PASSWORD/)
      expect(message).not.toContain('heka1')
      // The JWT_SECRET default (`test`) also occurs in the policy wording, so check no `NAME=value` is echoed.
      expect(message).not.toMatch(/[A-Z_]+\s*[=:]/)
      expect(message).not.toContain('staging-xyz')

      assertSecureConfiguration({ ...env, NODE_ENV: 'development' })
      const warning = String(warnSpy.mock.calls[0][0])
      expect(warning).toMatch(/JWT_SECRET, DB_PASSWORD/)
      expect(warning).toContain('unset, empty, development or test')
      expect(warning).not.toContain('heka1')
      expect(warning).not.toMatch(/[A-Z_]+\s*[=:]/)
    })
  })

  describe('validate', () => {
    // `DEMO_USER` has no default and is required by the existing class-validator rules
    const requiredEnv = { DEMO_USER: 'demo' }

    it('returns the config and warns when defaults are used outside production', () => {
      const config = validate(requiredEnv)

      expect(config.jwt.secret).toBe(INSECURE_DEFAULTS.JWT_SECRET)
      expect(config.db.password).toBe(INSECURE_DEFAULTS.DB_PASSWORD)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('returns the config without warning when secrets are configured', () => {
      const config = validate({ ...requiredEnv, ...secureEnv, NODE_ENV: 'production' })

      expect(config.jwt.secret).toBe(secureEnv.JWT_SECRET)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('throws in production when defaults are used', () => {
      expect(() => validate({ ...requiredEnv, NODE_ENV: 'production', JWT_SECRET: 'test' })).toThrow(
        /JWT_SECRET, DB_PASSWORD/,
      )
    })

    it('throws for an unrecognized NODE_ENV when defaults are used', () => {
      expect(() => validate({ ...requiredEnv, NODE_ENV: 'staging' })).toThrow(/treated as production/)
    })

    it('still reports class-validator errors first', () => {
      expect(() => validate({ ...requiredEnv, ...secureEnv, LOG_LEVEL: 'bogus' })).toThrow(/level/)
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})
