import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { createLocalJWKSet, createRemoteJWKSet, errors, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose'

import { InjectLogger, Logger } from 'common/logger'
import OidcConfig from 'config/oidc'

import { mapClaims } from './claims'
import { TokenPayload } from './token-payload.interface'

const DISCOVERY_PATH = '/.well-known/openid-configuration'

interface DiscoveryDocument {
  issuer?: string
  jwks_uri?: string
}

/**
 * Verifies bearer tokens issued by the configured OIDC provider (signature via JWKS, `iss`, `aud`, `exp`)
 * and maps the verified payload onto the identity service's claim contract.
 */
@Injectable()
export class TokenVerifier implements OnModuleInit {
  private readonly issuer: string
  private readonly audience: string
  private keySet?: JWTVerifyGetKey
  private keySetPromise?: Promise<JWTVerifyGetKey>

  public constructor(
    @Inject(OidcConfig.KEY)
    private readonly config: ConfigType<typeof OidcConfig>,
    @InjectLogger(TokenVerifier)
    private readonly logger: Logger,
  ) {
    if (!config.issuerUrl) {
      throw new Error('OIDC_ISSUER_URL is not set: bearer tokens are verified against an OIDC provider')
    }
    if (!config.audience) {
      throw new Error('OIDC_AUDIENCE is not set: bearer tokens must carry the audience of this service')
    }
    const hmac = config.algorithms.filter((algorithm) => algorithm.toUpperCase().startsWith('HS'))
    if (hmac.length > 0) {
      throw new Error(`OIDC_ALGORITHMS contains ${hmac.join(', ')}: HMAC algorithms are not supported`)
    }

    this.issuer = config.issuerUrl
    this.audience = config.audience

    if (config.jwks) {
      this.keySet = createLocalJWKSet(config.jwks)
    } else if (config.jwksUri) {
      this.keySet = createRemoteJWKSet(new URL(config.jwksUri))
    }
  }

  public onModuleInit(): void {
    this.logger.child('onModuleInit').info(
      {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.config.algorithms,
        keys: this.config.jwks ? 'inline JWKS' : (this.config.jwksUri ?? 'discovery'),
        claims: this.config.claims,
      },
      'Bearer token verification configured',
    )
  }

  /** Verifies the token and returns its claims mapped onto the identity service's contract. */
  public async verify(token: string): Promise<TokenPayload> {
    const payload = await this.verifyJwt(token)
    return mapClaims(payload, this.config.claims)
  }

  /** Verifies signature, issuer, audience and time claims and returns the raw payload. */
  public async verifyJwt(token: string): Promise<JWTPayload> {
    const logger = this.logger.child('verifyJwt')
    const getKey = await this.getKeySet()

    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.config.algorithms,
        clockTolerance: this.config.clockTolerance,
      })
      return payload
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        logger.warn({ code: error.code, message: error.message }, 'Token verification failed')
        throw new UnauthorizedException(`Invalid token: ${error.code}`)
      }
      throw error
    }
  }

  private async getKeySet(): Promise<JWTVerifyGetKey> {
    if (this.keySet) {
      return this.keySet
    }

    this.keySetPromise ??= this.discoverKeySet()
      .then((keySet) => {
        this.keySet = keySet
        return keySet
      })
      .finally(() => {
        this.keySetPromise = undefined
      })

    return this.keySetPromise
  }

  private async discoverKeySet(): Promise<JWTVerifyGetKey> {
    const logger = this.logger.child('discoverKeySet')
    const url = `${this.issuer.replace(/\/+$/, '')}${DISCOVERY_PATH}`
    logger.debug(`Fetching OIDC discovery document from ${url}`)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`OIDC discovery at ${url} failed: HTTP ${response.status}`)
    }

    const document = (await response.json()) as DiscoveryDocument
    if (!document.jwks_uri) {
      throw new Error(`OIDC discovery at ${url} returned no jwks_uri`)
    }
    if (document.issuer && document.issuer !== this.issuer) {
      logger.warn(
        { configured: this.issuer, discovered: document.issuer },
        'Discovered issuer differs from OIDC_ISSUER_URL; tokens will be rejected unless they match the configured value',
      )
    }

    logger.info(`Using JWKS from ${document.jwks_uri}`)
    return createRemoteJWKSet(new URL(document.jwks_uri))
  }
}
