import { ConfigModule, ConfigService } from '@config'
import { OidcEntity, OidcSigningKey } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Logger, Module } from '@nestjs/common'

import { AccountClaimsStore } from './account-claims.store'
import { InteractionAssetsController } from './assets.controller'
import { IDENTITY_ACQUIRER, IdentityAcquirer, StubIdentityAcquirer } from './identity-acquirer'
import { IdentityServiceEventsClient } from './identity-service-events.client'
import { IdentityServiceTokenProvider } from './identity-service-token.provider'
import { InteractionController } from './interaction.controller'
import { LoginEventsService } from './login-events.service'
import { MikroOrmAdapter } from './mikro-orm.adapter'
import { OidcCleanupService } from './oidc-cleanup.service'
import { createOidcProvider, OIDC_PROVIDER } from './provider.factory'
import { SigningKeysService } from './signing-keys.service'
import { VerificationSessionClient } from './verification-session.client'
import { WalletIdentityAcquirer } from './wallet-identity-acquirer'

/**
 * OP core module (INTEGRATION.md §4.1): the `node-oidc-provider` instance, its
 * signing-key store, and the wallet-login interaction (P1.3). The provider is
 * built asynchronously because the signing JWKS comes from Postgres (generated
 * on first start) unless the dev override is configured.
 */
@Module({
  imports: [ConfigModule, MikroOrmModule.forFeature({ entities: [OidcEntity, OidcSigningKey] })],
  // P2.10.1: the assets controller is listed first so /interaction/assets/*
  // resolves before InteractionController's `:uid`-shaped routes.
  controllers: [InteractionAssetsController, InteractionController],
  providers: [
    SigningKeysService,
    AccountClaimsStore,
    OidcCleanupService,
    IdentityServiceTokenProvider,
    VerificationSessionClient,
    LoginEventsService,
    IdentityServiceEventsClient,
    {
      provide: OIDC_PROVIDER,
      inject: [ConfigService, SigningKeysService, AccountClaimsStore, EntityManager],
      useFactory: async (
        configService: ConfigService,
        signingKeys: SigningKeysService,
        accountClaims: AccountClaimsStore,
        em: EntityManager,
      ) =>
        createOidcProvider(
          configService.oidcConfig,
          await signingKeys.getJwks(),
          accountClaims,
          // P1.5: Postgres-backed storage; the adapter forks the EM per operation (§5)
          (name: string) => new MikroOrmAdapter(name, em),
        ),
    },
    {
      // Pluggable identity-acquisition step (P1.3/P1.6): the dev stub wins
      // when OIDC_STUB_LOGIN=true (explicit dev override; production refuses
      // the flag — P1.3.1); otherwise the OID4VP wallet acquirer when the
      // identity-service verifier/signer are configured; otherwise none —
      // logins are then denied.
      provide: IDENTITY_ACQUIRER,
      inject: [ConfigService, VerificationSessionClient, LoginEventsService, IdentityServiceEventsClient],
      useFactory: (
        configService: ConfigService,
        sessions: VerificationSessionClient,
        loginEvents: LoginEventsService,
        identityEvents: IdentityServiceEventsClient,
      ): IdentityAcquirer | null => {
        const logger = new Logger(OidcModule.name)
        if (configService.oidcConfig.stubLogin) {
          logger.warn('OIDC_STUB_LOGIN is enabled — logins are stubbed without credential verification (dev only)')
          return new StubIdentityAcquirer()
        }
        const { publicVerifierId, requestSignerDid } = configService.oidcConfig.identityService
        if (publicVerifierId && requestSignerDid) {
          logger.log('Wallet login enabled (OID4VP via heka-identity-service verification sessions)')
          // P3.7: subscribe to identity-service verification events and relay
          // them to the login page; polling remains the fallback channel.
          identityEvents.start((event) => loginEvents.handleSessionEvent(event))
          return new WalletIdentityAcquirer(sessions, configService, loginEvents)
        }
        logger.warn(
          'No identity acquisition method enabled — set IDENTITY_SERVICE_PUBLIC_VERIFIER_ID + ' +
            'IDENTITY_SERVICE_REQUEST_SIGNER_DID for wallet login (or OIDC_STUB_LOGIN=true in dev); logins will be denied',
        )
        return null
      },
    },
  ],
  exports: [SigningKeysService, OIDC_PROVIDER, AccountClaimsStore, LoginEventsService],
})
export class OidcModule {}
