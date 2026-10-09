import { Module } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import OrganizationAdminConfig from 'config/organization-admin'

import { Auth0Directory } from './directory/auth0.directory'
import { ORGANIZATION_DIRECTORY, OrganizationDirectory } from './directory/directory.types'
import { KeycloakDirectory } from './directory/keycloak.directory'
import { OrganizationAdminController } from './organization-admin.controller'
import { OrganizationAdminService } from './organization-admin.service'

/** The provider directory for `ORG_ADMIN_PROVIDER`, or `undefined` while organization administration is disabled. */
export function createOrganizationDirectory(
  config: ConfigType<typeof OrganizationAdminConfig>,
): OrganizationDirectory | undefined {
  if (!config.enabled || !config.url || !config.clientId || !config.clientSecret) return undefined
  switch (config.provider) {
    case 'keycloak':
      return new KeycloakDirectory({
        url: config.url,
        realm: config.realm,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        rolesClientId: config.rolesClientId,
        defaultGroup: config.defaultGroup,
        orgIdField: config.orgIdField,
      })
    case 'auth0':
      return new Auth0Directory({
        url: config.url,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        orgIdField: config.orgIdField,
      })
    default:
      return undefined
  }
}

/**
 * Optional delegated organization administration (`/organization/members`), enabled by `ORG_ADMIN_PROVIDER`,
 * `ORG_ADMIN_URL`, `ORG_ADMIN_CLIENT_ID` and `ORG_ADMIN_CLIENT_SECRET`.
 */
@Module({
  controllers: [OrganizationAdminController],
  providers: [
    OrganizationAdminService,
    {
      provide: ORGANIZATION_DIRECTORY,
      inject: [OrganizationAdminConfig.KEY],
      useFactory: createOrganizationDirectory,
    },
  ],
})
export class OrganizationAdminModule {}
