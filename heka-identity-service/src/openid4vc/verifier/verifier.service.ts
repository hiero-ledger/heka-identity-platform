import { injectable } from '@credo-ts/core'
import { OpenId4VcVerifierRepository } from '@credo-ts/openid4vc'
import { ConflictException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { OpenId4VcVerifierCreateDto, OpenId4VcVerifierRecordDto } from './dto'

@injectable()
export class OpenId4VcVerifierService {
  public async createVerifier(
    tenantAgent: TenantAgent,
    options: OpenId4VcVerifierCreateDto,
  ): Promise<OpenId4VcVerifierRecordDto> {
    const existingVerifiers = await tenantAgent.dependencyManager
      .resolve(OpenId4VcVerifierRepository)
      .findByQuery(tenantAgent.context, { verifierId: options.publicVerifierId })
    if (existingVerifiers.length) {
      throw new ConflictException(`Verifier with DID ${options.publicVerifierId} has been already created`)
    }

    const verifier = await tenantAgent.modules.openId4VcVerifier.createVerifier({
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
