import type { AgentContext, GenericRecord } from '@credo-ts/core'

import { GenericRecordsApi, Kms, X509Certificate } from '@credo-ts/core'
import { Injectable } from '@nestjs/common'

import { InjectLogger, Logger } from 'common/logger'

import { X509SignerService } from './x509-signer.service'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// Reissue a managed certificate this long before it expires so consumers always sign with a valid leaf.
const DEFAULT_RENEW_BEFORE_MS = 30 * MS_PER_DAY

/** Declares a managed signing identity: where it is stored and what its certificate looks like. */
export interface ManagedCertificateProfile {
  /** GenericRecord `recordType` identifying this certificate identity within the store. */
  recordType: string
  /**
   * Extra tags that discriminate identities within the record type (e.g. `{ domain }`) — they extend
   * both the record query and the provisioning lock key. Omit for a single identity per store.
   */
  tags?: Record<string, string>
  commonName: string
  /** Optional dNSName SAN (HAIP iss-host binding). */
  sanDnsName?: string
  /** Certificate validity. Default: `X509SignerService`'s default (365 days). */
  validityDays?: number
  /** Renew this long before `notAfter`. Default: 30 days. */
  renewBeforeMs?: number
}

export interface ManagedCertificate {
  keyId: string
  /** The leaf with its KMS `keyId` bound — ready to sign. */
  certificate: X509Certificate
  root: X509Certificate
  /** `[leaf, root]` — the x5c / x5chain form. */
  chain: X509Certificate[]
  /** Backing record. Callers MAY persist extra content fields; they are preserved across renewals. */
  record: GenericRecord
}

/** The managed fields persisted in the backing GenericRecord (caller extras live alongside them). */
interface ManagedCertificateContent {
  keyId: string
  certificateBase64: string
  rootCertificateBase64: string
  commonName: string
  createdAt: string
  notAfter: string
}

/**
 * Shared lifecycle for **managed signing certificates**: a KMS P-256 key + a service-root-signed leaf,
 * persisted as a GenericRecord and returned as an `[leaf, root]` chain with the leaf's `keyId` bound.
 * Shared by every service-root-signed identity (SD-JWT VC issuer, OID4VCI access cert, VICAL and
 * scheme-trust-list signers).
 *
 * Lifecycle invariants:
 * - **Single record** per (store, recordType, tags). Renewal rotates the key + certificate **into the
 *   existing record** — never a second record — while preserving caller-owned extra content fields
 *   (e.g. the VICAL `issueID` counter). Superseded certificates need no retention: every consumer
 *   embeds its chain in the signed artifact (x5c / x5chain), so verification never looks them up.
 * - **Keys are never deleted on renewal**: token status lists and SD-JWT VC offers pinned to the old key
 *   keep signing with it.
 * - **Self-healing**: duplicate records (older releases renewed by inserting a new record) are resolved
 *   to the newest `notAfter`; stale ones are deleted and logged.
 *
 * Keyed on `AgentContext`: tenant callers pass their tenant context, service-wide callers the global
 * agent's root context (`agent.context`) — KMS and records are resolved from it either way.
 */
@Injectable()
export class ManagedCertificateService {
  // Serializes find-or-provision per (store, recordType, tags) so concurrent calls don't double-mint.
  private readonly locks = new Map<string, Promise<ManagedCertificate>>()

  public constructor(
    private readonly x509SignerService: X509SignerService,
    @InjectLogger(ManagedCertificateService) private readonly logger: Logger,
  ) {}

  /** Find-or-provision (and auto-renew) the managed signing certificate for `profile`. */
  public ensureCertificate(
    agentContext: AgentContext,
    profile: ManagedCertificateProfile,
  ): Promise<ManagedCertificate> {
    const lockKey = this.lockKey(agentContext, profile)
    const inFlight = this.locks.get(lockKey)
    if (inFlight) {
      return inFlight
    }
    const operation = this.resolveCertificate(agentContext, profile).finally(() => this.locks.delete(lockKey))
    this.locks.set(lockKey, operation)
    return operation
  }

