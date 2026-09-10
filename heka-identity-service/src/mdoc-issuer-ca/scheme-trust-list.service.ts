import type { GenericRecord } from '@credo-ts/core'
import type { TrustedEntity, TrustedEntityService } from '@owf/eudi-lote'

import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { assertValidLoTE, createLoTE, signLoTE } from '@owf/eudi-lote'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'
import { readSdJwtIssuerRegistry } from 'sdjwt-vc-issuer'
import { ManagedCertificateService, X509SignerService } from 'x509-signing'

import { parseConfiguredAnchors } from './certificate-list'
import { SchemeTrustListIndexDto } from './dto/scheme-trust-list.dto'
import { readIacaRegistry } from './iaca-registry'

/** The scheme lists this service publishes, one per entity role (mirrors the one-list-per-type EU model). */
export const SCHEME_LIST_IDS = ['eaa-providers', 'wrpac-providers'] as const
export type SchemeListId = (typeof SCHEME_LIST_IDS)[number]

/** Media type of a signed list (compact JWS, `typ: trustlist+jwt`). */
export const TRUST_LIST_MIME_TYPE = 'application/trustlist+jwt'

/**
 * ETSI TS 119 602 **EU service-type vocabulary** — reused verbatim so EUDI-aware consumers classify the
 * entries natively (an EAA issuer, an access-certificate authority).
 */
export const EU_SERVICE_TYPE = {
  eaaIssuance: 'http://uri.etsi.org/19602/SvcType/EAA/Issuance',
  wrpacIssuance: 'http://uri.etsi.org/19602/SvcType/WRPAC/Issuance',
} as const
const EU_TE_INFORMATION_URI_PREFIX: Record<SchemeListId, string> = {
  'eaa-providers': 'http://uri.etsi.org/19602/ListOfTrustedEntities/EAAProvider/',
  'wrpac-providers': 'http://uri.etsi.org/19602/ListOfTrustedEntities/WRPACProvider/',
}

/**
 * Heka **scheme identifiers**. This is a *scheme operator's* list (posture c — Heka vouching for its own
 * ecosystem), NOT a Commission list: the EU `LoTEType` / `StatusDeterminationApproach` /
 * `SchemeTypeCommunityRules` URIs are deliberately not claimed, only the EU service-type vocabulary is.
 */
export const HEKA_LOTE = {
  type: {
    'eaa-providers': 'https://heka.id/trust/lote/type/scheme-eaa-providers',
    'wrpac-providers': 'https://heka.id/trust/lote/type/scheme-wrpac-providers',
  } as Record<SchemeListId, string>,
  statusDeterminationApproach: 'https://heka.id/trust/lote/status-determination/listed-is-granted',
  schemeTypeCommunityRules: 'https://heka.id/trust/lote/scheme-rules',
  membershipExtension: 'https://heka.id/trust/lote/ext/scheme-membership',
} as const

/** Where an entry comes from — the provenance a consumer can show ("trusted via the Heka ecosystem"). */
export type SchemeMembershipOrigin = 'tenant' | 'partner' | 'operator'

/** `ServiceInformationExtensions[]` entry describing the scheme membership of a listed service. */
export interface SchemeMembershipExtension {
  type: typeof HEKA_LOTE.membershipExtension
  origin: SchemeMembershipOrigin
  /** Credential formats the listed certificate signs. */
  formats?: ('mso_mdoc' | 'dc+sd-jwt')[]
  /** mdoc doctypes the listed IACA is authoritative for. */
  docTypes?: string[]
}

const SIGNER_RECORD_TYPE = 'scheme-trust-list-signer'
const SIGNER_COMMON_NAME = 'Heka Scheme Trust List Signer'
const SIGNER_VALIDITY_DAYS = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000
// Lists are re-signed weekly at the latest (mirrors the VICAL cadence) and immediately when their content
// changes; well inside the 6-month maximum LoTE validity (ETSI TS 119 602).
const NEXT_UPDATE_DAYS = 7
// TS 119 612 §5.5.4 'granted' status URI, kept on the generic-profile entries (the EU profiles omit the
// status altogether — "listed is granted" — and our consumers accept both forms).
const GRANTED_STATUS_URI = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'
const LANG = 'en'

