import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { SdJwtVcIssuerService } from './sdjwt-vc-issuer.service'
import { SDJWT_VC_ISSUER_SERVICE } from './sdjwt-vc-issuer.tokens'

@Module({
  // X509SigningModule provides ManagedCertificateService (service-root-signed leaf lifecycle).
  imports: [AgentModule, X509SigningModule],
  providers: [
    SdJwtVcIssuerService,
    // String-token alias so the OID4VCI credential mapper can resolve the service via ModuleRef.
    { provide: SDJWT_VC_ISSUER_SERVICE, useExisting: SdJwtVcIssuerService },
  ],
  exports: [SdJwtVcIssuerService, SDJWT_VC_ISSUER_SERVICE],
})
export class SdJwtVcIssuerModule {}
