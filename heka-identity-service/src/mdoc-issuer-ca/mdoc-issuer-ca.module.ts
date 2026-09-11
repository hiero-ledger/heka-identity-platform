import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { EuTrustAnchorIngestionService } from './eu-trust-anchor-ingestion.service'
import { IacaCertificatePublicController } from './iaca-certificate.public.controller'
import { MdocIssuerCaController } from './mdoc-issuer-ca.controller'
import { MdocIssuerCaService } from './mdoc-issuer-ca.service'
import { MDOC_ISSUER_CA_SERVICE, VERIFIER_TRUST_ANCHOR_SERVICE } from './mdoc-issuer-ca.tokens'
import { SchemeTrustListController } from './scheme-trust-list.controller'
import { SchemeTrustListService } from './scheme-trust-list.service'
import { TrustListService } from './trust-list.service'
import { VerifierTrustAnchorService } from './verifier-trust-anchor.service'
import { VicalController } from './vical.controller'

@Module({
  // X509SigningModule provides X509SignerService — the VICAL + scheme-list signers are leaves under its service root CA.
  imports: [AgentModule, X509SigningModule],
  controllers: [MdocIssuerCaController, IacaCertificatePublicController, VicalController, SchemeTrustListController],
  providers: [
    MdocIssuerCaService,
    TrustListService,
    EuTrustAnchorIngestionService,
    SchemeTrustListService,
    VerifierTrustAnchorService,
    // String-token aliases so code running inside Credo's agent context (the OID4VCI credential mapper,
    // the X.509 trusted-certificates hook) can resolve these services via ModuleRef, outside Nest
    // constructor injection.
    { provide: MDOC_ISSUER_CA_SERVICE, useExisting: MdocIssuerCaService },
    { provide: VERIFIER_TRUST_ANCHOR_SERVICE, useExisting: VerifierTrustAnchorService },
  ],
  exports: [
    MdocIssuerCaService,
    MDOC_ISSUER_CA_SERVICE,
    TrustListService,
    EuTrustAnchorIngestionService,
    SchemeTrustListService,
    VerifierTrustAnchorService,
    VERIFIER_TRUST_ANCHOR_SERVICE,
  ],
})
export class MdocIssuerCaModule {}
