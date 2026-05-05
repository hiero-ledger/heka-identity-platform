import type { W3cJwtVerifiablePresentation } from '@credo-ts/core'

import { MdocDeviceResponse, SdJwtVc, VerifiablePresentation, W3cCredentialSubject } from '@credo-ts/core'
import { OpenId4VcVerificationSessionRepository, OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
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
      await tenantAgent.openid4vc.verifier.createAuthorizationRequest({
        requestSigner: {
          method: 'did',
          didUrl: didDocument.verificationMethod[0].id,
        },
        verifierId: req.publicVerifierId,
        presentationExchange: req.presentationExchange,
        dcql: req.dcql,
        version: req.version ?? (req.dcql ? 'v1' : 'v1.draft21'),
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
        await tenantAgent.openid4vc.verifier.getVerifiedAuthorizationResponse(verificationSessionId)

      if (verifiedAuthorizationResponse.presentationExchange?.presentations?.length) {
        const presentation = verifiedAuthorizationResponse.presentationExchange.presentations[0]
        sharedAttributes = OpenId4VcVerificationSessionService.extractAttributesFromPresentation(presentation)
      } else if (verifiedAuthorizationResponse.dcql?.presentations) {
        const presentationEntries = Object.values(verifiedAuthorizationResponse.dcql.presentations)[0]
        if (presentationEntries.length) {
          sharedAttributes = OpenId4VcVerificationSessionService.extractAttributesFromPresentation(
            presentationEntries[0],
          )
        }
      } else {
        throw new InternalServerErrorException('Presentation is missing')
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

  private static extractAttributesFromPresentation(
    presentation: VerifiablePresentation,
  ): Record<string, unknown> | undefined {
    if (OpenId4VcVerificationSessionService.isSdJwtPresentation(presentation)) {
      const { vct, cnf, iss, iat, ...attributes } = presentation.prettyClaims
      return attributes
    } else if (OpenId4VcVerificationSessionService.isJwtVcJsonPresentation(presentation)) {
      const credentialSubject =
        presentation.presentation.verifiableCredential instanceof Array
          ? presentation.presentation.verifiableCredential?.[0].credentialSubject
          : presentation.presentation.verifiableCredential.credentialSubject
      return (credentialSubject as W3cCredentialSubject).claims
    } else if (OpenId4VcVerificationSessionService.isMdocPresentation(presentation)) {
      const doc = presentation.documents[0]
      if (doc) {
        return Object.values(doc.issuerSignedNamespaces).reduce<Record<string, unknown>>(
          (acc, ns) => ({ ...acc, ...ns }),
          {},
        )
      }
    }
    return undefined
  }

  private static isSdJwtPresentation(presentation: VerifiablePresentation): presentation is SdJwtVc {
    return (presentation as SdJwtVc).header?.typ === 'vc+sd-jwt'
  }

  private static isJwtVcJsonPresentation(
    presentation: VerifiablePresentation,
  ): presentation is W3cJwtVerifiablePresentation {
    return (presentation as W3cJwtVerifiablePresentation).jwt?.header?.typ === 'JWT'
  }

  private static isMdocPresentation(presentation: VerifiablePresentation): presentation is MdocDeviceResponse {
    return 'documents' in presentation
  }
}
