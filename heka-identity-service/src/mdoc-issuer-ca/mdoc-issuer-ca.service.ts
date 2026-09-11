import type { AgentContext, GenericRecord } from '@credo-ts/core'

import { createHash } from 'node:crypto'

import { GenericRecordsApi, Kms, X509Api, X509Certificate, X509ExtendedKeyUsage, X509KeyUsage } from '@credo-ts/core'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import ExpressConfig from 'config/express'

import { IACA_MAX_VALIDITY_DAYS, resolveProfile } from './certificate-profiles'
import { buildEuDsc, buildEuIaca } from './eu-certificate-builder'
import { IACA_REGISTRY_RECORD_TYPE, readIacaRegistry } from './iaca-registry'
import { MdocDsc, MdocIaca, ProvisionIacaOptions } from './mdoc-issuer-ca.types'
import { TrustListService } from './trust-list.service'

const IACA_RECORD_TYPE = 'mdoc-iaca'
const DSC_RECORD_TYPE = 'mdoc-dsc'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// Back-date notBefore to tolerate clock skew between issuer and holder.
const CLOCK_SKEW_MS = 5 * 60 * 1000
// Reissue the DSC this long before it expires so the mapper always signs with a valid leaf.
const DSC_RENEW_BEFORE_MS = 30 * MS_PER_DAY
// Validity windows now live on the certificate profile (see certificate-profiles.ts).

const NOT_PROVISIONED_MESSAGE =
  'No mdoc issuer is provisioned for this tenant. Provision one via POST /mdoc-issuers ' +
  '(or re-run prepare-wallet) before issuing mso_mdoc credentials.'

const EU_ORGANIZATION_IDENTIFIER_REQUIRED_MESSAGE =
  'The EU/EUDI mdoc issuer profile requires an organizationIdentifier (EN 319 412-1, e.g. `VATDE-…`). ' +
  'Set MDOC_ISSUER_ORGANIZATION_IDENTIFIER or pass `organizationIdentifier` when provisioning.'

const EU_CERTIFICATE_POLICY_REQUIRED_MESSAGE =
  'The EU/EUDI mdoc issuer profile requires a certificate-policy OID (EN 319 412-2 §4.3.3: certificatePolicies ' +
  'is mandatory on sign/seal certificates). Set MDOC_ISSUER_CERTIFICATE_POLICY_OID or pass `certificatePolicyOid` ' +
  'when provisioning.'

type StoredIaca = Omit<MdocIaca, 'id'>
type StoredDsc = Omit<MdocDsc, 'id'>

/**
 * Provisions and loads each tenant's mdoc (ISO 18013-5) issuer PKI: a self-signed **IACA** trust
 * anchor that signs short-lived **DSCs**, and the current DSC used to sign every issued MSO.
 *
 * Keys live in the tenant's Askar store; the IACA signs the DSC inside the tenant agent (the
 * cross-key pattern from `X509SignerService.issueCaSignedLeaf`). The public IACA cert is mirrored to
 * the global store so the VICAL builder can aggregate across the isolated tenant stores.
 *
 * The OpenID4VCI credential mapper reaches {@link loadCurrentDsc} per request (it has only an
 * `AgentContext`), so every method here is keyed on `AgentContext` rather than a `TenantAgent` —
 * controllers/services pass `tenantAgent.context`.
 */
@Injectable()
export class MdocIssuerCaService {
  // Serializes the "load-or-reissue current DSC" critical section per tenant so two concurrent
  // issuance requests near expiry (or on first issuance) don't both mint a DSC. Keyed by context id.
  private readonly dscLocks = new Map<string, Promise<MdocDsc>>()

