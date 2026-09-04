import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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
  identityServiceAuthName = 'IDENTITY_SERVICE_AUTH_NAME',
  identityServiceAuthPassword = 'IDENTITY_SERVICE_AUTH_PASSWORD',
  authServiceBaseUrl = 'AUTH_SERVICE_BASE_URL',
  identityServicePublicVerifierId = 'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID',
  identityServiceRequestSignerDid = 'IDENTITY_SERVICE_REQUEST_SIGNER_DID',
  ttlAccessToken = 'OIDC_TTL_ACCESS_TOKEN',
  ttlAuthorizationCode = 'OIDC_TTL_AUTHORIZATION_CODE',
  ttlIdToken = 'OIDC_TTL_ID_TOKEN',
  ttlInteraction = 'OIDC_TTL_INTERACTION',
  ttlSession = 'OIDC_TTL_SESSION',
  ttlGrant = 'OIDC_TTL_GRANT',
  clockTolerance = 'OIDC_CLOCK_TOLERANCE',
  clients = 'OIDC_CLIENTS',
  loginConfigs = 'OIDC_LOGIN_CONFIGS',
  jwks = 'OIDC_JWKS',
  jwksFile = 'OIDC_JWKS_FILE',
  stubLogin = 'OIDC_STUB_LOGIN',
  allowPrivateNetworkCalls = 'OIDC_ALLOW_PRIVATE_NETWORK_CALLS',
  logoutAutoConfirm = 'OIDC_LOGOUT_AUTO_CONFIRM',
}

export enum SubStrategy {
  derived = 'derived',
  credentialClaim = 'credential-claim',
  ephemeral = 'ephemeral',
}

const oidcConfigDefaults = {
  issuerUrl: 'http://localhost:3005',
  identityServiceBaseUrl: 'http://localhost:3000',
  authServiceBaseUrl: 'http://localhost:3004',
  ttl: {
    accessToken: 3600,
    authorizationCode: 60,
    idToken: 3600,
    interaction: 600,
    session: 86400,
    grant: 86400,
  },
  clockTolerance: 15,
}

/**
 * Dev-only secret values shipped in `env/.env` and docker-compose files.
 * Production refuses them, alongside a few generic weak values.
 */
const knownDefaultSecrets = new Set([
  'dev-only-cookie-key-do-not-use-in-production',
  'dev-only-sub-hmac-salt-do-not-use-in-production',
  'dev-only-broker-secret-do-not-use-in-production',
  'Password1234!', // the platform's demo-user password (prepare-demo-user.ts)
  'test',
  'secret',
  'password',
  'changeme',
])

/**
 * `kid` values of well-known development JWKS — most importantly
 * node-oidc-provider's built-in dev keystore (`keystore-CHANGE-ME`).
 * A production JWKS override must not contain any of these.
 */
const knownDefaultKeyIds = new Set(['keystore-CHANGE-ME', 'test', 'dev', 'example', 'changeme'])

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

  @IsOptional()
  @IsArray()
  @IsUrl(urlOptions, { each: true })
  public postLogoutRedirectUris?: string[]

  @IsOptional()
  @IsUrl(urlOptions)
  public backchannelLogoutUri?: string

  @IsOptional()
  @IsBoolean()
  public backchannelLogoutSessionRequired?: boolean

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
    this.postLogoutRedirectUris = client.postLogoutRedirectUris
    this.backchannelLogoutUri = client.backchannelLogoutUri
    this.backchannelLogoutSessionRequired = client.backchannelLogoutSessionRequired ?? (client.backchannelLogoutUri ? true : undefined)
    this.grantTypes = client.grantTypes ?? ['authorization_code']
    this.responseTypes = client.responseTypes ?? ['code']
    this.tokenEndpointAuthMethod = client.tokenEndpointAuthMethod ?? 'client_secret_basic'
    this.loginConfigId = client.loginConfigId
  }
}

