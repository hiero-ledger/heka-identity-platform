import { randomBytes } from 'node:crypto'

import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export enum OidcConfigKeys {
  issuerUrl = 'OIDC_ISSUER_URL',
  cookieKeys = 'OIDC_COOKIE_KEYS',
  subHmacSalt = 'OIDC_SUB_HMAC_SALT',
  identityServiceBaseUrl = 'IDENTITY_SERVICE_BASE_URL',
  identityServiceAuthToken = 'IDENTITY_SERVICE_AUTH_TOKEN',
  ttlAccessToken = 'OIDC_TTL_ACCESS_TOKEN',
  ttlAuthorizationCode = 'OIDC_TTL_AUTHORIZATION_CODE',
  ttlIdToken = 'OIDC_TTL_ID_TOKEN',
  ttlInteraction = 'OIDC_TTL_INTERACTION',
  ttlSession = 'OIDC_TTL_SESSION',
  ttlGrant = 'OIDC_TTL_GRANT',
  clients = 'OIDC_CLIENTS',
  loginConfigs = 'OIDC_LOGIN_CONFIGS',
}

/** `sub` strategies per INTEGRATION.md §4.3 — the MVP implements `derived`. */
export enum SubStrategy {
  derived = 'derived',
  credentialClaim = 'credential-claim',
  ephemeral = 'ephemeral',
}

const oidcConfigDefaults = {
  issuerUrl: 'http://localhost:3005',
  identityServiceBaseUrl: 'http://localhost:3000',
  ttl: {
    accessToken: 3600,
    authorizationCode: 60,
    idToken: 3600,
    interaction: 600,
    session: 86400,
    grant: 86400,
  },
}

/**
 * Dev-only secret values shipped in `env/.env` and docker-compose files.
 * Production refuses them (INTEGRATION.md §5-Decide-4: refuse known-default
 * secrets), alongside a few generic weak values.
 */
const knownDefaultSecrets = new Set([
  'dev-only-cookie-key-do-not-use-in-production',
  'dev-only-sub-hmac-salt-do-not-use-in-production',
  'dev-only-broker-secret-do-not-use-in-production',
  'test',
  'secret',
  'password',
  'changeme',
])

const urlOptions = { protocols: ['http', 'https'], require_protocol: true, require_tld: false }

const generateDevSecret = () => randomBytes(32).toString('hex')

export class OidcClientConfig {
  @IsString()
  @Length(1, 255)
  public clientId!: string

  @IsString()
  @MinLength(1)
  public clientSecret!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsUrl(urlOptions, { each: true })
  public redirectUris!: string[]

  @IsArray()
  @IsString({ each: true })
  public grantTypes: string[]

  @IsArray()
  @IsString({ each: true })
  public responseTypes: string[]

  @IsIn(['client_secret_basic', 'client_secret_post'])
  public tokenEndpointAuthMethod: string

  @IsOptional()
  @IsString()
  public loginConfigId?: string

  public constructor(data?: Record<string, any>) {
    const client = data ?? {}
    this.clientId = client.clientId
    this.clientSecret = client.clientSecret
    this.redirectUris = client.redirectUris
    this.grantTypes = client.grantTypes ?? ['authorization_code']
    this.responseTypes = client.responseTypes ?? ['code']
    this.tokenEndpointAuthMethod = client.tokenEndpointAuthMethod ?? 'client_secret_basic'
    this.loginConfigId = client.loginConfigId
  }
}

/** Declarative per-client login configuration (INTEGRATION.md §4.2). */
export class OidcLoginConfig {
  @IsString()
  @Length(1, 255)
  public id!: string

  /** Reference to a heka-identity-service verification template / DCQL query. */
  @IsString()
  @Length(1, 255)
  public verificationTemplate!: string

  /** Credential-query claim path → OIDC claim name (e.g. `pid.given_name` → `given_name`). */
  @IsObject()
  public claimMapping: Record<string, string>

