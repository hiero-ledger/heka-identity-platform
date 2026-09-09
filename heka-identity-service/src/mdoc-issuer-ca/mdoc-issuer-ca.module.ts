import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { EuTrustListController } from './eu-trust-list.controller'
import { EuTrustListService } from './eu-trust-list.service'
import { MdocIssuerCaController } from './mdoc-issuer-ca.controller'
import { MdocIssuerCaService } from './mdoc-issuer-ca.service'
import { MDOC_ISSUER_CA_SERVICE } from './mdoc-issuer-ca.tokens'
import { TrustListService } from './trust-list.service'
import { VicalController } from './vical.controller'

@Module({
  // X509SigningModule provides X509SignerService — the VICAL + EU-trust-list signers are leaves under its service root CA.
  imports: [AgentModule, X509SigningModule],
  controllers: [MdocIssuerCaController, VicalController, EuTrustListController],
  providers: [
    MdocIssuerCaService,
    TrustListService,
    EuTrustListService,
    // String-token alias so the OID4VCI credential mapper can resolve the service via ModuleRef
    // (it runs inside Credo's agent context, outside Nest constructor injection).
    { provide: MDOC_ISSUER_CA_SERVICE, useExisting: MdocIssuerCaService },
  ],
  exports: [MdocIssuerCaService, MDOC_ISSUER_CA_SERVICE, TrustListService, EuTrustListService],
})
export class MdocIssuerCaModule {}
