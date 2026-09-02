import { createHash, generateKeyPairSync } from 'node:crypto'

import { ConfigService } from '@config'
import { OidcSigningKey } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import { Injectable, Logger } from '@nestjs/common'

export const SIGNING_ALGS = ['RS256', 'ES256'] as const
export type SigningAlg = (typeof SIGNING_ALGS)[number]

/**
 * Signing JWKS for the OP: RS256 + ES256 keys are
 * generated on first start and persisted in Postgres (`oidc_signing_key`),
 * per the feasibility component architecture. An `OIDC_JWKS` /
 * `OIDC_JWKS_FILE` override bypasses the database (dev; production refuses
 * known-default keys at config validation).
 *
 * Rotation (overlap model, see README "Key rotation"): `rotateKey` publishes a
 * fresh key that immediately becomes the signing key while the previous one
 * stays in the JWKS for verification; `retireKey` unpublishes it once IdP
 * JWKS caches have expired. The provider signs with the newest key per
 * algorithm because `getJwks` returns keys newest-first.
 */
@Injectable()
export class SigningKeysService {
  private readonly logger = new Logger(SigningKeysService.name)
  private readonly em: EntityManager

  public constructor(
    em: EntityManager,
    private readonly configService: ConfigService,
  ) {
    this.em = em.fork()
  }

  /**
   * The full private JWKS for the provider configuration. Generates and
   * persists missing keys on first use — the Phase 1 provider factory calls
   * this at startup.
   */
  public async getJwks(): Promise<{ keys: Record<string, any>[] }> {
    const override = this.configService.oidcConfig.jwks
    if (override) {
      this.logger.warn('Using signing JWKS from configuration override — database-managed keys are bypassed')
      return override
    }

    await this.ensureKeys()

    const keys = await this.em.find(OidcSigningKey, { retiredAt: null }, { orderBy: { createdAt: 'DESC' } })
    return { keys: keys.map((key) => key.jwk) }
  }

  /** Rotation step 1: publish a fresh key for `alg` — it becomes the signing key immediately. */
  public async rotateKey(alg: SigningAlg): Promise<string> {
    const key = await this.generateAndPersistKey(alg)
    this.logger.log(
      `Rotated ${alg} signing key — new kid '${key.kid}'; retire the previous key after IdP caches expire`,
    )
    return key.kid
  }

  /** Rotation step 2: stop publishing a key once IdP JWKS caches have expired. */
  public async retireKey(kid: string): Promise<void> {
    await this.em.nativeUpdate(OidcSigningKey, { kid, retiredAt: null }, { retiredAt: new Date() })
    this.logger.log(`Retired signing key '${kid}'`)
  }

  private async ensureKeys(): Promise<void> {
    for (const alg of SIGNING_ALGS) {
      const active = await this.em.count(OidcSigningKey, { alg, retiredAt: null })
      if (active === 0) {
        const key = await this.generateAndPersistKey(alg)
        this.logger.log(`Generated ${alg} signing key on first start — kid '${key.kid}'`)
      }
    }
  }

  private async generateAndPersistKey(alg: SigningAlg): Promise<OidcSigningKey> {
    const { privateKey } =
      alg === 'RS256'
        ? generateKeyPairSync('rsa', { modulusLength: 2048 })
        : generateKeyPairSync('ec', { namedCurve: 'P-256' })

    const jwk = privateKey.export({ format: 'jwk' }) as Record<string, any>
    const kid = SigningKeysService.thumbprint(jwk)

    const entity = new OidcSigningKey({ kid, alg, jwk: { ...jwk, kid, alg, use: 'sig' } })
    this.em.persist(entity)
    await this.em.flush()
    return entity
  }

  /** RFC 7638 JWK thumbprint (SHA-256 over the canonical required members). */
  private static thumbprint(jwk: Record<string, any>): string {
    const members =
      jwk.kty === 'RSA' ? { e: jwk.e, kty: jwk.kty, n: jwk.n } : { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
    return createHash('sha256').update(JSON.stringify(members)).digest('base64url')
  }
}