  @IsOptional()
  @IsObject()
  public staticClaims?: Record<string, unknown>

  @IsEnum(SubStrategy)
  public subStrategy: SubStrategy

  /** Nominated claim for the `credential-claim` strategy. */
  @IsOptional()
  @IsString()
  public subClaim?: string

  /** Trust policy: accepted credential issuers (INTEGRATION.md §4.6 — never a global trust store). */
  @IsArray()
  @IsString({ each: true })
  public issuerAllowlist: string[]

  public constructor(data?: Record<string, any>) {
    const loginConfig = data ?? {}
    this.id = loginConfig.id
    this.verificationTemplate = loginConfig.verificationTemplate
    this.claimMapping = loginConfig.claimMapping ?? {}
    this.staticClaims = loginConfig.staticClaims
    this.subStrategy = loginConfig.subStrategy ?? SubStrategy.derived
    this.subClaim = loginConfig.subClaim
    this.issuerAllowlist = loginConfig.issuerAllowlist ?? []
  }
}

/** Token/artifact lifetimes in seconds, mapped onto the provider `ttl` configuration. */
export class OidcTtlConfig {
  @IsInt()
  @Min(1)
  public accessToken: number

  @IsInt()
  @Min(1)
  public authorizationCode: number

  @IsInt()
  @Min(1)
  public idToken: number

  @IsInt()
  @Min(1)
  public interaction: number

  @IsInt()
  @Min(1)
  public session: number

  @IsInt()
  @Min(1)
  public grant: number

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    const defaults = oidcConfigDefaults.ttl
    this.accessToken = env[OidcConfigKeys.ttlAccessToken]
      ? parseInt(env[OidcConfigKeys.ttlAccessToken])
      : defaults.accessToken
    this.authorizationCode = env[OidcConfigKeys.ttlAuthorizationCode]
      ? parseInt(env[OidcConfigKeys.ttlAuthorizationCode])
      : defaults.authorizationCode
    this.idToken = env[OidcConfigKeys.ttlIdToken] ? parseInt(env[OidcConfigKeys.ttlIdToken]) : defaults.idToken
    this.interaction = env[OidcConfigKeys.ttlInteraction]
      ? parseInt(env[OidcConfigKeys.ttlInteraction])
      : defaults.interaction
    this.session = env[OidcConfigKeys.ttlSession] ? parseInt(env[OidcConfigKeys.ttlSession]) : defaults.session
    this.grant = env[OidcConfigKeys.ttlGrant] ? parseInt(env[OidcConfigKeys.ttlGrant]) : defaults.grant
  }
}

/** Connection to heka-identity-service's verification-session API (INTEGRATION.md §3). */
export class IdentityServiceConfig {
  @IsUrl(urlOptions)
  public baseUrl!: string

  @IsOptional()
  @IsString()
  public authToken?: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.baseUrl = env[OidcConfigKeys.identityServiceBaseUrl]
    this.authToken = env[OidcConfigKeys.identityServiceAuthToken]
  }
}

/**
 * OIDC provider configuration (INTEGRATION.md Phase 0).
 *
 * Secrets (cookie keys, `sub` HMAC salt, identity-service credentials, client
 * secrets) have NO compiled-in defaults (§5-Decide-4). In production the
 * constructor fails fast when they are unset, too weak, or equal to a known
 * dev-default value; outside production, unset secrets are generated fresh on
 * every start (sessions and derived `sub` values then do not survive a
 * restart — set explicit dev values, e.g. from `env/.env`, when that matters).
 */
export class OidcConfig {
  @IsUrl(urlOptions)
  public issuerUrl!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MinLength(16, { each: true })
  public cookieKeys!: string[]

  @IsString()
  @MinLength(32)
  public subHmacSalt!: string

  @ValidateNested()
  @Type(() => IdentityServiceConfig)
  public identityService: IdentityServiceConfig

  @ValidateNested()
  @Type(() => OidcTtlConfig)
  public ttl: OidcTtlConfig

