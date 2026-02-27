import { SdJwtVcPayload } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile, OpenId4VcIssuerApi, OpenId4VcIssuanceSessionRepository } from '@credo-ts/openid4vc'
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'

import { AuthInfo } from '../../common/auth'
import { StatusListService } from '../../revocation/status-list/status-list.service'
import { CredentialIssuanceMetadata } from '../../utils/oid4vc'

import {
  GetIssuanceSessionByQueryDto,
  OpenId4VcIssuanceSessionRecordDto,
  OpenId4VcIssuanceSessionsCreateOfferDto,
  OpenId4VcIssuanceSessionsCreateOfferResponse,
} from './dto'

@Injectable()
export class OpenId4VcIssuanceSessionService {
  public constructor(
    @Inject(AgentConfig.KEY) private readonly agencyConfig: ConfigType<typeof AgentConfig>,
    private readonly statusListService: StatusListService,
  ) {}

  public async offer(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: OpenId4VcIssuanceSessionsCreateOfferDto,
  ): Promise<OpenId4VcIssuanceSessionsCreateOfferResponse> {
    const issuer = await tenantAgent.dependencyManager.resolve(OpenId4VcIssuerApi).getIssuerByIssuerId(req.publicIssuerId)

    // TODO: It is better to we move setting credential status to `credentialRequestToCredentialMapper`
    //  to change status list when credential really requested but how??
    const statusList = await this.statusListService.getOrCreate(authInfo, req.publicIssuerId)
    let credentialIndex = statusList.lastIndex
    const credentialIndexes = []

    // Maps credentials, adds properties, and throws errors if needed
    const mappedCredentials: Array<CredentialIssuanceMetadata> = []
    for (const credential of req.credentials) {
      const credentialSupported = issuer.credentialConfigurationsSupported[credential.credentialSupportedId]

      const isAllowedCredential = (
        this.agencyConfig.credentialsConfiguration.OpenId4VC.credentials as OpenId4VciCredentialFormatProfile[]
      ).includes(credential.format)

      if (!credentialSupported || !isAllowedCredential) {
        throw new UnprocessableEntityException(
          `Offered credentialSupportedId ${credential.credentialSupportedId} not in the issuer credential supported list or not supported by Agency now`,
        )
      }

      if ((credentialSupported as any).format !== credential.format) {
        throw new UnprocessableEntityException(
          `Format of offered credential (credentialSupportedId: ${credential.credentialSupportedId}) is ${credential.format} but expected to be ${(credentialSupported as any).format}`,
        )
      }

      const { didDocument } = await tenantAgent.dids.resolve(credential.issuer.did)
      if (!didDocument || !didDocument.verificationMethod?.length) {
        throw new UnprocessableEntityException(`Unable to resolve signing key for DID: ${credential.issuer.did}`)
      }

      let credentialStatus

      // sd+jwt does not support revocation?
      if (
        credential.format === OpenId4VciCredentialFormatProfile.JwtVcJson ||
        credential.format === OpenId4VciCredentialFormatProfile.JwtVcJsonLd ||
        credential.format === OpenId4VciCredentialFormatProfile.LdpVc
      ) {
        credentialIndex += 1
        credentialIndexes.push(credentialIndex)
        credentialStatus = {
          location: this.statusListService.location(statusList.id),
          index: credentialIndex,
        }
      }

      const type =
        credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc
          ? ((credentialSupported as any).vct as string)
          : ((credentialSupported as any).credential_definition?.type as string[])

      const credentialIssuanceMeta: CredentialIssuanceMetadata = {
        ...credential,
        type,
        issuer: {
          ...credential.issuer,
          didUrl: didDocument.verificationMethod[0].id,
        },
        credentialStatus,
        payload: (credential as any).payload as SdJwtVcPayload,
      }

      mappedCredentials.push(credentialIssuanceMeta)
    }

    const { credentialOffer, issuanceSession } = await tenantAgent.dependencyManager.resolve(OpenId4VcIssuerApi).createCredentialOffer({
      baseUri: req.baseUri,
      credentialConfigurationIds: req.credentials.map((c) => c.credentialSupportedId),
      issuerId: req.publicIssuerId,
      preAuthorizedCodeFlowConfig: req.preAuthorizedCodeFlowConfig ?? {},
      issuanceMetadata: {
        credentials: mappedCredentials,
      },
    })

    if (credentialIndexes.length) {
      await this.statusListService.addItems(authInfo, statusList.id, credentialIndexes)
    }

    return {
      issuanceSession: OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(issuanceSession),
      credentialOffer,
    }
  }

  /**
   * Find all OpenID4VC issuance sessions by query
   */
  public async getIssuanceSessionsByQuery(
    tenantAgent: TenantAgent,
    query: GetIssuanceSessionByQueryDto,
  ): Promise<OpenId4VcIssuanceSessionRecordDto[]> {
    const issuanceSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcIssuanceSessionRepository)
    const issuanceSessions = await issuanceSessionRepository.findByQuery(tenantAgent.context, {
      cNonce: query.cNonce,
      issuerId: query.publicIssuerId,
      preAuthorizedCode: query.preAuthorizedCode,
      state: query.state,
      credentialOfferUri: query.credentialOfferUri,
    })

    return issuanceSessions.map((session) =>
      OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(session),
    )
  }

  /**
   * Get an OpenID4VC issuance session by issuance session id
   */
  public async getIssuanceSession(
    tenantAgent: TenantAgent,
    issuanceSessionId: string,
  ): Promise<OpenId4VcIssuanceSessionRecordDto> {
    const issuanceSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcIssuanceSessionRepository)
    const issuanceSession = await issuanceSessionRepository.getById(tenantAgent.context, issuanceSessionId)

    return OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(issuanceSession)
  }

  /**
   * Delete an OpenID4VC issuance session by id
   */
  public async deleteIssuanceSession(tenantAgent: TenantAgent, issuanceSessionId: string): Promise<void> {
    const issuanceSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcIssuanceSessionRepository)
    await issuanceSessionRepository.deleteById(tenantAgent.context, issuanceSessionId)
  }

  /**
   * Revoke an OpenID4VC credential
   */
  public async revokeIssuanceSession(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    issuanceSessionId: string,
  ): Promise<void> {
    const issuanceSessionRepository = tenantAgent.dependencyManager.resolve(OpenId4VcIssuanceSessionRepository)
    const issuanceSession = await issuanceSessionRepository.getById(tenantAgent.context, issuanceSessionId)

    const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[]
    if (!credentials) throw new Error('Credential not found')

    const credential = credentials[0]

    if (!credential.credentialStatus) throw new Error('Credential does not support revocation')

    const statusListId = credential.credentialStatus.location.split('/')?.pop()
    if (!statusListId) throw new Error('Credential does not support revocation')

    await this.statusListService.updateItems(authInfo, statusListId, {
      indexes: [credential.credentialStatus.index],
      revoked: true,
    })
  }
}
