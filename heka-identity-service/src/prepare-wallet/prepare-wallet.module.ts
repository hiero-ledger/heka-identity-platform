import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { DidModule } from 'did'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'
import { OpenId4VcVerifierModule } from 'openid4vc/verifier/verifier.module'
import { PrepareWalletController } from 'prepare-wallet/prepare-wallet.controller'
import { PrepareWalletService } from 'prepare-wallet/prepare-wallet.service'
import { SchemaV2Module } from 'schema-v2'
import { UserModule } from 'user'

@Module({
  imports: [DidModule, OpenId4VcIssuerModule, OpenId4VcVerifierModule, SchemaV2Module, UserModule, AgentModule],
  controllers: [PrepareWalletController],
  providers: [PrepareWalletService],
})
export class PrepareWalletModule {}
