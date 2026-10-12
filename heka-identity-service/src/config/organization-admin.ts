import { registerAs } from '@nestjs/config'

export const organizationAdminProviders = ['keycloak', 'auth0'] as const
export type OrganizationAdminProvider = (typeof organizationAdminProviders)[number]

/**
 * Delegated organization administration: `GET /organization/members` and `PUT /organization/members/:id/role`
 * let an `OrgAdmin` manage the roles of their own organization's members. Roles stay in the OIDC provider; this
 * service changes them through the provider's admin API with a dedicated service account. Disabled unless the
 * provider, URL, client id and client secret are all set.
 */
export interface OrganizationAdminConfig {
  /** True when `provider`, `url`, `clientId` and `clientSecret` are all set. */
  enabled: boolean
  provider?: OrganizationAdminProvider
  /** Keycloak base URL (`http://localhost:8080`) or Auth0 tenant URL (`https://<tenant>.<region>.auth0.com`). */
  url?: string
  /** Confidential client of the admin service account. */
  clientId?: string
  clientSecret?: string
  /** Keycloak only: realm of the platform users. */
  realm: string
  /** Keycloak only: client that owns the Heka client roles. */
  rolesClientId: string
  /** Keycloak only: default group that grants `User`; a member who gets an organization role leaves it. */
  defaultGroup: string
  /** Attribute (Keycloak) or metadata field (Auth0) of the provider's organization that holds the Heka org id. */
  orgIdField: string
}

export const organizationAdminDefaults = {
  realm: 'heka-platform',
  rolesClientId: 'heka-identity-service',
  defaultGroup: '/heka-users',
  orgIdField: 'heka_org_id',
}

const MIN_PRODUCTION_SECRET_LENGTH = 16

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export default registerAs('organizationAdmin', (): OrganizationAdminConfig => {
  const problems: string[] = []

  const provider = text(process.env.ORG_ADMIN_PROVIDER)?.toLowerCase()
  const url = text(process.env.ORG_ADMIN_URL)?.replace(/\/+$/, '')
  const clientId = text(process.env.ORG_ADMIN_CLIENT_ID)
  const clientSecret = text(process.env.ORG_ADMIN_CLIENT_SECRET)

  const settings = {
    ORG_ADMIN_PROVIDER: provider,
    ORG_ADMIN_URL: url,
    ORG_ADMIN_CLIENT_ID: clientId,
    ORG_ADMIN_CLIENT_SECRET: clientSecret,
  }
  const missing = Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length > 0 && missing.length < Object.keys(settings).length) {
    problems.push(`${Object.keys(settings).join(', ')} must be set together (missing: ${missing.join(', ')})`)
  }
  const enabled = missing.length === 0

  if (provider && !organizationAdminProviders.includes(provider as OrganizationAdminProvider)) {
    problems.push(`ORG_ADMIN_PROVIDER must be one of ${organizationAdminProviders.join(', ')}`)
  }
  if (url && !/^https?:\/\//.test(url)) {
    problems.push('ORG_ADMIN_URL must be an http(s) URL')
  }
  if (process.env.NODE_ENV?.toLowerCase() === 'production' && clientSecret) {
    if (clientSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      problems.push(`ORG_ADMIN_CLIENT_SECRET is too short for production (${MIN_PRODUCTION_SECRET_LENGTH}+ characters)`)
    }
    if (clientSecret.startsWith('dev-only-')) {
      problems.push('ORG_ADMIN_CLIENT_SECRET is a dev secret from the shipped recipes; generate a real one')
    }
  }

  if (problems.length > 0) {
    throw new Error(`Organization administration configuration is invalid:\n - ${problems.join('\n - ')}`)
  }

  return {
    enabled,
    provider: provider as OrganizationAdminProvider | undefined,
    url,
    clientId,
    clientSecret,
    realm: text(process.env.ORG_ADMIN_REALM) ?? organizationAdminDefaults.realm,
    rolesClientId: text(process.env.ORG_ADMIN_ROLES_CLIENT_ID) ?? organizationAdminDefaults.rolesClientId,
    defaultGroup: text(process.env.ORG_ADMIN_DEFAULT_GROUP) ?? organizationAdminDefaults.defaultGroup,
    orgIdField: text(process.env.ORG_ADMIN_ORG_ID_FIELD) ?? organizationAdminDefaults.orgIdField,
  }
})
