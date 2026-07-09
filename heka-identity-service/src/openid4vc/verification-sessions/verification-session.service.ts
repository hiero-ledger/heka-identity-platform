import type { W3cJwtVerifiablePresentation } from '@credo-ts/core'
import type { OpenId4VcJwtIssuerDid } from '@credo-ts/openid4vc'

import { ClaimFormat, MdocDeviceResponse, SdJwtVc, VerifiablePresentation, W3cCredentialSubject } from '@credo-ts/core'
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
    const isDcApi = req.responseMode === 'dc_api' || req.responseMode === 'dc_api.jwt'

    let requestSigner: OpenId4VcJwtIssuerDid | { method: 'none' }
    if (isDcApi && !req.requestSigner?.did) {
      requestSigner = { method: 'none' }
    } else {
      if (!req.requestSigner?.did) {
        throw new UnprocessableEntityException('requestSigner.did is required')
      }
      const { didDocument } = await tenantAgent.dids.resolve(req.requestSigner.did)
      if (!didDocument || !didDocument.verificationMethod?.length) {
        throw new UnprocessableEntityException(`Unable to resolve signing key for DID: ${req.requestSigner.did}`)
      }
      requestSigner = { method: 'did', didUrl: didDocument.verificationMethod[0].id }
    }

    const { authorizationRequest, verificationSession, authorizationRequestObject } =
      await tenantAgent.openid4vc.verifier.createAuthorizationRequest({
        requestSigner,
        verifierId: req.publicVerifierId,
        presentationExchange: req.presentationExchange,
        dcql: req.dcql,
        version: req.version ?? (req.dcql ? 'v1' : 'v1.draft21'),
        responseMode: req.responseMode,
        expectedOrigins: isDcApi && requestSigner.method === 'none' ? undefined : req.expectedOrigins,
      })

    return {
      verificationSession:
        OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(verificationSession),
      authorizationRequest,
      authorizationRequestObject: isDcApi ? authorizationRequestObject : undefined,
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
      sharedAttributes = await this.getSharedAttributes(tenantAgent, verificationSessionId)
    }

    return OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(
      verificationSessionRecord,
      sharedAttributes,
    )
  }

  /**
   * Resolve the disclosed attributes of a verified authorization response, supporting
   * both Presentation Exchange and DCQL presentations across SD-JWT, JWT VC and mdoc.
   */
  private async getSharedAttributes(
    tenantAgent: TenantAgent,
    verificationSessionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const verifiedAuthorizationResponse =
      await tenantAgent.openid4vc.verifier.getVerifiedAuthorizationResponse(verificationSessionId)

    if (verifiedAuthorizationResponse.presentationExchange?.presentations?.length) {
      const presentation = verifiedAuthorizationResponse.presentationExchange.presentations[0]
      return OpenId4VcVerificationSessionService.extractAttributesFromPresentation(presentation)
    } else if (verifiedAuthorizationResponse.dcql?.presentations) {
      const presentationEntries = Object.values(verifiedAuthorizationResponse.dcql.presentations)[0]
      if (presentationEntries.length) {
        return OpenId4VcVerificationSessionService.extractAttributesFromPresentation(presentationEntries[0])
      }
      return undefined
    } else {
      throw new InternalServerErrorException('Presentation is missing')
    }
  }

  /**
   * Verify a DC API authorization response submitted by the browser.
   * Used when responseMode is dc_api or dc_api.jwt — the wallet returns
   * the VP token to the browser, which forwards it here for verification.
   */
  public async verifyDcApiResponse(
    tenantAgent: TenantAgent,
    verificationSessionId: string,
    authorizationResponse: Record<string, unknown>,
    origin: string,
  ): Promise<OpenId4VcVerificationSessionRecordDto> {
    const { verificationSession } = await tenantAgent.openid4vc.verifier.verifyAuthorizationResponse({
      verificationSessionId,
      authorizationResponse,
      origin,
    })

    let sharedAttributes: Record<string, unknown> | undefined = undefined
    if (verificationSession.state === OpenId4VcVerificationSessionState.ResponseVerified) {
      sharedAttributes = await this.getSharedAttributes(tenantAgent, verificationSessionId)
    }

    return OpenId4VcVerificationSessionRecordDto.fromOpenId4VcVerificationSessionRecord(
      verificationSession,
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
      const firstDocClaims = Object.values(presentation.issuerClaims)[0]
      if (firstDocClaims) {
        return Object.values(firstDocClaims).reduce<Record<string, unknown>>((acc, ns) => ({ ...acc, ...ns }), {})
      }
    }
    return undefined
  }

  private static isSdJwtPresentation(presentation: VerifiablePresentation): presentation is SdJwtVc {
    return (presentation as SdJwtVc).claimFormat === ClaimFormat.SdJwtDc
  }

  private static isJwtVcJsonPresentation(
    presentation: VerifiablePresentation,
  ): presentation is W3cJwtVerifiablePresentation {
    return (presentation as W3cJwtVerifiablePresentation).jwt?.header?.typ === 'JWT'
  }

  private static isMdocPresentation(presentation: VerifiablePresentation): presentation is MdocDeviceResponse {
    return (presentation as MdocDeviceResponse).claimFormat === ClaimFormat.MsoMdoc
  }
}
