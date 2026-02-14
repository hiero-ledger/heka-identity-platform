import { join } from 'path'

import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ServeStaticModule } from '@nestjs/serve-static'

import { CredentialV2Module } from 'credential-v2'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'
import { OpenId4VcStarterModule } from 'openid4vc/starter'
import { OpenId4VcVerifierModule } from 'openid4vc/verifier/verifier.module'
import { PrepareWalletModule } from 'prepare-wallet'
import { VerificationTemplateModule } from 'verification-template/verification-template.module'

import { LoggerModule } from './common/logger'
import { OCAModule } from './common/oca/oca.module'
import { fileStorageConfigDefaults } from './config/file-storage'
import { ConnectionModule } from './connection'
import { CoreModule } from './core'
import { CredentialModule } from './credential'
import { CredentialDefinitionModule } from './credential-definition'
import { DidModule } from './did'
import { HealthModule } from './health'
import { IssuanceTemplateModule } from './issuance-template'
import { OpenId4VcVerificationSessionModule } from './openid4vc/verification-sessions'
import { ProofModule } from './proof'
import { RevocationModule } from './revocation'
import { SchemaModule } from './schema'
import { SchemaV2Module } from './schema-v2'
import { UserModule } from './user'

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', fileStorageConfigDefaults.fileSystem.path),
    }),
    CoreModule,
    UserModule,
    DidModule,
    SchemaModule,
    SchemaV2Module,
    IssuanceTemplateModule,
    VerificationTemplateModule,
    CredentialDefinitionModule,
    ConnectionModule,
    CredentialModule,
    ProofModule,
    OpenId4VcStarterModule,
    OpenId4VcIssuerModule,
    OpenId4VcIssuanceSessionModule,
    OpenId4VcVerifierModule,
    OpenId4VcVerificationSessionModule,
    HealthModule,
    RevocationModule,
    PrepareWalletModule,
    CredentialV2Module,
    OCAModule,
    EventEmitterModule.forRoot(),
    LoggerModule.forRoot(), // must be dynamic and the last initialized module in the app except for AppModule itself
  ],
})
export class AppModule {}
