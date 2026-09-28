import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { ManagedCertificateService } from './managed-certificate.service'
import { X509SignerController } from './x509-signer.controller'
import { X509SignerService } from './x509-signer.service'

@Module({
  imports: [AgentModule],
  controllers: [X509SignerController],
  providers: [X509SignerService, ManagedCertificateService],
  exports: [X509SignerService, ManagedCertificateService],
})
export class X509SigningModule {}
