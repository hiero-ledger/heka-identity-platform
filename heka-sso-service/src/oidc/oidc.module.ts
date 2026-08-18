import { ConfigModule, ConfigService } from '@config'
import { OidcSigningKey } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { createOidcProvider, OIDC_PROVIDER } from './provider.factory'
import { SigningKeysService } from './signing-keys.service'

/**
 * OP core module (INTEGRATION.md §4.1): the `node-oidc-provider` instance and
 * its signing-key store. The provider is built asynchronously because the
 * signing JWKS comes from Postgres (generated on first start) unless the
 * dev override is configured.
 */
@Module({
  imports: [ConfigModule, MikroOrmModule.forFeature({ entities: [OidcSigningKey] })],
  providers: [
    SigningKeysService,
    {
      provide: OIDC_PROVIDER,
      inject: [ConfigService, SigningKeysService],
      useFactory: async (configService: ConfigService, signingKeys: SigningKeysService) =>
        createOidcProvider(configService.oidcConfig, await signingKeys.getJwks()),
    },
  ],
  exports: [SigningKeysService, OIDC_PROVIDER],
})
export class OidcModule {}
