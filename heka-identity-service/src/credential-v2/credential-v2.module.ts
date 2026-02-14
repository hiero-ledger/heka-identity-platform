import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { CredentialModule } from 'credential'
import { CredentialV2Controller } from 'credential-v2/credential-v2.controller'
import { CredentialV2Service } from 'credential-v2/credential-v2.service'
import { IssuanceTemplateModule } from 'issuance-template'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions'
import { OpenId4VcVerificationSessionModule } from 'openid4vc/verification-sessions'
import { ProofModule } from 'proof'
import { VerificationTemplateModule } from 'verification-template'

@Module({
  imports: [
    AgentModule,
    IssuanceTemplateModule,
    CredentialModule,
    OpenId4VcIssuanceSessionModule,
    ProofModule,
    OpenId4VcVerificationSessionModule,
    VerificationTemplateModule,
  ],
  controllers: [CredentialV2Controller],
  providers: [CredentialV2Service],
})
export class CredentialV2Module {}