interface CachedList {
  jws: string
  contentKey: string
  expiresAtMs: number
}

interface TenantEntry {
  name: string
  country: string
  services: TrustedEntityService[]
}

/** Wrap base64 DER in PEM armor (the form `signLoTE`'s `certificates` option expects). */
function toPemCertificate(base64Der: string): string {
  return `-----BEGIN CERTIFICATE-----\n${base64Der}\n-----END CERTIFICATE-----`
}

/**
 * Publishes the **Heka scheme trust lists** — ETSI TS 119 602 LoTE JWTs (`typ: trustlist+jwt`, ES256,
 * `x5c` = a dedicated list-signer leaf under the service root CA) of the anchors **Heka is scheme
 * operator for**, one list per entity role:
 *
 *  - `eaa-providers` — the tenants' issuer certificates (mdoc IACAs from the IACA registry, SD-JWT VC
 *    issuer leaves from the SD-JWT issuer registry; one entity per tenant) plus the operator-curated
 *    partner anchors (`TRUST_LIST_PARTNER_CERTIFICATES`), all as `EAA/Issuance` services;
 *  - `wrpac-providers` — the service root CA as the scheme's access-certificate authority
 *    (`WRPAC/Issuance`): it anchors the verifiers' request-signing leaves and the issuers' stand-in
 *    access certificates.
 *
 * Nothing derived from an upstream (EU) list is ever republished — the wallet consumes those directly;
 * the `/trust-list` index only carries discovery **pointers** to them. Each entry carries a
 * {@link SchemeMembershipExtension} with its origin, so a consumer can display provenance.
 *
 * Freshness: a list is rebuilt when its content changes (registry / root / config) or when the weekly
 * window lapses, otherwise the cached JWS is served.
 */