  private lockKey(agentContext: AgentContext, profile: ManagedCertificateProfile): string {
    const tagKey = Object.entries(profile.tags ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
    return `${agentContext.contextCorrelationId}:${profile.recordType}:${tagKey}`
  }

  private async resolveCertificate(
    agentContext: AgentContext,
    profile: ManagedCertificateProfile,
  ): Promise<ManagedCertificate> {
    const existing = await this.findRecord(agentContext, profile)
    if (existing) {
      const content = existing.content as unknown as ManagedCertificateContent
      const renewBeforeMs = profile.renewBeforeMs ?? DEFAULT_RENEW_BEFORE_MS
      if (new Date(content.notAfter).getTime() - Date.now() > renewBeforeMs) {
        return this.toManagedCertificate(existing, content)
      }
    }
    return this.provision(agentContext, profile, existing)
  }

  private async provision(
    agentContext: AgentContext,
    profile: ManagedCertificateProfile,
    existing: GenericRecord | null,
  ): Promise<ManagedCertificate> {
    const kms = agentContext.resolve(Kms.KeyManagementApi)
    const key = await kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const subjectPublicKey = Kms.PublicJwk.fromPublicJwk(key.publicJwk)

    const { certificate, rootCertificateBase64 } = await this.x509SignerService.issueServiceRootSignedCertificate({
      subjectPublicKey, // the caller-store key is the subject; signed by the service root
      commonName: profile.commonName,
      sanDnsName: profile.sanDnsName,
      ...(profile.validityDays !== undefined ? { validityDays: profile.validityDays } : {}),
    })

    const content: ManagedCertificateContent = {
      keyId: key.keyId,
      certificateBase64: certificate.toString('base64'),
      rootCertificateBase64,
      commonName: profile.commonName,
      createdAt: new Date().toISOString(),
      notAfter: certificate.data.notAfter.toISOString(),
    }

    const records = this.records(agentContext)
    let record: GenericRecord
    if (existing) {
      // Renewal: rotate key + cert into the existing record (single-record invariant), preserving
      // caller-owned extra content fields.
      existing.content = { ...existing.content, ...profile.tags, ...content }
      await records.update(existing)
      record = existing
    } else {
      record = await records.save({
        content: { ...profile.tags, ...content },
        tags: { recordType: profile.recordType, ...profile.tags },
      })
    }
    return this.toManagedCertificate(record, content)
  }

  private async findRecord(
    agentContext: AgentContext,
    profile: ManagedCertificateProfile,
  ): Promise<GenericRecord | null> {
    const records = this.records(agentContext)
    const found = await records.findAllByQuery({ recordType: profile.recordType, ...profile.tags })
    if (found.length <= 1) {
      return found[0] ?? null
    }
    // Older releases renewed by inserting a new record; keep the newest, drop the rest.
    const sorted = [...found].sort((a, b) => this.notAfterMs(b) - this.notAfterMs(a))
    const [newest, ...stale] = sorted
    for (const record of stale) {
      await records.deleteById(record.id)
    }
    this.logger.warn(
      { recordType: profile.recordType, tags: profile.tags, removed: stale.length },
      `Removed ${stale.length} duplicate managed-certificate record(s) for ${profile.recordType}`,
    )
    return newest
  }

  private notAfterMs(record: GenericRecord): number {
    const notAfter = record.content.notAfter
    const ms = new Date(String(notAfter ?? '')).getTime()
    return Number.isNaN(ms) ? 0 : ms
  }

  private toManagedCertificate(record: GenericRecord, content: ManagedCertificateContent): ManagedCertificate {
    const certificate = X509Certificate.fromEncodedCertificate(content.certificateBase64)
    certificate.keyId = content.keyId // bind the KMS key so the consumer can sign with the leaf
    const root = X509Certificate.fromEncodedCertificate(content.rootCertificateBase64)
    return { keyId: content.keyId, certificate, root, chain: [certificate, root], record }
  }

  private records(agentContext: AgentContext): GenericRecordsApi {
    return agentContext.resolve(GenericRecordsApi)
  }
}
