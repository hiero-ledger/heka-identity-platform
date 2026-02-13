import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { OpenId4VcIssuanceSessionRepository } from '@credo-ts/openid4vc/build/openid4vc-issuer/repository'
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
    const issuer = await tenantAgent.modules.openId4VcIssuer.getIssuerByIssuerId(req.publicIssuerId)

    // TODO: It is better to we move setting credential status to `credentialRequestToCredentialMapper`
    //  to change status list when credential really requested but how??
    const statusList = await this.statusListService.getOrCreate(authInfo, req.publicIssuerId)
    let credentialIndex = statusList.lastIndex
    const credentialIndexes = []

    // Maps credentials, adds properties, and throws errors if needed
    const mappedCredentials: Array<CredentialIssuanceMetadata> = []
    for (const credential of req.credentials) {
      const credentialSupported = Object.values(issuer.credentialConfigurationsSupported).find(
        (configuration) => configuration.id === credential.credentialSupportedId,
      )

      const isAllowedCredential = (
        this.agencyConfig.credentialsConfiguration.OpenId4VC.credentials as OpenId4VciCredentialFormatProfile[]
      ).includes(credential.format)

      if (!credentialSupported || !isAllowedCredential) {
        throw new UnprocessableEntityException(
          `Offered credentialSupportedId ${credential.credentialSupportedId} not in the issuer credential supported list or not supported by Agency now`,
        )
      }

      if (credentialSupported.format !== credential.format) {
        throw new UnprocessableEntityException(
          `Format of offered credential (credentialSupportedId: ${credential.credentialSupportedId}) is ${credential.format} but expected to be ${credentialSupported.format}`,
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
          ? (credentialSupported.vct as string)
          : // @ts-ignore TODO: Fix typechecks
            (credentialSupported.credential_definition.type as string[])

      const credentialIssuanceMeta: CredentialIssuanceMetadata = {
        ...credential,
        type,
        issuer: {
          ...credential.issuer,
          didUrl: didDocument.verificationMethod[0].id,
        },
        credentialStatus,
      }

      mappedCredentials.push(credentialIssuanceMeta)
    }

    const { credentialOffer, issuanceSession } = await tenantAgent.modules.openId4VcIssuer.createCredentialOffer({
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