  @ValidateNested({ each: true })
  @Type(() => OidcClientConfig)
  public clients: OidcClientConfig[]

  @ValidateNested({ each: true })
  @Type(() => OidcLoginConfig)
  public loginConfigs: OidcLoginConfig[]

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    const nodeEnv = (env.NODE_ENV ?? process.env.NODE_ENV)?.toString().toLowerCase()
    const isProduction = nodeEnv === 'production'
    const problems: string[] = []

    const requireInProduction = (key: OidcConfigKeys): boolean => {
      if (isProduction && !env[key]) {
        problems.push(`${key} must be set in production (no compiled-in default)`)
        return false
      }
      return true
    }

    const refuseKnownDefault = (key: OidcConfigKeys, values: (string | undefined)[]) => {
      if (isProduction && values.some((value) => value !== undefined && knownDefaultSecrets.has(value))) {
        problems.push(`${key} is set to a known default secret — generate a real one for production`)
      }
    }

    requireInProduction(OidcConfigKeys.issuerUrl)
    this.issuerUrl = env[OidcConfigKeys.issuerUrl] || oidcConfigDefaults.issuerUrl

    const generatedSecrets: string[] = []
    const secretOrDevFallback = (key: OidcConfigKeys): string => {
      if (env[key]) return env[key]
      requireInProduction(key)
      generatedSecrets.push(key)
      return generateDevSecret()
    }

    this.cookieKeys = env[OidcConfigKeys.cookieKeys]
      ? env[OidcConfigKeys.cookieKeys].split(',')
      : [secretOrDevFallback(OidcConfigKeys.cookieKeys)]
    refuseKnownDefault(OidcConfigKeys.cookieKeys, this.cookieKeys)

    this.subHmacSalt = secretOrDevFallback(OidcConfigKeys.subHmacSalt)
    refuseKnownDefault(OidcConfigKeys.subHmacSalt, [this.subHmacSalt])

    requireInProduction(OidcConfigKeys.identityServiceBaseUrl)
    this.identityService = new IdentityServiceConfig({
      ...env,
      [OidcConfigKeys.identityServiceBaseUrl]:
        env[OidcConfigKeys.identityServiceBaseUrl] || oidcConfigDefaults.identityServiceBaseUrl,
    })
    refuseKnownDefault(OidcConfigKeys.identityServiceAuthToken, [this.identityService.authToken])

    this.ttl = new OidcTtlConfig(configuration)

    this.clients = OidcConfig.parseJsonArray(env, OidcConfigKeys.clients, problems).map(
      (client) => new OidcClientConfig(client),
    )
    for (const client of this.clients) {
      refuseKnownDefault(OidcConfigKeys.clients, [client.clientSecret])
      if (isProduction && client.clientSecret && client.clientSecret.length < 16) {
        problems.push(`${OidcConfigKeys.clients}: client '${client.clientId}' secret is too short for production`)
      }
    }

    this.loginConfigs = OidcConfig.parseJsonArray(env, OidcConfigKeys.loginConfigs, problems).map(
      (loginConfig) => new OidcLoginConfig(loginConfig),
    )

    if (problems.length > 0) {
      throw new Error(`OidcConfig validation failed:\n - ${problems.join('\n - ')}`)
    }

    if (generatedSecrets.length > 0 && nodeEnv !== 'test') {
      console.warn(
        `[OidcConfig] Generated ephemeral dev secrets for: ${generatedSecrets.join(', ')}. ` +
          'Sessions and derived sub values will not survive a restart.',
      )
    }
  }

  private static parseJsonArray(env: Record<string, any>, key: OidcConfigKeys, problems: string[]): any[] {
    if (!env[key]) return []
    try {
      const parsed = JSON.parse(env[key])
      if (!Array.isArray(parsed)) {
        problems.push(`${key} must be a JSON array`)
        return []
      }
      return parsed
    } catch {
      problems.push(`${key} contains invalid JSON`)
      return []
    }
  }
}