const DCQL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export class OidcLoginConfigBranding {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public productName?: string

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  public logoUrl?: string

  @IsOptional()
  @IsObject()
  public colors?: Record<string, string>

  @IsOptional()
  @IsString()
  public customCss?: string

  public constructor(data?: Record<string, any>) {
    const branding = data ?? {}
    this.productName = branding.productName
    this.logoUrl = branding.logoUrl
    this.colors = branding.colors
    this.customCss = branding.customCss
  }
}

/** Declarative per-client login configuration. */
export class OidcLoginConfig {
  @IsString()
  @Length(1, 255)
  public id!: string

  @IsString()
  @Length(1, 255)
  public verificationTemplate!: string

  @IsOptional()
  @IsObject()
  public dcqlQuery?: Record<string, unknown>

  @IsObject()
  public claimMapping: Record<string, string>

  @IsOptional()
  @IsObject()
  public staticClaims?: Record<string, unknown>

  @IsEnum(SubStrategy)
  public subStrategy: SubStrategy

  @IsOptional()
  @IsString()
  public subClaim?: string

  @IsArray()
  @IsString({ each: true })
  public issuerAllowlist: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => OidcLoginConfigBranding)
  public branding?: OidcLoginConfigBranding

  public constructor(data?: Record<string, any>) {
    const loginConfig = data ?? {}
    this.id = loginConfig.id
    this.verificationTemplate = loginConfig.verificationTemplate
    this.dcqlQuery = loginConfig.dcqlQuery
    this.claimMapping = loginConfig.claimMapping ?? {}
    this.staticClaims = loginConfig.staticClaims
    this.subStrategy = loginConfig.subStrategy ?? SubStrategy.derived
    this.subClaim = loginConfig.subClaim
    this.issuerAllowlist = loginConfig.issuerAllowlist ?? []
    this.branding = loginConfig.branding ? new OidcLoginConfigBranding(loginConfig.branding) : undefined
  }

  public get credentialQueryIds(): string[] {
    const credentials = (this.dcqlQuery as { credentials?: unknown } | undefined)?.credentials
    if (!Array.isArray(credentials)) return []
    return credentials.map((credential) => (credential as { id?: unknown } | null)?.id).filter((id): id is string => typeof id === 'string')
  }

  public dcqlProblems(): string[] {
    if (this.dcqlQuery === undefined) return []
    const problems: string[] = []
    const credentials = (this.dcqlQuery as { credentials?: unknown }).credentials
    if (!Array.isArray(credentials) || credentials.length === 0) {
      problems.push('dcqlQuery.credentials must be a non-empty array of credential queries')
    } else {
      credentials.forEach((credential, index) => {
        const id = (credential as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || !DCQL_ID_PATTERN.test(id)) {
          problems.push(`dcqlQuery.credentials[${index}].id must be a non-empty string of [a-zA-Z0-9_-]`)
        }
      })
    }
    const ids = this.credentialQueryIds
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (duplicates.length > 0) {
      problems.push(`dcqlQuery.credentials ids must be unique (duplicate: ${[...new Set(duplicates)].join(', ')})`)
    }
    if (ids.length > 0) {
      for (const key of Object.keys(this.claimMapping)) {
        const separator = key.indexOf('.')
        const prefix = separator > 0 ? key.slice(0, separator) : ''
        const claim = separator > 0 ? key.slice(separator + 1) : ''
        if (!ids.includes(prefix) || claim.length === 0) {
          problems.push(`claimMapping key '${key}' must be '<credential query id>.<claim>' with an id from dcqlQuery (${ids.join(', ')})`)
        }
      }
    }
    return problems
  }
}

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
    this.accessToken = env[OidcConfigKeys.ttlAccessToken] ? parseInt(env[OidcConfigKeys.ttlAccessToken]) : defaults.accessToken
    this.authorizationCode = env[OidcConfigKeys.ttlAuthorizationCode]
      ? parseInt(env[OidcConfigKeys.ttlAuthorizationCode])
      : defaults.authorizationCode
    this.idToken = env[OidcConfigKeys.ttlIdToken] ? parseInt(env[OidcConfigKeys.ttlIdToken]) : defaults.idToken
    this.interaction = env[OidcConfigKeys.ttlInteraction] ? parseInt(env[OidcConfigKeys.ttlInteraction]) : defaults.interaction
    this.session = env[OidcConfigKeys.ttlSession] ? parseInt(env[OidcConfigKeys.ttlSession]) : defaults.session
    this.grant = env[OidcConfigKeys.ttlGrant] ? parseInt(env[OidcConfigKeys.ttlGrant]) : defaults.grant
  }
}

