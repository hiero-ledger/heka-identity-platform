import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { AccessCertificateService } from './access-certificate.service'
import { OpenId4VcIssuerController } from './issuer.controller'
import { OpenId4VcIssuerService } from './issuer.service'

@Module({
  // X509SigningModule provides X509SignerService — the OID4VCI access cert is signed under its service root.
  imports: [AgentModule, X509SigningModule],
  controllers: [OpenId4VcIssuerController],
  providers: [OpenId4VcIssuerService, AccessCertificateService],
  exports: [OpenId4VcIssuerService],
})
export class OpenId4VcIssuerModule {}