@Injectable()
export class SchemeTrustListService {
  private readonly cache = new Map<SchemeListId, CachedList>()
  private readonly building = new Map<SchemeListId, Promise<string>>()

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly managedCertificateService: ManagedCertificateService,
    private readonly x509SignerService: X509SignerService,
    @InjectLogger(SchemeTrustListService) private readonly logger: Logger,
  ) {}

  /** The discovery index: the lists served here plus the configured external pointers. */
  public getIndex(): SchemeTrustListIndexDto {
    return {
      schemeOperator: this.agent.agencyConfig.trustListSchemeOperator,
      lists: SCHEME_LIST_IDS.map((id) => ({
        id,
        loteType: HEKA_LOTE.type[id],
        path: `/trust-list/${id}`,
        mimeType: TRUST_LIST_MIME_TYPE,
      })),
      pointers: this.agent.agencyConfig.trustListPointers,
    }
  }

  public isListId(value: string): value is SchemeListId {
    return (SCHEME_LIST_IDS as readonly string[]).includes(value)
  }

  /** The current signed LoTE JWT (compact JWS) of one scheme list. */
  public async getList(listId: string): Promise<string> {
    if (!this.isListId(listId)) {
      throw new NotFoundException(`Unknown trust list '${listId}' (available: ${SCHEME_LIST_IDS.join(', ')})`)
    }
    const entities = await this.collectEntities(listId)
    const contentKey = this.contentKey(entities)
    const cached = this.cache.get(listId)
    if (cached && cached.contentKey === contentKey && Date.now() < cached.expiresAtMs) {
      return cached.jws
    }
    const inFlight = this.building.get(listId)
    if (inFlight) return inFlight

    const build = this.build(listId, entities, contentKey).finally(() => {
      this.building.delete(listId)
    })
    this.building.set(listId, build)
    return build
  }

  private async build(listId: SchemeListId, entities: TrustedEntity[], contentKey: string): Promise<string> {
    const signer = await this.ensureSigner()
    const sequenceNumber = await this.nextSequenceNumber(signer.record, listId)
    const now = new Date()
    const operator = this.agent.agencyConfig.trustListSchemeOperator

    const lote = createLoTE(
      {
        LoTEType: HEKA_LOTE.type[listId],
        SchemeOperatorName: [{ lang: LANG, value: operator }],
        SchemeName: [{ lang: LANG, value: `${operator} scheme — ${listId}` }],
        StatusDeterminationApproach: HEKA_LOTE.statusDeterminationApproach,
        SchemeTypeCommunityRules: [{ lang: LANG, uriValue: HEKA_LOTE.schemeTypeCommunityRules }],
        LoTESequenceNumber: sequenceNumber,
        ListIssueDateTime: now.toISOString(),
        NextUpdate: new Date(now.getTime() + NEXT_UPDATE_DAYS * MS_PER_DAY).toISOString(),
      },
      entities,
    )
    // Never publish a list that does not validate against the TS 119 602 schema.
    assertValidLoTE(lote)

    const signed = await signLoTE({
      lote,
      keyId: signer.keyId,
      algorithm: 'ES256',
      certificates: signer.chainBase64.map(toPemCertificate), // x5c: [signer leaf, service root]
      signer: async (data) => {
        const { signature } = await this.agent.kms.sign({
          keyId: signer.keyId,
          algorithm: 'ES256',
          data: Buffer.from(data, 'utf8'),
        })
        return Buffer.from(signature).toString('base64url')
      },
    })

    this.cache.set(listId, { jws: signed.jws, contentKey, expiresAtMs: now.getTime() + NEXT_UPDATE_DAYS * MS_PER_DAY })
    this.logger.info({ listId, sequenceNumber, entities: entities.length }, 'Scheme trust list rebuilt')
    return signed.jws
  }

  // ── Entities ───────────────────────────────────────────────────────────────

  private async collectEntities(listId: SchemeListId): Promise<TrustedEntity[]> {
    return listId === 'eaa-providers' ? this.eaaProviderEntities() : this.wrpacProviderEntities()
  }

  /** One entity per tenant (IACA and/or SD-JWT issuer certificate) + one per curated partner anchor. */
  private async eaaProviderEntities(): Promise<TrustedEntity[]> {
    const defaultCountry = this.agent.agencyConfig.mdocIssuerCountry
    const byTenant = new Map<string, TenantEntry>()
    const tenantEntry = (tenantContextId: string, name: string, country: string): TenantEntry => {
      let entry = byTenant.get(tenantContextId)
      if (!entry) {
        entry = { name, country, services: [] }
        byTenant.set(tenantContextId, entry)
      }
      return entry
    }

    for (const iaca of await readIacaRegistry(this.agent)) {
      const entry = tenantEntry(iaca.tenantContextId ?? iaca.certificateBase64, iaca.authorityName, iaca.country)
      entry.services.push(
        this.service('mdoc issuer CA (IACA)', EU_SERVICE_TYPE.eaaIssuance, iaca.certificateBase64, {
          origin: 'tenant',
          formats: ['mso_mdoc'],
          docTypes: [iaca.docType],
        }),
      )
    }
    for (const issuer of await readSdJwtIssuerRegistry(this.agent)) {
      const entry = tenantEntry(issuer.tenantContextId, issuer.domain, defaultCountry)
      entry.services.push(
        this.service(`SD-JWT VC issuer (${issuer.domain})`, EU_SERVICE_TYPE.eaaIssuance, issuer.certificateBase64, {
          origin: 'tenant',
          formats: ['dc+sd-jwt'],
        }),
      )
    }

    const entities: TrustedEntity[] = [...byTenant.values()].map((entry) =>
      this.entity(entry.name, 'eaa-providers', entry.country, entry.services),
    )
    for (const certificate of parseConfiguredAnchors(this.agent.agencyConfig.trustListPartnerCertificates)) {
      entities.push(
        this.entity(certificate.data.subject || 'Partner issuer CA', 'eaa-providers', defaultCountry, [
          this.service('Partner issuer CA trust anchor', EU_SERVICE_TYPE.eaaIssuance, certificate.toString('base64'), {
            origin: 'partner',
          }),
        ]),
      )
    }
    return entities
  }

  /** The service root CA as the scheme's access-certificate authority (empty until the root exists). */
  private async wrpacProviderEntities(): Promise<TrustedEntity[]> {
    const root = await this.x509SignerService.getServiceRootCertificate()
    if (!root) return []
    const { trustListSchemeOperator, mdocIssuerCountry } = this.agent.agencyConfig
    return [
      this.entity(trustListSchemeOperator, 'wrpac-providers', mdocIssuerCountry, [
        this.service(
          'Access certificate authority (service root CA)',
          EU_SERVICE_TYPE.wrpacIssuance,
          root.certificateBase64,
          {
            origin: 'operator',
          },
        ),
      ]),
    ]
  }

  private entity(name: string, listId: SchemeListId, country: string, services: TrustedEntityService[]): TrustedEntity {
    return {
      TrustedEntityInformation: {
        TEName: [{ lang: LANG, value: name }],
        // Contact details are not part of the registries — empty arrays are the schema-valid "not provided".
        TEAddress: { TEPostalAddress: [], TEElectronicAddress: [] },
        // EU convention: <profile prefix><2-letter country code>.
        TEInformationURI: [{ lang: LANG, uriValue: `${EU_TE_INFORMATION_URI_PREFIX[listId]}${country.toUpperCase()}` }],
      },
      TrustedEntityServices: services,
    }
  }

  private service(
    name: string,
    serviceType: string,
    certificateBase64: string,
    membership: Omit<SchemeMembershipExtension, 'type'>,
  ): TrustedEntityService {
    const extension: SchemeMembershipExtension = { type: HEKA_LOTE.membershipExtension, ...membership }
    return {
      ServiceInformation: {
        ServiceName: [{ lang: LANG, value: name }],
        ServiceTypeIdentifier: serviceType,
        ServiceStatus: GRANTED_STATUS_URI,
        StatusStartingTime: new Date().toISOString(),
        ServiceDigitalIdentity: { X509Certificates: [{ val: certificateBase64 }] },
        ServiceInformationExtensions: [extension],
      },
    }
  }

  /** Stable key of a list's content (the certificates it vouches for), so unchanged content is served from cache. */
  private contentKey(entities: TrustedEntity[]): string {
    return entities
      .flatMap((entity) =>
        entity.TrustedEntityServices.flatMap((entityService) =>
          (entityService.ServiceInformation.ServiceDigitalIdentity.X509Certificates ?? []).map(
            (certificate) => `${entityService.ServiceInformation.ServiceTypeIdentifier ?? ''}|${certificate.val}`,
          ),
        ),
      )
      .sort()
      .join('\n')
  }

  // ── Signer ─────────────────────────────────────────────────────────────────

  /**
   * The service-wide list signer (global store): a service-root-signed leaf managed (provisioned,
   * auto-renewed) by {@link ManagedCertificateService} under the global agent's root context. The
   * backing record also carries the per-list LoTE sequence counters (preserved across renewals).
   */
  private async ensureSigner(): Promise<{ keyId: string; chainBase64: string[]; record: GenericRecord }> {
    const managed = await this.managedCertificateService.ensureCertificate(this.agent.context, {
      recordType: SIGNER_RECORD_TYPE,
      commonName: SIGNER_COMMON_NAME,
      validityDays: SIGNER_VALIDITY_DAYS,
    })
    return {
      keyId: managed.keyId,
      chainBase64: managed.chain.map((certificate) => certificate.toString('base64')),
      record: managed.record,
    }
  }

  /** Monotonic per-list `LoTESequenceNumber`, persisted on the signer record. */
  private async nextSequenceNumber(record: GenericRecord, listId: SchemeListId): Promise<number> {
    const content = record.content as { loteSequenceNumbers?: Partial<Record<SchemeListId, number>> }
    const next = (content.loteSequenceNumbers?.[listId] ?? 0) + 1
    record.content = { ...record.content, loteSequenceNumbers: { ...content.loteSequenceNumbers, [listId]: next } }
    await this.agent.genericRecords.update(record)
    return next
  }
}
