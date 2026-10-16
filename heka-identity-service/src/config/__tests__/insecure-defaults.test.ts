import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertSecureConfiguration,
  DEFAULT_DID_METHODS,
  findInsecureDefaults,
  INSECURE_DEFAULTS,
  parseDidMethods,
} from 'config/insecure-defaults'
import mikroOrmConfig from 'config/mikro-orm'

const secureEnv: Record<string, string> = {
  MIKRO_ORM_PASSWORD: 'app-db-password',
  WALLET_POSTGRES_PASSWORD: 'wallet-db-password',
  INDY_ENDORSER_SEED: '00000000000000000000000000custom',
  INDY_BESU_ENDORSER_PRIVATE_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
  HEDERA_OPERATOR_KEY: '302e020100300506032b657004220420custom',
  MDL_ISSUER_PRIVATE_KEY: '{"kty":"EC","crv":"P-256","d":"custom"}',
  FILE_STORAGE_MINIO_SECRET_KEY: 'minio-secret',
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
  describe('parseDidMethods', () => {
    it('falls back to the default DID methods when DID_METHODS is not set', () => {
      expect(parseDidMethods({})).toEqual(DEFAULT_DID_METHODS)
      expect(parseDidMethods({ DID_METHODS: '' })).toEqual(DEFAULT_DID_METHODS)
    })

    it('splits DID_METHODS by comma', () => {
      expect(parseDidMethods({ DID_METHODS: 'indy,key' })).toEqual(['indy', 'key'])
    })
  })

  describe('findInsecureDefaults', () => {
    it('returns nothing when every sensitive variable has a custom value', () => {
      expect(findInsecureDefaults(secureEnv)).toEqual([])
    })

    it.each(['MIKRO_ORM_PASSWORD', 'WALLET_POSTGRES_PASSWORD', 'MDL_ISSUER_PRIVATE_KEY'] as const)(
      'always flags %s when unset, empty or equal to the known default',
      (name) => {
        const withoutVar = { ...secureEnv }
        delete withoutVar[name]
        expect(findInsecureDefaults(withoutVar)).toEqual([name])
        expect(findInsecureDefaults({ ...secureEnv, [name]: '' })).toEqual([name])
        expect(findInsecureDefaults({ ...secureEnv, [name]: INSECURE_DEFAULTS[name] })).toEqual([name])
      },
    )

    it('does not check JWT_SECRET: tokens are verified against the OIDC provider, not a shared secret', () => {
      expect(findInsecureDefaults({ ...secureEnv, JWT_SECRET: 'test' })).toEqual([])
      expect(Object.keys(INSECURE_DEFAULTS)).not.toContain('JWT_SECRET')
    })

    it('flags the mDL issuer key even when a custom certificate is configured', () => {
      const env = {
        ...secureEnv,
        MDL_ISSUER_CERTIFICATE: 'custom-cert',
        MDL_ISSUER_PRIVATE_KEY: INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY,
      }
      expect(findInsecureDefaults(env)).toEqual(['MDL_ISSUER_PRIVATE_KEY'])
    })

    describe('mDL issuer key compared by its private key material', () => {
      const defaultJwk = JSON.parse(INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY) as Record<string, string>
      const defaultJwkWithoutKid = Object.fromEntries(Object.entries(defaultJwk).filter(([key]) => key !== 'kid'))
      const reordered = Object.fromEntries(Object.entries(defaultJwk).reverse())

      it.each([
        ['pretty-printed', JSON.stringify(defaultJwk, null, 2)],
        ['surrounded by whitespace', `  ${INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY}\n`],
        ['with reordered members', JSON.stringify(reordered)],
        ['with a different kid', JSON.stringify({ ...defaultJwk, kid: 'another-kid' })],
        ['without a kid', JSON.stringify(defaultJwkWithoutKid)],
      ])('flags the default key %s', (_label, value) => {
        expect(value).not.toBe(INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY)
        expect(findInsecureDefaults({ ...secureEnv, MDL_ISSUER_PRIVATE_KEY: value })).toEqual([
          'MDL_ISSUER_PRIVATE_KEY',
        ])
      })

      it('does not flag a JWK with a different private key', () => {
        const value = JSON.stringify({ ...defaultJwk, d: 'a-different-private-scalar' })
        expect(findInsecureDefaults({ ...secureEnv, MDL_ISSUER_PRIVATE_KEY: value })).toEqual([])
      })

      it.each(['not-json', '{"d":', 'null', '"x"', '[]', '42', 'true'])(
        'neither flags nor throws for invalid or non-object JSON (%j)',
        (value) => {
          expect(() => findInsecureDefaults({ ...secureEnv, MDL_ISSUER_PRIVATE_KEY: value })).not.toThrow()
          expect(findInsecureDefaults({ ...secureEnv, MDL_ISSUER_PRIVATE_KEY: value })).toEqual([])
        },
      )
    })

    it('flags every unset variable when the environment is empty (default DID methods)', () => {
      expect(findInsecureDefaults({})).toEqual([
        'MIKRO_ORM_PASSWORD',
        'WALLET_POSTGRES_PASSWORD',
        'MDL_ISSUER_PRIVATE_KEY',
        'INDY_ENDORSER_SEED',
        'HEDERA_OPERATOR_KEY',
      ])
    })

    it('checks ledger keys only for enabled DID methods', () => {
      const ledgerDefaults = {
        ...secureEnv,
        INDY_ENDORSER_SEED: INSECURE_DEFAULTS.INDY_ENDORSER_SEED,
        INDY_BESU_ENDORSER_PRIVATE_KEY: INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY,
        HEDERA_OPERATOR_KEY: INSECURE_DEFAULTS.HEDERA_OPERATOR_KEY,
      }

      expect(findInsecureDefaults(ledgerDefaults)).toEqual(['INDY_ENDORSER_SEED', 'HEDERA_OPERATOR_KEY'])
      expect(findInsecureDefaults({ ...ledgerDefaults, DID_METHODS: 'key' })).toEqual([])
      expect(findInsecureDefaults({ ...ledgerDefaults, DID_METHODS: 'indybesu' })).toEqual([
        'INDY_BESU_ENDORSER_PRIVATE_KEY',
      ])
      expect(findInsecureDefaults({ ...ledgerDefaults, DID_METHODS: 'hedera,indy' })).toEqual([
        'INDY_ENDORSER_SEED',
        'HEDERA_OPERATOR_KEY',
      ])
    })

    it('checks the MinIO secret only when MinIO is the file storage target', () => {
      const withoutMinioSecret = { ...secureEnv }
      delete withoutMinioSecret.FILE_STORAGE_MINIO_SECRET_KEY

      expect(findInsecureDefaults(withoutMinioSecret)).toEqual([])
      expect(findInsecureDefaults({ ...withoutMinioSecret, FILE_STORAGE_TARGET: 'file_system' })).toEqual([])
      expect(findInsecureDefaults({ ...withoutMinioSecret, FILE_STORAGE_TARGET: 'minio' })).toEqual([
        'FILE_STORAGE_MINIO_SECRET_KEY',
      ])
    })
  })

  describe('assertSecureConfiguration', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('does nothing when the configuration is secure', () => {
      expect(() => assertSecureConfiguration(secureEnv)).not.toThrow()
      expect(() => assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'production' })).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('throws in production and names every insecure variable', () => {
      const env = { ...secureEnv, NODE_ENV: 'production', MIKRO_ORM_PASSWORD: '', WALLET_POSTGRES_PASSWORD: 'heka1' }

      expect(() => assertSecureConfiguration(env)).toThrow(/MIKRO_ORM_PASSWORD, WALLET_POSTGRES_PASSWORD/)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it.each([undefined, '', '  ', 'development', 'test', 'Development', ' TEST '])(
      'only warns outside production (NODE_ENV=%j)',
      (nodeEnv) => {
        const env: Record<string, unknown> = {
          ...secureEnv,
          WALLET_POSTGRES_PASSWORD: 'heka1',
          HEDERA_OPERATOR_KEY: '',
        }
        if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv

        expect(() => assertSecureConfiguration(env)).not.toThrow()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/WALLET_POSTGRES_PASSWORD, HEDERA_OPERATOR_KEY/))
      },
    )

    it.each(['production', 'Production', ' PRODUCTION ', 'prod', 'prodution', 'staging', 'dev'])(
      'fails closed for any other NODE_ENV (NODE_ENV=%j)',
      (nodeEnv) => {
        const env = { ...secureEnv, NODE_ENV: nodeEnv, MIKRO_ORM_PASSWORD: '', WALLET_POSTGRES_PASSWORD: 'heka1' }

        expect(() => assertSecureConfiguration(env)).toThrow(/MIKRO_ORM_PASSWORD, WALLET_POSTGRES_PASSWORD/)
        expect(warnSpy).not.toHaveBeenCalled()
      },
    )

    it('explains when an unrecognized NODE_ENV is treated as production', () => {
      expect(() => assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'staging', MIKRO_ORM_PASSWORD: '' })).toThrow(
        /NODE_ENV is set to a value other than development or test, so it is treated as production/,
      )
      expect(
        thrownMessage(() =>
          assertSecureConfiguration({ ...secureEnv, NODE_ENV: ' Production ', MIKRO_ORM_PASSWORD: '' }),
        ),
      ).not.toContain('treated as production')
    })

    it('does nothing for a secure configuration under an unrecognized NODE_ENV', () => {
      expect(() => assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'staging' })).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('refuses to start in production with a reformatted default mDL key without echoing it', () => {
      const value = JSON.stringify(JSON.parse(INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY), null, 2)
      const { d } = JSON.parse(INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY) as { d: string }

      const message = thrownMessage(() =>
        assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'production', MDL_ISSUER_PRIVATE_KEY: value }),
      )
      expect(message).toMatch(/Insecure configuration: MDL_ISSUER_PRIVATE_KEY is unset/)
      expect(message).not.toContain(d)
      expect(message).not.toContain(value)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not throw in production for a malformed mDL key', () => {
      expect(() =>
        assertSecureConfiguration({ ...secureEnv, NODE_ENV: 'production', MDL_ISSUER_PRIVATE_KEY: 'not-json' }),
      ).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('never includes secret or NODE_ENV values in the error or warning', () => {
      // Every checked variable is left at its publicly known default (MinIO enabled, all ledgers enabled).
      const env: Record<string, unknown> = {
        ...INSECURE_DEFAULTS,
        DID_METHODS: 'indy,indybesu,hedera',
        FILE_STORAGE_TARGET: 'minio',
        NODE_ENV: 'staging-xyz',
      }
      const secretValues = Object.values(INSECURE_DEFAULTS)

      const message = thrownMessage(() => assertSecureConfiguration(env))
      expect(message).toMatch(/MIKRO_ORM_PASSWORD, WALLET_POSTGRES_PASSWORD/)
      expect(message).not.toContain('staging-xyz')
      // No `NAME=value` pair is echoed.
      expect(message).not.toMatch(/[A-Z_]+\s*[=:]/)
      for (const value of secretValues) expect(message).not.toContain(value)

      assertSecureConfiguration({ ...env, NODE_ENV: 'development' })
      const warning = String(warnSpy.mock.calls[0][0])
      expect(warning).toMatch(/MIKRO_ORM_PASSWORD, WALLET_POSTGRES_PASSWORD/)
      expect(warning).toContain('unset, empty, development or test')
      expect(warning).not.toMatch(/[A-Z_]+\s*[=:]/)
      for (const value of secretValues) expect(warning).not.toContain(value)
    })
  })

  describe('config factories keep the development defaults', () => {
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(() => {
      originalEnv = { ...process.env }
      delete process.env.MIKRO_ORM_PASSWORD
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('uses the known defaults when the variables are not set', () => {
      expect(mikroOrmConfig().password).toBe(INSECURE_DEFAULTS.MIKRO_ORM_PASSWORD)
    })

    it('prefers explicitly configured values', () => {
      process.env.MIKRO_ORM_PASSWORD = 'custom-password'
      expect(mikroOrmConfig().password).toBe('custom-password')
    })
  })
})
