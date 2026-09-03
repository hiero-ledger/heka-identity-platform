import { createHash, generateKeyPairSync } from 'node:crypto'

import { ConfigService } from '@config'
import { ADVISORY_LOCK_CLASS, AdvisoryLockId, OidcSigningKey } from '@core/database'
import { QueryResult } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'

export const SIGNING_ALGS = ['RS256', 'ES256'] as const
export type SigningAlg = (typeof SIGNING_ALGS)[number]

@Injectable()
export class SigningKeysService {
  private readonly logger = new Logger(SigningKeysService.name)
  private readonly em: EntityManager

  public constructor(
    em: EntityManager,
    private readonly configService: ConfigService
  ) {
    this.em = em.fork()
  }

  public async getJwks(): Promise<{ keys: Record<string, any>[] }> {
    const override = this.configService.oidcConfig.jwks
    if (override) {
      this.logger.warn('Using signing JWKS from configuration override — database-managed keys are bypassed')
      return override
    }

    return this.withSigningKeysLock(async (em) => {
      await this.ensureKeys(em)
      const keys = await em.find(OidcSigningKey, { retiredAt: null }, { orderBy: { createdAt: 'DESC' } })
      return { keys: keys.map((key) => key.jwk) }
    })
  }

  public async rotateKey(alg: SigningAlg): Promise<string> {
    const key = await this.withSigningKeysLock((em) => this.generateAndPersistKey(em, alg))
    this.logger.log(`Rotated ${alg} signing key — new kid '${key.kid}'; retire the previous key after IdP caches expire`)
    return key.kid
  }

  public async retireKey(kid: string): Promise<void> {
    await this.withSigningKeysLock(async (em) => {
      const result = await em.execute<QueryResult>(
        `update oidc_signing_key k set retired_at = now()
         where k.kid = ? and k.retired_at is null
           and exists (select 1 from oidc_signing_key o
                       where o.alg = k.alg and o.retired_at is null and o.kid <> k.kid)`,
        [kid],
        'run'
      )
      if (result.affectedRows > 0) {
        this.logger.log(`Retired signing key '${kid}'`)
        return
      }

      const stillActive = await em.count(OidcSigningKey, { kid, retiredAt: null })
      if (stillActive > 0) {
        throw new Error(`Cannot retire signing key '${kid}' — it is the last active key for its algorithm; rotate first`)
      }
      this.logger.log(`Signing key '${kid}' is unknown or already retired — nothing to retire`)
    })
  }

  private async withSigningKeysLock<T>(fn: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.em.transactional(async (em) => {
      await em.execute('select pg_advisory_xact_lock(?, ?)', [ADVISORY_LOCK_CLASS, AdvisoryLockId.oidcSigningKeys])
      return fn(em)
    })
  }

  private async ensureKeys(em: EntityManager): Promise<void> {
    for (const alg of SIGNING_ALGS) {
      const active = await em.count(OidcSigningKey, { alg, retiredAt: null })
      if (active === 0) {
        const key = await this.generateAndPersistKey(em, alg)
        this.logger.log(`Generated ${alg} signing key on first start — kid '${key.kid}'`)
      }
    }
  }

  private async generateAndPersistKey(em: EntityManager, alg: SigningAlg): Promise<OidcSigningKey> {
    const { privateKey } =
      alg === 'RS256' ? generateKeyPairSync('rsa', { modulusLength: 2048 }) : generateKeyPairSync('ec', { namedCurve: 'P-256' })

    const jwk = privateKey.export({ format: 'jwk' }) as Record<string, any>
    const kid = SigningKeysService.thumbprint(jwk)

    const entity = new OidcSigningKey({ kid, alg, jwk: { ...jwk, kid, alg, use: 'sig' } })
    em.persist(entity)
    await em.flush()
    return entity
  }

  private static thumbprint(jwk: Record<string, any>): string {
    const members = jwk.kty === 'RSA' ? { e: jwk.e, kty: jwk.kty, n: jwk.n } : { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
    return createHash('sha256').update(JSON.stringify(members)).digest('base64url')
  }
}
