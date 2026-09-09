import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { SdJwtVcIssuerService } from './sdjwt-vc-issuer.service'
import { SDJWT_VC_ISSUER_SERVICE } from './sdjwt-vc-issuer.tokens'

@Module({
  // X509SigningModule provides X509SignerService — the SD-JWT VC issuer leaf is signed under its service root.
  imports: [AgentModule, X509SigningModule],
  providers: [
    SdJwtVcIssuerService,
    // String-token alias so the OID4VCI credential mapper can resolve the service via ModuleRef.
    { provide: SDJWT_VC_ISSUER_SERVICE, useExisting: SdJwtVcIssuerService },
  ],
  exports: [SdJwtVcIssuerService, SDJWT_VC_ISSUER_SERVICE],
})
export class SdJwtVcIssuerModule {}
