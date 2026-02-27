import type { W3cJwtVerifiablePresentation } from '@credo-ts/core'

import { SdJwtVc, VerifiablePresentation, W3cCredentialSubject } from '@credo-ts/core'
import { OpenId4VcVerificationSessionRepository, OpenId4VcVerificationSessionState, OpenId4VcVerifierApi } from '@credo-ts/openid4vc'
import { Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import {
  OpenId4VcVerificationSessionCreateRequestDto,
  OpenId4VcVerificationSessionCreateRequestResponse,
  GetVerificationSessionByQueryDto,
  OpenId4VcVerificationSessionRecordDto,
} from './dto'

@Injectable()
export class OpenId4VcVerificationSessionService {
  /**
   * Create a Verification Sessions request
   */
  public async createRequest(
    tenantAgent: TenantAgent,
    req: OpenId4VcVerificationSessionCreateRequestDto,
  ): Promise<OpenId4VcVerificationSessionCreateRequestResponse> {
    const { didDocument } = await tenantAgent.dids.resolve(req.requestSigner.did)
    if (!didDocument || !didDocument.verificationMethod?.length) {
      throw new UnprocessableEntityException(`Unable to resolve signing key for DID: ${req.requestSigner.did}`)
    }

    const { authorizationRequest, verificationSession } =
      await tenantAgent.dependencyManager.resolve(OpenId4VcVerifierApi).createAuthorizationRequest({
        requestSigner: {
          method: 'did',
          didUrl: didDocument.verificationMethod[0].id,
        },
        verifierId: req.publicVerifierId,
        presentationExchange: req.presentationExchange,
      })

    return {
      verificationSession:
        OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(verificationSession),
      authorizationRequest,
    }
  }

  /**
   * Find all OpenID4VC verification sessions by query
   */
  public async getVerificationSessionsByQuery(
    tenantAgent: TenantAgent,
    query: GetVerificationSessionByQueryDto,
  ): Promise<OpenId4VcVerificationSessionRecordDto[]> {
    const verificationSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcVerificationSessionRepository)
    const verificationSessions = await verificationSessionRepository.findByQuery(tenantAgent.context, {
      nonce: query.nonce,
      verifierId: query.publicVerifierId,
      authorizationRequestUri: query.authorizationRequestUri,
      state: query.state,
      payloadState: query.payloadState,
    })

    return verificationSessions.map((session) =>
      OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(session),
    )
  }

  /**
   * Get an OpenID4VC verification session by verification session id
   */
  public async getVerificationSession(
    tenantAgent: TenantAgent,
    verificationSessionId: string,
  ): Promise<OpenId4VcVerificationSessionRecordDto> {
    const verificationSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcVerificationSessionRepository)
    const verificationSessionRecord = await verificationSessionRepository.getById(
      tenantAgent.context,
      verificationSessionId,
    )

    let sharedAttributes: Record<string, unknown> | undefined = undefined

    if (verificationSessionRecord.state === OpenId4VcVerificationSessionState.ResponseVerified) {
      const verifiedAuthorizationResponse =
        await tenantAgent.dependencyManager.resolve(OpenId4VcVerifierApi).getVerifiedAuthorizationResponse(verificationSessionId)

      if (!verifiedAuthorizationResponse.presentationExchange?.presentations.length) {
        throw new InternalServerErrorException('Presentation is missing')
      }

      const presentation = verifiedAuthorizationResponse.presentationExchange?.presentations[0]
      if (OpenId4VcVerificationSessionService.isSdJwtPresentation(presentation)) {
        const { vct, cnf, iss, iat, ...attributes } = presentation.prettyClaims
        sharedAttributes = attributes
      } else if (OpenId4VcVerificationSessionService.isJwtVcJsonPresentation(presentation)) {
        const credentialSubject =
          presentation.presentation.verifiableCredential instanceof Array
            ? presentation.presentation.verifiableCredential?.[0].credentialSubject
            : presentation.presentation.verifiableCredential.credentialSubject
        sharedAttributes = (credentialSubject as W3cCredentialSubject).claims
      }
    }

    return OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(
      verificationSessionRecord,
      sharedAttributes,
    )
  }

  /**
   * Delete an OpenID4VC verification session by id
   */
  public async deleteVerificationSession(tenantAgent: TenantAgent, verificationSessionId: string): Promise<void> {
    const verificationSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcVerificationSessionRepository)
    await verificationSessionRepository.deleteById(tenantAgent.context, verificationSessionId)
  }

  private static isSdJwtPresentation(presentation: VerifiablePresentation): presentation is SdJwtVc {
    return (presentation as SdJwtVc).header?.typ === 'vc+sd-jwt'
  }

  private static isJwtVcJsonPresentation(
    presentation: VerifiablePresentation,
  ): presentation is W3cJwtVerifiablePresentation {
    return (presentation as W3cJwtVerifiablePresentation).jwt.header?.typ === 'JWT'
  }
}
