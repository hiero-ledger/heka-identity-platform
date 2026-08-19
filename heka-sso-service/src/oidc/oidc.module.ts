import { ConfigModule, ConfigService } from '@config'
import { OidcSigningKey } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Logger, Module } from '@nestjs/common'

import { AccountClaimsStore } from './account-claims.store'
import { IDENTITY_ACQUIRER, IdentityAcquirer, StubIdentityAcquirer } from './identity-acquirer'
import { InteractionController } from './interaction.controller'
import { createOidcProvider, OIDC_PROVIDER } from './provider.factory'
import { SigningKeysService } from './signing-keys.service'

/**
 * OP core module (INTEGRATION.md §4.1): the `node-oidc-provider` instance, its
 * signing-key store, and the wallet-login interaction (P1.3). The provider is
 * built asynchronously because the signing JWKS comes from Postgres (generated
 * on first start) unless the dev override is configured.
 */
@Module({
  imports: [ConfigModule, MikroOrmModule.forFeature({ entities: [OidcSigningKey] })],
  controllers: [InteractionController],
  providers: [
    SigningKeysService,
    AccountClaimsStore,
    {
      provide: OIDC_PROVIDER,
      inject: [ConfigService, SigningKeysService, AccountClaimsStore],
      useFactory: async (
        configService: ConfigService,
        signingKeys: SigningKeysService,
        accountClaims: AccountClaimsStore,
      ) => createOidcProvider(configService.oidcConfig, await signingKeys.getJwks(), accountClaims),
    },
    {
      // Pluggable identity-acquisition step (P1.3): the dev stub when
      // OIDC_STUB_LOGIN=true (production refuses the flag — P1.3.1), otherwise
      // none — the interaction then denies logins until the wallet
      // implementation lands (P1.6).
      provide: IDENTITY_ACQUIRER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): IdentityAcquirer | null => {
        if (!configService.oidcConfig.stubLogin) return null
        new Logger(OidcModule.name).warn(
          'OIDC_STUB_LOGIN is enabled — logins are stubbed without credential verification (dev only)',
        )
        return new StubIdentityAcquirer()
      },
    },
  ],
  exports: [SigningKeysService, OIDC_PROVIDER, AccountClaimsStore],
})
export class OidcModule {}
