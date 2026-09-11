import { DidDocument, getPublicJwkFromVerificationMethod, SdJwtVcPayload } from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VcIssuanceSessionRepository,
  OpenId4VcIssuerService,
} from '@credo-ts/openid4vc'
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'
import { MdocIssuerCaService } from 'mdoc-issuer-ca'
import { SdJwtVcIssuerService } from 'sdjwt-vc-issuer'
import { IssuerMode, CredentialIssuanceMetadata, PinnedIssuerSigner } from 'utils/oid4vc'

import { AuthInfo } from '../../common/auth'
import { StatusListService } from '../../revocation/status-list/status-list.service'
import {
  TokenStatus,
  TokenStatusListService,
  TokenStatusListSignerIdentity,
} from '../../revocation/token-status-list/token-status-list.service'

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
    private readonly mdocIssuerCaService: MdocIssuerCaService,
    private readonly tokenStatusListService: TokenStatusListService,
    private readonly sdJwtVcIssuerService: SdJwtVcIssuerService,
  ) {}

  public async offer(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: OpenId4VcIssuanceSessionsCreateOfferDto,
  ): Promise<OpenId4VcIssuanceSessionsCreateOfferResponse> {
    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(req.publicIssuerId)

    // TODO: It is better to we move setting credential status to `credentialRequestToCredentialMapper`
    //  to change status list when credential really requested but how??
    // W3C VCs get their bitstring indexes in ONE locked reservation after every credential validated (H2:
    // no read-modify-write of `lastIndex` across concurrent offers). Positions of those credentials in
    // `mappedCredentials` are remembered here and filled in below.
    const bitstringPositions: number[] = []

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

      // x5c-mode SD-JWT VC is signed with the tenant's X.509 issuer cert (HAIP), not a DID.
      const isX5cSdJwt =
        credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc &&
        (credential as { issuerMode?: IssuerMode }).issuerMode === 'x5c'

      // MsoMdoc uses X.509 certificates, not DIDs — skip DID resolution
      let issuerDid: string | undefined
      let issuerDidUrl: string | undefined
      if (credential.format !== OpenId4VciCredentialFormatProfile.MsoMdoc && !isX5cSdJwt) {
        const issuerCredential = credential as { issuer: { did: string } }
        issuerDid = issuerCredential.issuer.did
        const { didDocument } = await tenantAgent.dids.resolve(issuerCredential.issuer.did)
        if (!didDocument || !didDocument.verificationMethod?.length) {
          throw new UnprocessableEntityException(
            `Unable to resolve signing key for DID: ${issuerCredential.issuer.did}`,
          )
        }
        issuerDidUrl = didDocument.verificationMethod[0].id
      } else if (credential.format === OpenId4VciCredentialFormatProfile.MsoMdoc) {
        // mso_mdoc is signed by the tenant's per-tenant DSC (chaining to its IACA). Fail fast (400)
        // here if the tenant has no provisioned mdoc issuer, rather than deep in the credential mapper
        // when the wallet later requests the credential.
        await this.mdocIssuerCaService.requireProvisioned(tenantAgent.context)
      }

      let credentialStatus: CredentialIssuanceMetadata['credentialStatus']
      let issuerSigner: PinnedIssuerSigner | undefined

      // W3C VCs → bitstring status list; SD-JWT VC → IETF token status list (the EUDI / HAIP mechanism);
      // mso_mdoc → none until Credo exposes the MSO `status` claim (0.8.0).
      if (
        credential.format === OpenId4VciCredentialFormatProfile.JwtVcJson ||
        credential.format === OpenId4VciCredentialFormatProfile.JwtVcJsonLd ||
        credential.format === OpenId4VciCredentialFormatProfile.LdpVc
      ) {
        bitstringPositions.push(mappedCredentials.length)
      } else if (credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc) {
        const signer = await this.sdJwtStatusListSigner(tenantAgent, isX5cSdJwt, issuerDid, issuerDidUrl)
        // One status-list entry per credential the wallet may request in a batch (M4).
        const batchSize = issuer.batchCredentialIssuance?.batchSize ?? 1
        const reference = await this.tokenStatusListService.allocateMany(
          tenantAgent.context,
          authInfo,
          signer,
          batchSize,
        )
        credentialStatus = {
          type: 'token-status-list',
          location: reference.uri,
          index: reference.indexes[0],
          indexes: reference.indexes,
        }
        // x5c: pin the signing identity the entries were allocated under, so a certificate renewal between
        // offer and request cannot split the credential from its status list (M3).
        if (signer.signer.method === 'x5c') {
          issuerSigner = { keyId: signer.keyId, x5c: signer.signer.x5c, issuer: signer.issuer }
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
        credentialIssuanceMeta = {
          format: credential.format,
          credentialSupportedId: credential.credentialSupportedId,
          type,
          issuer: {},
          namespaces: credential.namespaces,
        }
      } else {
        credentialIssuanceMeta = {
          ...credential,
          type,
          issuer: {
            ...credential.issuer,
            didUrl: issuerDidUrl,
          },
          credentialStatus,
          ...(issuerSigner ? { issuerSigner } : {}),
          payload: (credential as { payload?: SdJwtVcPayload }).payload,
        }
      }

      mappedCredentials.push(credentialIssuanceMeta)
    }

    if (bitstringPositions.length > 0) {
      const reserved = await this.statusListService.reserveIndexes(
        authInfo,
        req.publicIssuerId,
        bitstringPositions.length,
      )
      const location = this.statusListService.location(reserved.id)
      bitstringPositions.forEach((position, offset) => {
        mappedCredentials[position].credentialStatus = { type: 'bitstring', location, index: reserved.indexes[offset] }
      })
    }

    const { credentialOffer, issuanceSession } = await tenantAgent.openid4vc.issuer.createCredentialOffer({
      baseUri: req.baseUri,
      credentialConfigurationIds: req.credentials.map((c) => c.credentialSupportedId),
      issuerId: req.publicIssuerId,
      preAuthorizedCodeFlowConfig: req.preAuthorizedCodeFlowConfig ?? {},
      issuanceMetadata: {
        credentials: mappedCredentials,
      },
    })

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
    const issuanceSession = await tenantAgent.openid4vc.issuer.getIssuanceSessionById(issuanceSessionId)

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
    const issuanceSession = await tenantAgent.openid4vc.issuer.getIssuanceSessionById(issuanceSessionId)

    const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[]
    if (!credentials) throw new Error('Credential not found')

    const credential = credentials[0]

    if (!credential.credentialStatus) throw new Error('Credential does not support revocation')

    const statusListId = credential.credentialStatus.location.split('/')?.pop()
    if (!statusListId) throw new Error('Credential does not support revocation')

    if (credential.credentialStatus.type === 'token-status-list') {
      // Every credential of the issuance (a batch holds one entry per holder key) is revoked together.
      const indexes = credential.credentialStatus.indexes ?? [credential.credentialStatus.index]
      await this.tokenStatusListService.setStatuses(
        tenantAgent.context,
        authInfo,
        statusListId,
        indexes,
        TokenStatus.Invalid,
      )
      return
    }

    await this.statusListService.updateItems(authInfo, statusListId, {
      indexes: [credential.credentialStatus.index],
      revoked: true,
    })
  }

  /**
   * The identity a token status list for this SD-JWT VC issuance must be signed with: the very key that
   * signs the credentials (Credo verifies a Status List Token with the referenced credential's issuer
   * key). x5c mode → the tenant's issuer leaf; DID mode → the DID's verification-method key.
   */
  private async sdJwtStatusListSigner(
    tenantAgent: TenantAgent,
    isX5c: boolean,
    issuerDid: string | undefined,
    issuerDidUrl: string | undefined,
  ): Promise<TokenStatusListSignerIdentity> {
    if (isX5c) {
      const { certificateChain, issuerUrl } = await this.sdJwtVcIssuerService.loadIssuerCertificateChain(
        tenantAgent.context,
      )
      const leafJwk = certificateChain[0].publicJwk
      if (!leafJwk.hasKeyId)
        throw new UnprocessableEntityException('SD-JWT VC issuer certificate has no signing key bound')
      return {
        issuer: issuerUrl,
        keyId: leafJwk.keyId,
        signer: { method: 'x5c', x5c: certificateChain.map((certificate) => certificate.toString('base64')) },
      }
    }

    if (!issuerDid || !issuerDidUrl) throw new UnprocessableEntityException('SD-JWT VC issuer DID is missing')
    const { didDocument, keys } = await tenantAgent.dids.resolveCreatedDidDocumentWithKeys(issuerDid)
    const keyId =
      keys?.find(
        (candidate) =>
          issuerDidUrl === `${issuerDid}${candidate.didDocumentRelativeKeyId}` ||
          issuerDidUrl.endsWith(candidate.didDocumentRelativeKeyId),
      )?.kmsKeyId ?? (await this.legacyDidKeyId(tenantAgent, didDocument, issuerDidUrl))
    if (!keyId) throw new UnprocessableEntityException(`Unable to resolve the signing key for DID URL: ${issuerDidUrl}`)
    return { issuer: issuerDid, keyId, signer: { method: 'did', kid: issuerDidUrl } }
  }

  /**
   * DID records created before the Credo 0.6 key-id migration carry no `keys` (verification method →
   * KMS key id) mapping; Credo itself then signs the credential with the verification method's *legacy*
   * key id (`DidsApi.resolveVerificationMethodFromCreatedDidRecord`). Mirror that fallback so such DIDs
   * can receive SD-JWT VC offers too (H6) — but only when the tenant KMS actually holds that key.
   */
  private async legacyDidKeyId(
    tenantAgent: TenantAgent,
    didDocument: DidDocument,
    didUrl: string,
  ): Promise<string | undefined> {
    try {
      const legacyKeyId = getPublicJwkFromVerificationMethod(didDocument.dereferenceKey(didUrl)).legacyKeyId
      const publicKey = await tenantAgent.kms.getPublicKey({ keyId: legacyKeyId })
      return publicKey ? legacyKeyId : undefined
    } catch {
      return undefined
    }
  }
}
