import { parseDid, RecordNotFoundError, SdJwtVcPayload } from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VcIssuanceSessionRecord,
  OpenId4VcIssuanceSessionRepository,
  OpenId4VcIssuerService,
} from '@credo-ts/openid4vc'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'
import AgentConfig from 'config/agent'

import { AuthInfo } from '../../common/auth'
import { StatusListService } from '../../revocation/status-list/status-list.service'
import {
  TokenStatus,
  TokenStatusListService,
  TokenStatusListSignerIdentity,
} from '../../revocation/token-status-list/token-status-list.service'
import { CredentialIssuanceMetadata } from '../../utils/oid4vc'

import {
  GetIssuanceSessionByQueryDto,
  OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions,
  OpenId4VcIssuanceSessionRecordDto,
  OpenId4VcIssuanceSessionsCreateOfferDto,
  OpenId4VcIssuanceSessionsCreateOfferResponse,
} from './dto'
import { IssuanceSessionRevocation } from './dto/issuance-session.dto'

@Injectable()
export class OpenId4VcIssuanceSessionService {
  public constructor(
    @Inject(AgentConfig.KEY) private readonly agencyConfig: ConfigType<typeof AgentConfig>,
    private readonly statusListService: StatusListService,
    private readonly tokenStatusListService: TokenStatusListService,
    @InjectLogger(OpenId4VcIssuanceSessionService)
    private readonly logger: Logger,
  ) {}

  public async offer(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: OpenId4VcIssuanceSessionsCreateOfferDto,
  ): Promise<OpenId4VcIssuanceSessionsCreateOfferResponse> {
    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(req.publicIssuerId)

    // TODO: It is better to we move setting credential status to `credentialRequestToCredentialMapper`
    //  to change status list when credential really requested but how??
    // Only W3C VCs use the W3C bitstring list; SD-JWT VCs use IETF token status lists (below)
    const statusList = req.credentials.some((credential) => isW3cFormat(credential.format))
      ? await this.statusListService.getOrCreate(authInfo, req.publicIssuerId)
      : undefined
    let credentialIndex = statusList?.lastIndex ?? 0
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

      // The DTO rejects these too; repeated here for internal callers (issuance templates) that skip DTO validation
      if (credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc) assertNoStatusClaim(credential)

      // MsoMdoc uses X.509 certificates, not DIDs — skip DID resolution
      let issuerDidUrl: string | undefined
      if (credential.format !== OpenId4VciCredentialFormatProfile.MsoMdoc) {
        const issuerCredential = credential as { issuer: { did: string } }
        const { didDocument } = await tenantAgent.dids.resolve(issuerCredential.issuer.did)
        if (!didDocument || !didDocument.verificationMethod?.length) {
          throw new UnprocessableEntityException(
            `Unable to resolve signing key for DID: ${issuerCredential.issuer.did}`,
          )
        }
        issuerDidUrl = didDocument.verificationMethod[0].id
      }

      let credentialStatus: CredentialIssuanceMetadata['credentialStatus']

      // mso_mdoc does not support revocation
      if (statusList && isW3cFormat(credential.format)) {
        // Assign the current free index (0-based), then advance
        // This keeps issued indexes within [0, size), consistent with capacity guard and per-index bound in StatusListService
        credentialIndexes.push(credentialIndex)
        credentialStatus = {
          location: this.statusListService.location(statusList.id),
          index: credentialIndex,
        }
        credentialIndex += 1
      } else if (credential.format === OpenId4VciCredentialFormatProfile.SdJwtVc && issuerDidUrl) {
        const signer = await this.resolveSdJwtSigningIdentity(tenantAgent, issuerDidUrl)
        // One entry per credential the wallet may request in a batch. The entries are reserved before the offer
        // exists: if creating the offer fails, they stay allocated and unused, which only costs list capacity.
        const reference = await this.tokenStatusListService.reserveIndexes(
          tenantAgent.context,
          authInfo,
          signer,
          issuer.batchCredentialIssuance?.batchSize ?? 1,
        )
        credentialStatus = {
          type: 'token-status-list',
          location: reference.uri,
          index: reference.indexes[0],
          indexes: reference.indexes,
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
          payload: (credential as { payload?: SdJwtVcPayload }).payload,
        }
      }

      mappedCredentials.push(credentialIssuanceMeta)
    }