  // The global (agency) agent holds the cross-tenant IACA registry — distinct from any tenant store.
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly trustListService: TrustListService,
    @Inject(ExpressConfig.KEY)
    private readonly appConfig: ConfigType<typeof ExpressConfig>,
  ) {}

  /**
   * Public download URL of a registered IACA certificate — the AIA `id-ad-caIssuers` location carried by
   * EU-profile DSCs (ETSI TS 119 412-6 PID-4.4.3). Served by `IacaCertificatePublicController`.
   */
  public iacaCertificateLocation(fingerprint: string): string {
    return `${this.appConfig.appEndpoint}/mdoc-issuers/certificates/${fingerprint}`
  }

  /** The DER of the registered (public) IACA certificate with this SHA-256 fingerprint, or null. */
  public async findRegisteredIacaCertificate(fingerprint: string): Promise<Uint8Array | null> {
    const wanted = fingerprint.toLowerCase()
    for (const entry of await readIacaRegistry(this.agent)) {
      const der = Buffer.from(entry.certificateBase64, 'base64')
      const entryFingerprint = (entry.fingerprint ?? createHash('sha256').update(der).digest('hex')).toLowerCase()
      if (entryFingerprint === wanted) return Uint8Array.from(der)
    }
    return null
  }

  /**
   * Find-or-create the tenant's single IACA (idempotent). Mints a P-256 key + self-signed CA
   * certificate in the tenant store and mirrors the public cert to the global registry. NOTE:
   * find-or-create is not atomic — concurrent first-time provisions could race; acceptable for an
   * infrequent admin / prepare-wallet action (mirrors `X509SignerService.ensureServiceRootCa`).
   */
  public async provisionIaca(agentContext: AgentContext, options: ProvisionIacaOptions = {}): Promise<MdocIaca> {
    const existing = await this.findIacaRecord(agentContext)
    if (existing) {
      return this.toIaca(existing)
    }

    const profile = resolveProfile(options.profile ?? this.agent.agencyConfig.mdocIssuerProfile)
    const country = options.country ?? this.agent.agencyConfig.mdocIssuerCountry
    const authorityName = options.authorityName ?? this.agent.agencyConfig.mdocIssuerAuthority
    const docType = options.docType ?? this.agent.agencyConfig.mdocDefaultDocType
    const organizationIdentifier =
      options.organizationIdentifier ?? this.agent.agencyConfig.mdocIssuerOrganizationIdentifier
    const certificatePolicyOid = options.certificatePolicyOid ?? this.agent.agencyConfig.mdocIssuerCertificatePolicyOid
    const commonName = options.commonName ?? `${authorityName} ${profile.credentialLabel} IACA`
    const validityDays = options.validityDays ?? profile.iacaValidityDays
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > IACA_MAX_VALIDITY_DAYS) {
      throw new BadRequestException(
        `IACA validityDays must be a whole number of days between 1 and ${IACA_MAX_VALIDITY_DAYS} (ISO 18013-5 / AAMVA cap)`,
      )
    }

    const kms = agentContext.resolve(Kms.KeyManagementApi)
    const key = await kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const publicJwk = Kms.PublicJwk.fromPublicJwk(key.publicJwk)

    const now = Date.now()
    const notBefore = new Date(now - CLOCK_SKEW_MS)
    const notAfter = new Date(now + validityDays * MS_PER_DAY)

    let certificate: X509Certificate
    if (profile.ecosystem === 'eu') {
      // EU profile: the @peculiar/x509 escape hatch — Credo's X509Api cannot emit the EN 319 412-1
      // organizationIdentifier DN attribute. See eu-certificate-builder.ts.
      if (!organizationIdentifier) {
        throw new BadRequestException(EU_ORGANIZATION_IDENTIFIER_REQUIRED_MESSAGE)
      }
      if (profile.requiresCertificatePolicies && !certificatePolicyOid) {
        throw new BadRequestException(EU_CERTIFICATE_POLICY_REQUIRED_MESSAGE)
      }
      certificate = await buildEuIaca(agentContext, {
        authorityKey: publicJwk,
        keyId: key.keyId,
        dn: { commonName, countryName: country, organizationName: authorityName, organizationIdentifier },
        notBefore,
        notAfter,
      })
    } else {
      // mDL profile: shipped Credo path, unchanged.
      const x509 = agentContext.resolve(X509Api)
      certificate = await x509.createCertificate({
        authorityKey: publicJwk, // self-signed: subjectPublicKey omitted
        issuer: { commonName, countryName: country, organizationalUnit: authorityName },
        validity: { notBefore, notAfter },
        extensions: {
          basicConstraints: { ca: true, pathLenConstraint: 0, markAsCritical: true },
          keyUsage: { usages: [X509KeyUsage.KeyCertSign, X509KeyUsage.CrlSign], markAsCritical: true },
          subjectKeyIdentifier: { include: true },
        },
      })
      certificate.keyId = key.keyId
    }

    const content: StoredIaca = {
      keyId: key.keyId,
      certificateBase64: certificate.toString('base64'),
      fingerprint: await certificate.getThumbprintInHex(agentContext),
      commonName,
      country,
      authorityName,
      docType,
      profile: profile.name,
      organizationIdentifier: organizationIdentifier || undefined,
      certificatePolicyOid: profile.ecosystem === 'eu' && certificatePolicyOid ? certificatePolicyOid : undefined,
      createdAt: new Date(now).toISOString(),
      notAfter: notAfter.toISOString(),
    }

    const record = await this.records(agentContext).save({
      content: { ...content },
      tags: { recordType: IACA_RECORD_TYPE },
    })

    await this.mirrorIacaToRegistry(agentContext, content)
    // A new tenant anchor changed the trust list — rebuild the VICAL on the next fetch.
    this.trustListService.invalidate()
    return { id: record.id, ...content }
  }

  /**
   * The tenant's IACA, or a **400** when none is provisioned — the single require-provisioning guard
   * (and error message) shared by the issuance path here and offer-time fail-fast checks.
   */
  public async requireProvisioned(agentContext: AgentContext): Promise<MdocIaca> {
    const record = await this.findIacaRecord(agentContext)
    if (!record) {
      throw new BadRequestException(NOT_PROVISIONED_MESSAGE)
    }
    return this.toIaca(record)
  }

  /**
   * Issue a fresh DSC signed by the tenant IACA and mark it current (retaining prior DSCs — mdocs
   * already issued embed their DSC in the MSO `x5chain`, and the IACA stays the anchor). Throws a
   * 400 when the tenant has no IACA (no silent mint). Also the explicit "rotate DSC" operation.
   */
  public async issueDsc(agentContext: AgentContext): Promise<MdocDsc> {
    const iaca = await this.requireProvisioned(agentContext)
    const profile = resolveProfile(iaca.profile)

    const iacaCertificate = X509Certificate.fromEncodedCertificate(iaca.certificateBase64)
    iacaCertificate.keyId = iaca.keyId // bind the IACA key so it can sign the DSC

    const kms = agentContext.resolve(Kms.KeyManagementApi)
    const key = await kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const subjectPublicKey = Kms.PublicJwk.fromPublicJwk(key.publicJwk)

    const now = Date.now()
    const notBefore = new Date(now - CLOCK_SKEW_MS)
    const notAfter = new Date(now + profile.dscValidityDays * MS_PER_DAY)

    let certificate: X509Certificate
    if (profile.ecosystem === 'eu') {
      // EU profile: the @peculiar/x509 escape hatch — ETSI TS 119 412-6 sign/seal certificate: EN 319 412-3
      // legal-person DN, certificatePolicies, QcType (PID), AIA caIssuers → the public IACA download.
      const certificatePolicyOid = iaca.certificatePolicyOid ?? this.agent.agencyConfig.mdocIssuerCertificatePolicyOid
      if (profile.requiresCertificatePolicies && !certificatePolicyOid) {
        throw new BadRequestException(EU_CERTIFICATE_POLICY_REQUIRED_MESSAGE)
      }
      const dn = {
        countryName: iaca.country,
        organizationName: iaca.authorityName,
        organizationIdentifier: iaca.organizationIdentifier,
      }
      certificate = await buildEuDsc(agentContext, {
        authorityKey: iacaCertificate.publicJwk, // IACA key signs (carries its keyId)
        subjectPublicKey, // the DSC key is the subject; its private key never signs here
        subjectKeyId: key.keyId,
        issuerDn: { ...dn, commonName: iaca.commonName },
        subjectDn: { ...dn, commonName: `${iaca.authorityName} ${profile.credentialLabel} DSC` },
        notBefore,
        notAfter,
        extendedKeyUsage: profile.dscExtendedKeyUsage,
        certificatePolicyOids: certificatePolicyOid ? [certificatePolicyOid] : undefined,
        qcTypes: profile.dscQcTypes,
        authorityInfoAccessCaIssuers: profile.requiresAuthorityInformationAccess
          ? this.iacaCertificateLocation(iaca.fingerprint)
          : undefined,
      })
    } else {
      // mDL profile: shipped Credo path, unchanged.
      const x509 = agentContext.resolve(X509Api)
      certificate = await x509.createCertificate({
        authorityKey: iacaCertificate.publicJwk, // IACA key signs (carries its keyId)
        subjectPublicKey, // the DSC key is the subject; its private key never signs here
        issuer: { commonName: iaca.commonName, countryName: iaca.country, organizationalUnit: iaca.authorityName },
        subject: { commonName: `${iaca.authorityName} mDL DSC`, countryName: iaca.country },
        validity: { notBefore, notAfter },
        extensions: {
          // ISO 18013-5 Annex B DSC profile: digitalSignature + the mDL signing EKU, AKI→IACA SKI.
          // basicConstraints is intentionally omitted (end-entity certificate).
          keyUsage: { usages: [X509KeyUsage.DigitalSignature], markAsCritical: true },
          extendedKeyUsage: { usages: [X509ExtendedKeyUsage.MdlDs], markAsCritical: true },
          authorityKeyIdentifier: { include: true },
          subjectKeyIdentifier: { include: true },
        },
      })
      certificate.keyId = key.keyId
    }

    await this.clearCurrentDsc(agentContext)
    const content: StoredDsc = {
      keyId: key.keyId,
      certificateBase64: certificate.toString('base64'),
      fingerprint: await certificate.getThumbprintInHex(agentContext),
      iacaId: iaca.id,
      isCurrent: true,
      createdAt: new Date(now).toISOString(),
      notAfter: notAfter.toISOString(),
    }
    const record = await this.records(agentContext).save({
      content: { ...content },
      tags: { recordType: DSC_RECORD_TYPE, isCurrent: 'true' },
    })
    return { id: record.id, ...content }
  }

  /**
   * Provision-then-ensure: idempotently create the IACA and make sure a current, valid DSC exists.
   * Called from `prepare-wallet` so every prepared tenant gets an mdoc issuer identity, mirroring how
   * the main did:key is created. Safe to call repeatedly.
   */
  public async ensure(agentContext: AgentContext): Promise<{ iaca: MdocIaca; dsc: MdocDsc }> {
    const iaca = await this.provisionIaca(agentContext)
    const dsc = await this.ensureCurrentDsc(agentContext)
    return { iaca, dsc }
  }

  /**
   * Load the current DSC ready to sign an MSO: its KMS keyId is re-attached (parsing does not restore
   * it). Auto-issues the DSC when missing or near expiry. Throws a 400 when no IACA is provisioned —
   * this is the require-provisioning guard reached from the OpenID4VCI credential mapper.
   */
  public async loadCurrentDsc(agentContext: AgentContext): Promise<X509Certificate> {
    const dsc = await this.ensureCurrentDsc(agentContext)
    const certificate = X509Certificate.fromEncodedCertificate(dsc.certificateBase64)
    certificate.keyId = dsc.keyId
    return certificate
  }

  /** The tenant's IACA, or null when none is provisioned. */
  public async getIaca(agentContext: AgentContext): Promise<MdocIaca | null> {
    const record = await this.findIacaRecord(agentContext)
    return record ? this.toIaca(record) : null
  }

  /** The tenant's DSCs (current first), with the current one flagged. */
  public async listDsc(agentContext: AgentContext): Promise<MdocDsc[]> {
    const records = await this.records(agentContext).findAllByQuery({ recordType: DSC_RECORD_TYPE })
    return records.map((record) => this.toDsc(record)).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
  }

  /**
   * Ensure a current, valid DSC exists and return its stored data, serializing per tenant so
   * concurrent issuance requests don't double-mint. Callers parse their own `X509Certificate` from
   * the returned data so no mutable certificate instance is shared across requests.
   */
  private ensureCurrentDsc(agentContext: AgentContext): Promise<MdocDsc> {
    const lockKey = agentContext.contextCorrelationId
    const inFlight = this.dscLocks.get(lockKey)
    if (inFlight) {
      return inFlight
    }
    const operation = this.resolveCurrentDsc(agentContext).finally(() => this.dscLocks.delete(lockKey))
    this.dscLocks.set(lockKey, operation)
    return operation
  }

  private async resolveCurrentDsc(agentContext: AgentContext): Promise<MdocDsc> {
    await this.requireProvisioned(agentContext)
    const currentRecord = await this.findCurrentDscRecord(agentContext)
    if (currentRecord) {
      const dsc = this.toDsc(currentRecord)
      if (!this.needsRenewal(dsc)) {
        return dsc
      }
    }
    return this.issueDsc(agentContext)
  }

  private needsRenewal(dsc: MdocDsc): boolean {
    return new Date(dsc.notAfter).getTime() - Date.now() <= DSC_RENEW_BEFORE_MS
  }

  /**
   * Mirror the tenant's public IACA cert to the global registry (keyed by context id), so the VICAL
   * builder can enumerate per-tenant anchors across isolated tenant stores. Keys never leave the
   * tenant store — only the public certificate is copied.
   */
  private async mirrorIacaToRegistry(agentContext: AgentContext, iaca: StoredIaca): Promise<void> {
    const tenantContextId = agentContext.contextCorrelationId
    const content = {
      tenantContextId,
      certificateBase64: iaca.certificateBase64,
      fingerprint: iaca.fingerprint,
      commonName: iaca.commonName,
      country: iaca.country,
      authorityName: iaca.authorityName,
      docType: iaca.docType,
      notAfter: iaca.notAfter,
    }
    const existing = (
      await this.agent.genericRecords.findAllByQuery({
        recordType: IACA_REGISTRY_RECORD_TYPE,
        tenantContextId,
      })
    )[0]
    if (existing) {
      existing.content = { ...content }
      await this.agent.genericRecords.update(existing)
    } else {
      await this.agent.genericRecords.save({
        content: { ...content },
        tags: { recordType: IACA_REGISTRY_RECORD_TYPE, tenantContextId },
      })
    }
  }

  private async findIacaRecord(agentContext: AgentContext): Promise<GenericRecord | null> {
    const records = await this.records(agentContext).findAllByQuery({ recordType: IACA_RECORD_TYPE })
    return records[0] ?? null
  }

  private async findCurrentDscRecord(agentContext: AgentContext): Promise<GenericRecord | null> {
    const records = await this.records(agentContext).findAllByQuery({
      recordType: DSC_RECORD_TYPE,
      isCurrent: 'true',
    })
    return records[0] ?? null
  }

  private async clearCurrentDsc(agentContext: AgentContext): Promise<void> {
    const records = await this.records(agentContext).findAllByQuery({
      recordType: DSC_RECORD_TYPE,
      isCurrent: 'true',
    })
    for (const record of records) {
      record.content = { ...record.content, isCurrent: false }
      record.setTag('isCurrent', 'false')
      await this.records(agentContext).update(record)
    }
  }

  private records(agentContext: AgentContext): GenericRecordsApi {
    return agentContext.resolve(GenericRecordsApi)
  }

  private toIaca(record: GenericRecord): MdocIaca {
    return { id: record.id, ...(record.content as unknown as StoredIaca) }
  }

  private toDsc(record: GenericRecord): MdocDsc {
    return { id: record.id, ...(record.content as unknown as StoredDsc) }
  }
}
