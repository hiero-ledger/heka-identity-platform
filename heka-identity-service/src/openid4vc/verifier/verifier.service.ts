import { injectable, isDid } from '@credo-ts/core'
import { OpenId4VcVerifierRepository } from '@credo-ts/openid4vc'
import { ConflictException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { DidService } from 'did/did.service'

import { OpenId4VcVerifierCreateDto, OpenId4VcVerifierRecordDto } from './dto'

@injectable()
export class OpenId4VcVerifierService {
  public constructor(private readonly didService: DidService) {}

  public async createVerifier(
    tenantAgent: TenantAgent,
    options: OpenId4VcVerifierCreateDto,
  ): Promise<OpenId4VcVerifierRecordDto> {
    // Credo routes the public OID4VP endpoints of a verifier id, and the OID4VCI endpoints of an issuer id, to the first
    // tenant whose issuer or verifier has that id, so only the wallet that holds a DID may use it
    if (isDid(options.publicVerifierId)) {
      await this.didService.assertOwnActiveDid(tenantAgent, options.publicVerifierId)
    }

    const existingVerifiers = await tenantAgent.dependencyManager
      .resolve(OpenId4VcVerifierRepository)
      .findByQuery(tenantAgent.context, { verifierId: options.publicVerifierId })
    if (existingVerifiers.length) {
      throw new ConflictException(`Verifier with DID ${options.publicVerifierId} has been already created`)
    }

    const verifier = await tenantAgent.openid4vc.verifier.createVerifier({
      verifierId: options.publicVerifierId,
    })
    return OpenId4VcVerifierRecordDto.fromOpenId4VcVerifierRecord(verifier)
  }

  public async find(tenantAgent: TenantAgent, publicVerifierId: string): Promise<OpenId4VcVerifierRecordDto[]> {
    const verifierRepository = tenantAgent.dependencyManager.resolve(OpenId4VcVerifierRepository)
    const verifiers = await verifierRepository.findByQuery(tenantAgent.context, {
      verifierId: publicVerifierId,
    })
    return verifiers.map((verifier) => OpenId4VcVerifierRecordDto.fromOpenId4VcVerifierRecord(verifier))
  }
}