export class IdentityServiceConfig {
  @IsUrl(urlOptions)
  public baseUrl!: string

  @IsOptional()
  @IsString()
  public authToken?: string

  @IsOptional()
  @IsString()
  public authName?: string

  @IsOptional()
  @IsString()
  public authPassword?: string

  @IsUrl(urlOptions)
  public authServiceBaseUrl!: string

  @IsOptional()
  @IsString()
  public publicVerifierId?: string

  @IsOptional()
  @IsString()
  public requestSignerDid?: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.baseUrl = env[OidcConfigKeys.identityServiceBaseUrl]
    this.authToken = env[OidcConfigKeys.identityServiceAuthToken]
    this.authName = env[OidcConfigKeys.identityServiceAuthName]
    this.authPassword = env[OidcConfigKeys.identityServiceAuthPassword]
    this.authServiceBaseUrl = env[OidcConfigKeys.authServiceBaseUrl]
    this.publicVerifierId = env[OidcConfigKeys.identityServicePublicVerifierId]
    this.requestSignerDid = env[OidcConfigKeys.identityServiceRequestSignerDid]
  }
}

/**
 * OIDC provider configuration.
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

  @IsInt()
  @Min(0)
  public clockTolerance: number

  @ValidateNested({ each: true })
  @Type(() => OidcClientConfig)
  public clients: OidcClientConfig[]

  @ValidateNested({ each: true })
  @Type(() => OidcLoginConfig)
  public loginConfigs: OidcLoginConfig[]

  @IsOptional()
  @IsObject()
  public jwks?: { keys: Record<string, any>[] }

  @IsBoolean()
  public stubLogin: boolean

  @IsBoolean()
  public allowPrivateNetworkCalls: boolean

  @IsBoolean()
  public logoutAutoConfirm: boolean

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
    this.cookieKeys = this.cookieKeys.map((key) => key.trim()).filter((key) => key.length > 0)
    refuseKnownDefault(OidcConfigKeys.cookieKeys, this.cookieKeys)

    this.subHmacSalt = secretOrDevFallback(OidcConfigKeys.subHmacSalt)
    refuseKnownDefault(OidcConfigKeys.subHmacSalt, [this.subHmacSalt])

    requireInProduction(OidcConfigKeys.identityServiceBaseUrl)
    this.identityService = new IdentityServiceConfig({
      ...env,
      [OidcConfigKeys.identityServiceBaseUrl]: env[OidcConfigKeys.identityServiceBaseUrl] || oidcConfigDefaults.identityServiceBaseUrl,
      [OidcConfigKeys.authServiceBaseUrl]: env[OidcConfigKeys.authServiceBaseUrl] || oidcConfigDefaults.authServiceBaseUrl,
    })
    refuseKnownDefault(OidcConfigKeys.identityServiceAuthToken, [this.identityService.authToken])
    refuseKnownDefault(OidcConfigKeys.identityServiceAuthPassword, [this.identityService.authPassword])
    if (isProduction && this.identityService.authName && !env[OidcConfigKeys.authServiceBaseUrl]) {
      problems.push(
        `${OidcConfigKeys.authServiceBaseUrl} must be set in production when the ` +
          `${OidcConfigKeys.identityServiceAuthName} service account is used (no compiled-in default)`
      )
    }

    this.ttl = new OidcTtlConfig(configuration)

    this.clockTolerance = env[OidcConfigKeys.clockTolerance]
      ? parseInt(env[OidcConfigKeys.clockTolerance])
      : oidcConfigDefaults.clockTolerance

    this.clients = OidcConfig.parseJsonArray(env, OidcConfigKeys.clients, problems).map((client) => new OidcClientConfig(client))
    for (const client of this.clients) {
      refuseKnownDefault(OidcConfigKeys.clients, [client.clientSecret])
      if (isProduction && client.clientSecret && client.clientSecret.length < 16) {
        problems.push(`${OidcConfigKeys.clients}: client '${client.clientId}' secret is too short for production`)
      }
    }

    this.loginConfigs = OidcConfig.parseJsonArray(env, OidcConfigKeys.loginConfigs, problems).map(
      (loginConfig) => new OidcLoginConfig(loginConfig)
    )
    for (const loginConfig of this.loginConfigs) {
      for (const problem of loginConfig.dcqlProblems()) {
        problems.push(`${OidcConfigKeys.loginConfigs}: login configuration '${loginConfig.id}': ${problem}`)
      }
    }

    this.jwks = OidcConfig.resolveJwksOverride(env, problems, isProduction)

    this.stubLogin = env[OidcConfigKeys.stubLogin]?.toString().toLowerCase() === 'true'
    if (isProduction && this.stubLogin) {
      problems.push(`${OidcConfigKeys.stubLogin} must not be enabled in production — the stub bypasses credential verification`)
    }

    this.logoutAutoConfirm = env[OidcConfigKeys.logoutAutoConfirm]?.toString().toLowerCase() === 'true'

    this.allowPrivateNetworkCalls = env[OidcConfigKeys.allowPrivateNetworkCalls]?.toString().toLowerCase() === 'true'
    if (isProduction && this.allowPrivateNetworkCalls) {
      problems.push(
        `${OidcConfigKeys.allowPrivateNetworkCalls} must not be enabled in production — ` +
          "it disables the SSRF protection on the provider's outbound calls"
      )
    }

    if (problems.length > 0) {
      throw new Error(`OidcConfig validation failed:\n - ${problems.join('\n - ')}`)
    }

    if (generatedSecrets.length > 0 && nodeEnv !== 'test') {
      console.warn(
        `[OidcConfig] Generated ephemeral dev secrets for: ${generatedSecrets.join(', ')}. ` +
          'Sessions and derived sub values will not survive a restart.'
      )
    }
  }

  private static resolveJwksOverride(
    env: Record<string, any>,
    problems: string[],
    isProduction: boolean
  ): { keys: Record<string, any>[] } | undefined {
    let raw: string | undefined = env[OidcConfigKeys.jwks]
    const source = raw ? OidcConfigKeys.jwks : OidcConfigKeys.jwksFile
    if (!raw && env[OidcConfigKeys.jwksFile]) {
      try {
        raw = readFileSync(env[OidcConfigKeys.jwksFile], 'utf8')
      } catch {
        problems.push(`${OidcConfigKeys.jwksFile} could not be read: ${env[OidcConfigKeys.jwksFile]}`)
        return undefined
      }
    }
    if (!raw) return undefined

    let jwks: any
    try {
      jwks = JSON.parse(raw)
    } catch {
      problems.push(`${source} contains invalid JSON`)
      return undefined
    }
    if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      problems.push(`${source} must be a JWKS object with a non-empty "keys" array`)
      return undefined
    }

    if (isProduction) {
      for (const key of jwks.keys) {
        const label = `${source}: key '${key.kid ?? '<no kid>'}'`
        if (key.kid && knownDefaultKeyIds.has(key.kid)) {
          problems.push(`${label} is a known default key — generate real signing keys for production`)
        }
        if (!key.d) {
          problems.push(`${label} has no private material — the signing JWKS must contain private keys`)
        }
        if (key.kty === 'RSA' && (!key.n || Buffer.from(key.n, 'base64url').length < 256)) {
          problems.push(`${label} RSA modulus is below 2048 bits — too weak for production`)
        }
        if (key.kty === 'EC' && !['P-256', 'P-384', 'P-521'].includes(key.crv)) {
          problems.push(`${label} uses an unsupported EC curve for production`)
        }
      }
    }

    return jwks
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
