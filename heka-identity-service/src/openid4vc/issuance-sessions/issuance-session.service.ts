import { SdJwtVcPayload } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile, OpenId4VcIssuerService } from '@credo-ts/openid4vc'
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
import { OpenId4VcIssuanceSessionCreateOfferMsoMdocCredentialOptions } from './dto/credential-offer.dto'

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
      const credentialSupported = issuer.credentialConfigurationsSupported[credential.credentialSupportedId]

      const isAllowedCredential = (
        this.agencyConfig.credentialsConfiguration.OpenId4VC.credentials as OpenId4VciCredentialFormatProfile[]
      ).includes(credential.format)

      if (!credentialSupported || !isAllowedCredential) {
        throw new UnprocessableEntityException(
          `Offered credentialSupportedId ${credential.credentialSupportedId} not in the issuer credential supported list or not supported by Agency now`,
        )
      }

      const supportedFormat = (credentialSupported as { format: string }).format
      if (supportedFormat !== credential.format) {
        throw new UnprocessableEntityException(
          `Format of offered credential (credentialSupportedId: ${credential.credentialSupportedId}) is ${credential.format} but expected to be ${supportedFormat}`,
        )
      }

      // MsoMdoc uses X.509 certificates, not DIDs — skip DID resolution
      let issuerDidUrl: string | undefined
      if (credential.format !== OpenId4VciCredentialFormatProfile.MsoMdoc) {
        const issuerCredential = credential as { issuer: { did: string } }
        const { didDocument } = await tenantAgent.dids.resolve(issuerCredential.issuer.did)
        if (!didDocument || !didDocument.verificationMethod?.length) {
          throw new UnprocessableEntityException(`Unable to resolve signing key for DID: ${issuerCredential.issuer.did}`)
        }
        issuerDidUrl = didDocument.verificationMethod[0].id
      }

      let credentialStatus

      // sd+jwt and mso_mdoc do not support revocation
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

      let type: string | string[]
      if (credential.format === OpenId4VciCredentialFormatProfile.MsoMdoc) {
        type = (credentialSupported as { doctype: string }).doctype
      } else if (credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc) {
        type = (credentialSupported as { vct: string }).vct
      } else {
        type = (credentialSupported as { credential_definition?: { type: string[] } }).credential_definition?.type ?? []
      }

      let credentialIssuanceMeta: CredentialIssuanceMetadata

      if (credential.format === OpenId4VciCredentialFormatProfile.MsoMdoc) {
        const mdocCredential = credential as OpenId4VcIssuanceSessionCreateOfferMsoMdocCredentialOptions
        credentialIssuanceMeta = {
          format: credential.format,
          credentialSupportedId: credential.credentialSupportedId,
          type,
          issuer: {},
          namespaces: mdocCredential.namespaces,
        }
      } else {
        const didCredential = credential as { issuer: { did: string; name?: string; image?: string; url?: string } }
        credentialIssuanceMeta = {
          ...credential,
          type,
          issuer: {
            ...didCredential.issuer,
            didUrl: issuerDidUrl,
          },
          credentialStatus,
          payload: (credential as { payload?: SdJwtVcPayload }).payload,
        }
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
    const issuanceSessionService = tenantAgent.dependencyManager.resolve(OpenId4VcIssuerService)
    const issuanceSessions = await issuanceSessionService.findIssuanceSessionsByQuery(tenantAgent.context, {
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
    const issuanceSession = await tenantAgent.modules.openId4VcIssuer.getIssuanceSessionById(issuanceSessionId)

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
    const issuanceSession = await tenantAgent.modules.openId4VcIssuer.getIssuanceSessionById(issuanceSessionId)

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
