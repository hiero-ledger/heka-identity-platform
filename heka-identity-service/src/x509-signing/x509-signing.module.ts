import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { X509SignerService } from './x509-signer.service'
import { X509SignerController } from './x509-signing.controller'

@Module({
  imports: [AgentModule],
  controllers: [X509SignerController],
  providers: [X509SignerService],
  exports: [X509SignerService],
})
export class X509SigningModule {}