    // Preflight status list capacity check before the offer is created
    if (statusList && credentialIndexes.length) {
      this.statusListService.assertHasFreeIndexes(statusList, credentialIndexes.length)
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

    if (statusList && credentialIndexes.length) {
      await this.statusListService.addItems(authInfo, statusList.id, credentialIndexes)
    }

    // Entries were just reserved, so they are all valid: no need to read the lists back
    const revocable = tokenStatusListEntriesOf(mappedCredentials).length > 0
    return {
      issuanceSession: OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(
        issuanceSession,
        revocable ? { revocable, revoked: false } : { revocable },
      ),
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

    const revocation = await this.revocationOf(tenantAgent, issuanceSessions)
    return issuanceSessions.map((session) =>
      OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(session, revocation.get(session.id)),
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

    const revocation = await this.revocationOf(tenantAgent, [issuanceSession])
    return OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(
      issuanceSession,
      revocation.get(issuanceSession.id),
    )
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
    let issuanceSession
    try {
      issuanceSession = await tenantAgent.openid4vc.issuer.getIssuanceSessionById(issuanceSessionId)
    } catch (error) {
      // Credo's RecordNotFoundError would otherwise surface as a 500
      if (error instanceof RecordNotFoundError) throw new NotFoundException('Issuance session not found')
      throw error
    }

    const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[] | undefined

    // SD-JWT VCs: every entry of the session (a batch holds one entry per holder key) is revoked together
    const tokenStatusEntries = tokenStatusListEntriesOf(credentials)
    if (tokenStatusEntries.length) {
      // One transaction over all of the session's lists: the "already revoked" check and the update share the
      // lists' row locks, so of concurrent revokes exactly one changes anything; a missing list is a 404.
      const changed = await this.tokenStatusListService.setEntryStatuses(
        tenantAgent.context,
        tokenStatusEntries,
        TokenStatus.Invalid,
      )
      if (!changed) throw new ConflictException('Credential is already revoked')
      return
    }

    const credential = credentials?.[0]
    if (!credential?.credentialStatus) throw new BadRequestException('Credential format does not support revocation')

    const statusListId = credential.credentialStatus.location.split('/')?.pop()
    if (!statusListId) throw new BadRequestException('Credential format does not support revocation')

    await this.statusListService.updateItems(authInfo, statusListId, {
      indexes: [credential.credentialStatus.index],
      revoked: true,
    })
  }

  /**
   * `revocable` / `revoked` of each session, read from the token status lists with one query. Sessions without
   * token status list entries (W3C VCs, mDoc, SD-JWT VCs issued before status lists) are not revocable. A failed
   * read does not fail the request: the sessions stay revocable with an unknown `revoked`.
   */
  private async revocationOf(
    tenantAgent: TenantAgent,
    sessions: OpenId4VcIssuanceSessionRecord[],
  ): Promise<Map<string, IssuanceSessionRevocation>> {
    const entriesBySession = new Map(
      sessions.map((session) => [
        session.id,
        tokenStatusListEntriesOf(session.issuanceMetadata?.credentials as CredentialIssuanceMetadata[] | undefined),
      ]),
    )
    const allEntries = [...entriesBySession.values()].flat()
    const result = new Map<string, IssuanceSessionRevocation>()

    let statuses: Map<string, number[]> | undefined
    if (allEntries.length) {
      try {
        statuses = await this.tokenStatusListService.getStatuses(tenantAgent.context, allEntries)
      } catch {
        const statusListIds = [...new Set(allEntries.map(({ id }) => id))]
        this.logger.warn({ statusListIds }, 'Could not read token status lists')
      }
    }

    // Statuses come back concatenated per list id, in the order of `allEntries`: index them by (list, entry)
    const statusOf = new Map<string, number>()
    if (statuses) {
      const offsets = new Map<string, number>()
      for (const { id, indexes } of allEntries) {
        const listStatuses = statuses.get(id)
        if (!listStatuses) continue
        const offset = offsets.get(id) ?? 0
        indexes.forEach((idx, position) => statusOf.set(`${id}#${idx}`, listStatuses[offset + position]))
        offsets.set(id, offset + indexes.length)
      }
    }

    for (const [sessionId, entries] of entriesBySession) {
      if (!entries.length) {
        result.set(sessionId, { revocable: false })
      } else if (!statuses) {
        result.set(sessionId, { revocable: true })
      } else if (entries.some(({ id }) => !statuses.has(id))) {
        result.set(sessionId, { revocable: false })
      } else {
        const revoked = entries.every(({ id, indexes }) =>
          indexes.every((idx) => statusOf.get(`${id}#${idx}`) === TokenStatus.Invalid),
        )
        result.set(sessionId, { revocable: true, revoked })
      }
    }
    return result
  }

  /**
   * The key Credo will sign this SD-JWT VC with, as the status-list signer: Credo verifies a status list with
   * the credential's issuer key only. Resolved exactly as Credo resolves it for signing
   * (`resolveSigningPublicJwkFromDidUrl`), legacy key id fallback included.
   */
  private async resolveSdJwtSigningIdentity(
    tenantAgent: TenantAgent,
    issuerDidUrl: string,
  ): Promise<TokenStatusListSignerIdentity> {
    let keyId: string
    try {
      const { publicJwk } = await tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord(issuerDidUrl)
      keyId = publicJwk.keyId
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw new UnprocessableEntityException('Issuer DID is not controlled by this wallet')
      }
      throw error
    }
    return { issuer: parseDid(issuerDidUrl).did, keyId, signer: { method: 'did', kid: issuerDidUrl } }
  }
}

/** `status` is the issuer's token status list reference: never user-supplied, never selectively disclosable. */
function assertNoStatusClaim(credential: OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions): void {
  if (credential.payload && Object.prototype.hasOwnProperty.call(credential.payload, 'status')) {
    throw new BadRequestException('`status` is set by the issuer')
  }
  if (credential.disclosureFrame?._sd?.includes('status')) {
    throw new BadRequestException('`status` is set by the issuer and cannot be selectively disclosed')
  }
}

function isW3cFormat(format: OpenId4VciCredentialFormatProfile): boolean {
  return (
    format === OpenId4VciCredentialFormatProfile.JwtVcJson ||
    format === OpenId4VciCredentialFormatProfile.JwtVcJsonLd ||
    format === OpenId4VciCredentialFormatProfile.LdpVc
  )
}

/** The token status list entries of a session's credentials, grouped by list id (the last segment of `location`). */
function tokenStatusListEntriesOf(
  credentials: CredentialIssuanceMetadata[] | undefined,
): Array<{ id: string; indexes: number[] }> {
  const byList = new Map<string, number[]>()
  for (const { credentialStatus } of credentials ?? []) {
    if (credentialStatus?.type !== 'token-status-list') continue
    const id = credentialStatus.location.split('/').pop()
    if (!id) continue
    const indexes = credentialStatus.indexes ?? [credentialStatus.index]
    byList.set(id, [...new Set([...(byList.get(id) ?? []), ...indexes])])
  }
  return [...byList].map(([id, indexes]) => ({ id, indexes }))
}
