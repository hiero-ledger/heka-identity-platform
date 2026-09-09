import type { GenericRecord } from '@credo-ts/core'

import { X509Certificate } from '@credo-ts/core'
import { Inject, Injectable } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { ManagedCertificateService } from 'x509-signing'

import { MdocIaca } from './mdoc-issuer-ca.types'
import { buildSignedVical, VicalCertificateInfo } from './vical/vical'

const VICAL_SIGNER_RECORD_TYPE = 'mdoc-vical-signer'
const IACA_REGISTRY_RECORD_TYPE = 'mdoc-iaca-registry'
const VICAL_SIGNER_COMMON_NAME = 'Heka VICAL Signer'
const VICAL_VERSION = '1.0'
const MS_PER_DAY = 24 * 60 * 60 * 1000
// The VICAL is re-signed/refreshed weekly; wallets refresh on this cadence.
const VICAL_NEXT_UPDATE_DAYS = 7
// ISO 18013-5 Annex C Table C.2 caps the ML signer cert at ≤39 months; a year is a safe dev default.
const VICAL_SIGNER_VALIDITY_DAYS = 365

/** Registry entry written by MdocIssuerCaService (the public IACA mirror). */
type StoredIacaRegistryEntry = Pick<MdocIaca, 'certificateBase64' | 'authorityName' | 'country' | 'docType'> & {
  tenantContextId: string
}

/**
 * Content of the VICAL-signer record. The certificate fields are written/renewed by
 * {@link ManagedCertificateService}; `issueID` is this service's own counter, stored alongside them
 * (preserved across renewals by the provider's content-spread).
 */
type StoredVicalSigner = {
  keyId: string
  certificateBase64: string
  rootCertificateBase64: string
  issueID?: number
  createdAt: string
  notAfter: string
}

function serialNumberToBigInt(serialNumber: string): bigint {
  const hex = serialNumber.startsWith('0x') ? serialNumber.slice(2) : serialNumber
  return /^[0-9a-fA-F]+$/.test(hex) ? BigInt('0x' + hex) : BigInt(serialNumber)
}

function hexToBytes(hex?: string): Uint8Array {
  const clean = (hex ?? '').replace(/[^0-9a-fA-F]/g, '')
  return Uint8Array.from(Buffer.from(clean, 'hex'))
}

/**
 * Builds and serves the Heka **VICAL** (ISO 18013-5 trust list): a COSE_Sign1(ES256) over a CBOR list
 * of the per-tenant IACA certificates mirrored into the global `mdoc-iaca-registry`. Signed by a
 * service-wide VICAL-signer key whose certificate is a **leaf under the service root CA**, so
 * a wallet that trusts the one long-lived service root can verify the VICAL and learn every tenant IACA.
 *
 * Freshness: the signed VICAL is cached and rebuilt on demand when invalidated (a new IACA was
 * provisioned) or when the ~7-day `nextUpdate` window has passed.
 */
@Injectable()
export class TrustListService {
  private cached: { bytes: Uint8Array; expiresAtMs: number } | null = null
  private dirty = true
  private building: Promise<Uint8Array> | null = null

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly managedCertificateService: ManagedCertificateService,
  ) {}

  /** Mark the cached VICAL stale so the next {@link getVical} rebuilds it (called after a new IACA). */
  public invalidate(): void {
    this.dirty = true
  }

  /** The current signed VICAL (COSE_Sign1 CBOR bytes), rebuilt lazily when stale. */
  public async getVical(): Promise<Uint8Array> {
    if (this.cached && !this.dirty && Date.now() < this.cached.expiresAtMs) {
      return this.cached.bytes
    }
    if (this.building) {
      return this.building
    }
    this.building = this.rebuild().finally(() => {
      this.building = null
    })
    return this.building
  }

  /** The VICAL signer leaf + the service root it chains to (base64 DER), or null if not provisioned. */
  public async getVicalSignerCertificate(): Promise<{
    certificateBase64: string
    rootCertificateBase64: string
  } | null> {
    const record = (await this.agent.genericRecords.findAllByQuery({ recordType: VICAL_SIGNER_RECORD_TYPE }))[0]
    if (!record) return null
    const content = record.content as unknown as StoredVicalSigner
    return { certificateBase64: content.certificateBase64, rootCertificateBase64: content.rootCertificateBase64 }
  }

  private async rebuild(): Promise<Uint8Array> {
    this.dirty = false // optimistic — a concurrent invalidate() during the build re-marks it
    try {
      const bytes = await this.buildVical()
      this.cached = { bytes, expiresAtMs: Date.now() + VICAL_NEXT_UPDATE_DAYS * MS_PER_DAY }
      return bytes
    } catch (error) {
      this.dirty = true
      throw error
    }
  }

  private async buildVical(): Promise<Uint8Array> {
    const signer = await this.ensureVicalSigner()
    const issueID = await this.nextIssueId(signer.record)

    const entries = await this.agent.genericRecords.findAllByQuery({ recordType: IACA_REGISTRY_RECORD_TYPE })
    const certificateInfos = entries.map((entry) =>
      this.toCertificateInfo(entry.content as unknown as StoredIacaRegistryEntry),
    )

    const now = new Date()
    const nextUpdate = new Date(now.getTime() + VICAL_NEXT_UPDATE_DAYS * MS_PER_DAY)

    return buildSignedVical({
      vical: {
        version: VICAL_VERSION,
        vicalProvider: this.agent.agencyConfig.mdocIssuerAuthority,
        date: now.toISOString(),
        nextUpdate: nextUpdate.toISOString(),
        vicalIssueID: issueID,
        certificateInfos,
      },
      certificateChain: signer.chainDer,
      sign: async (data) => {
        const { signature } = await this.agent.kms.sign({ keyId: signer.keyId, algorithm: 'ES256', data })
        return signature
      },
    })
  }

  private toCertificateInfo(entry: StoredIacaRegistryEntry): VicalCertificateInfo {
    const certificate = X509Certificate.fromEncodedCertificate(entry.certificateBase64)
    return {
      certificateDer: certificate.rawCertificate,
      serialNumber: serialNumberToBigInt(certificate.data.serialNumber),
      ski: hexToBytes(certificate.subjectKeyIdentifier),
      docTypes: [entry.docType],
      issuingAuthority: entry.authorityName,
      issuingCountry: entry.country,
      notBefore: certificate.data.notBefore.toISOString(),
      notAfter: certificate.data.notAfter.toISOString(),
    }
  }

  /**
   * The service-wide VICAL signer (global store): a service-root-signed leaf managed (provisioned,
   * auto-renewed) by {@link ManagedCertificateService} under the global agent's root context.
   */
  private async ensureVicalSigner(): Promise<{ keyId: string; chainDer: Uint8Array[]; record: GenericRecord }> {
    const managed = await this.managedCertificateService.ensureCertificate(this.agent.context, {
      recordType: VICAL_SIGNER_RECORD_TYPE,
      commonName: VICAL_SIGNER_COMMON_NAME,
      validityDays: VICAL_SIGNER_VALIDITY_DAYS,
    })
    return {
      keyId: managed.keyId,
      chainDer: managed.chain.map((certificate) => certificate.rawCertificate),
      record: managed.record,
    }
  }

  private async nextIssueId(record: GenericRecord): Promise<number> {
    const content = record.content as unknown as StoredVicalSigner
    const next = (content.issueID ?? 0) + 1
    record.content = { ...record.content, issueID: next }
    await this.agent.genericRecords.update(record)
    return next
  }
}
