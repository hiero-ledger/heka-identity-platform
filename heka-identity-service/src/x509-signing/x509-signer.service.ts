import { DidJwk, GenericRecord, JwkDidCreateOptions, Kms, X509Certificate, X509KeyUsage } from '@credo-ts/core'
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { Agent, AGENT_TOKEN, TenantAgent } from 'common/agent'

import {
  ProvisionX509SignerOptions,
  X509ClientIdPrefix,
  X509Signer,
  X509_SIGNER_MAX_VALIDITY_DAYS,
} from './x509-signer.types'

const RECORD_TYPE = 'x509-signer'
const ROOT_CA_RECORD_TYPE = 'x509-service-root-ca'
const ROOT_CA_COMMON_NAME = 'Heka Verifier Root CA'
const DEFAULT_VALIDITY_DAYS = 365
const ROOT_CA_VALIDITY_DAYS = 365 * 10
// Back-date notBefore to tolerate clock skew between verifier and holder.
const CLOCK_SKEW_MS = 5 * 60 * 1000
const MS_PER_DAY = 24 * 60 * 60 * 1000

type StoredSigner = Omit<X509Signer, 'id'>
type StoredRootCa = { keyId: string; certificateBase64: string; createdAt: string }

/**
 * Provisions and loads per-tenant X.509 signers.
 *
 * A fresh P-256 key is projected into both a signing certificate and a did:jwk that
 * share one KMS keyId. Identities are persisted in the tenant agent's `genericRecords` (Askar,
 * per-tenant). `x509_hash` identities are **self-signed** leaves the wallet pins directly;
 * `x509_san_dns` leaves are issued under the service-wide root CA (`private_ca`, default) or by an
 * external CA via the CSR/import flow (`csr`).
 */
@Injectable()
export class X509SignerService {
  // The global (agency) agent holds the service-wide root CA key — a service-level Askar store,
  // distinct from any tenant. Tenant `x509_san_dns` leaves are signed against it.
  public constructor(@Inject(AGENT_TOKEN) private readonly agent: Agent) {}

  public async provision(tenantAgent: TenantAgent, options: ProvisionX509SignerOptions = {}): Promise<X509Signer> {
    if (
      options.validityDays !== undefined &&
      (!Number.isInteger(options.validityDays) ||
        options.validityDays < 1 ||
        options.validityDays > X509_SIGNER_MAX_VALIDITY_DAYS)
    ) {
      throw new UnprocessableEntityException(
        `validityDays must be a whole number of days between 1 and ${X509_SIGNER_MAX_VALIDITY_DAYS}`,
      )
    }
    const clientIdPrefix: X509ClientIdPrefix = options.clientIdPrefix ?? 'x509_hash'
    const validityDays = options.validityDays ?? DEFAULT_VALIDITY_DAYS

    const key = await tenantAgent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const publicJwk = Kms.PublicJwk.fromPublicJwk(key.publicJwk)

    const now = Date.now()
    const notBefore = new Date(now - CLOCK_SKEW_MS)
    const notAfter = new Date(now + validityDays * MS_PER_DAY)

    const certificate = await this.createLeafCertificate({
      tenantAgent,
      clientIdPrefix,
      subjectPublicKey: publicJwk,
      options,
      notBefore,
      notAfter,
    })
    // The cert bytes don't carry the KMS key id; bind it to the TENANT key so Credo signs requests with it.
    certificate.keyId = key.keyId

    let did: string | undefined
    if (options.alsoCreateDid ?? true) {
      const didResult = await tenantAgent.dids.create<JwkDidCreateOptions>({
        method: 'jwk',
        options: { keyId: key.keyId },
      })
      if (didResult.didState.state === 'finished') {
        did = didResult.didState.did
      }
    }

    return this.persistSigner(tenantAgent, {
      certificate,
      keyId: key.keyId,
      clientIdPrefix,
      did,
      commonName: options.commonName,
      sanDnsName: options.sanDnsName,
      notAfter,
      makeDefault: options.makeDefault,
    })
  }

  /**
   * Create a CSR for a fresh tenant P-256 key — the external-CA alternative for x509_san_dns. The
   * caller submits the returned CSR to their CA, then mounts the signed leaf via
   * `importSignedCertificate` using the returned `keyId`.
   */
  public async createSigningCsr(
    tenantAgent: TenantAgent,
    options: { sanDnsName?: string; commonName?: string } = {},
  ): Promise<{ keyId: string; csrPem: string }> {
    const key = await tenantAgent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const subjectPublicKey = Kms.PublicJwk.fromPublicJwk(key.publicJwk)
    const csr = await tenantAgent.x509.createCertificateSigningRequest({
      subjectPublicKey,
      subject: { commonName: options.commonName ?? options.sanDnsName ?? 'Heka Verifier Request Signer' },
      extensions: {
        keyUsage: { usages: [X509KeyUsage.DigitalSignature], markAsCritical: true },
        ...(options.sanDnsName
          ? { subjectAlternativeName: { name: [{ type: 'dns', value: options.sanDnsName }] } }
          : {}),
      },
    })
    return { keyId: key.keyId, csrPem: csr.toString('pem') }
  }

  /**
   * Mount an externally-signed certificate for a key previously created via `createSigningCsr`, and
   * persist it as a signer. `certificate` is the signed leaf (PEM or base64 DER); its
   * public key must correspond to `keyId`. The wallet must trust the external CA root separately.
   */
  public async importSignedCertificate(
    tenantAgent: TenantAgent,
    {
      keyId,
      certificate,
      clientIdPrefix = 'x509_san_dns',
      sanDnsName,
      makeDefault,
    }: {
      keyId: string
      certificate: string
      clientIdPrefix?: X509ClientIdPrefix
      sanDnsName?: string
      makeDefault?: boolean
    },
  ): Promise<X509Signer> {
    const leaf = X509Certificate.fromEncodedCertificate(certificate)
    // The certificate must certify the tenant key it is being bound to: an unrelated leaf (someone
    // else's certificate, or one issued for a different CSR) would otherwise be presented as this
    // tenant's signer while every request is signed with `keyId`.
    const boundKey = await tenantAgent.kms.getPublicKey({ keyId })
    if (!boundKey || boundKey.kty === 'oct') {
      throw new BadRequestException(`No asymmetric key '${keyId}' exists in the tenant key store`)
    }
    if (!Kms.PublicJwk.fromPublicJwk(boundKey).equals(leaf.publicJwk)) {
      throw new BadRequestException(
        `The certificate's subject public key does not match key '${keyId}' (the CSR key it must certify)`,
      )
    }
    leaf.keyId = keyId
    return this.persistSigner(tenantAgent, {
      certificate: leaf,
      keyId,
      clientIdPrefix,
      sanDnsName: sanDnsName ?? leaf.sanDnsNames[0],
      notAfter: leaf.data.notAfter,
      makeDefault,
    })
  }

  /**
   * Load a signing certificate ready for use as an `x5c` request signer: the stored certificate is
   * parsed and its KMS keyId re-attached (`fromEncodedCertificate` does not restore it). Throws when
   * no matching identity has been provisioned — there is no silent provisioning. An explicit
   * `certificateId` must name one of the tenant's request-signing records: any other generic record
   * (an IACA, a DSC, an SD-JWT issuer certificate) is "not found", never signed with.
   */
  public async loadSigningCertificate(
    tenantAgent: TenantAgent,
    { clientIdPrefix, certificateId }: { clientIdPrefix: X509ClientIdPrefix; certificateId?: string },
  ): Promise<X509Certificate> {
    const content = certificateId
      ? (await this.requireSignerRecord(tenantAgent, certificateId)).content
      : ((await this.findDefaultRecord(tenantAgent, clientIdPrefix))?.content as unknown as StoredSigner | undefined)

    if (!content) {
      throw new UnprocessableEntityException(
        `No X.509 signer found for clientIdPrefix '${clientIdPrefix}'. Provision one first.`,
      )
    }

    const certificate = X509Certificate.fromEncodedCertificate(content.certificateBase64)
    certificate.keyId = content.keyId
    return certificate
  }

  /** List the tenant's provisioned signers. */
  public async list(tenantAgent: TenantAgent): Promise<X509Signer[]> {
    const records = await tenantAgent.genericRecords.findAllByQuery({ recordType: RECORD_TYPE })
    return records.map((record) => ({ id: record.id, ...(record.content as unknown as StoredSigner) }))
  }

  /** Get one signer by id. Throws NotFound when it is absent or not a signer record. */
  public async get(tenantAgent: TenantAgent, id: string): Promise<X509Signer> {
    const { record, content } = await this.requireSignerRecord(tenantAgent, id)
    return { id: record.id, ...content }
  }

  /**
   * Make this identity the default for its clientIdPrefix (clearing the previous default). The
   * per-clientIdPrefix default is what `loadSigningCertificate` falls back to when a request omits
   * a certificateId.
   */
  public async setDefault(tenantAgent: TenantAgent, id: string): Promise<X509Signer> {
    const { record, content } = await this.requireSignerRecord(tenantAgent, id)
    await this.clearDefault(tenantAgent, content.clientIdPrefix)
    record.content = { ...record.content, isDefault: true }
    record.setTag('isDefault', 'true')
    await tenantAgent.genericRecords.update(record)
    return { id: record.id, ...(record.content as unknown as StoredSigner) }
  }

  /**
   * Rotate a signer: reissue a fresh key + certificate carrying the same clientIdPrefix,
   * SAN, common name and did projection, inheriting the default flag, then retire the old record and
   * its KMS key. Returns the new identity — for `x509_hash` its new fingerprint must be pushed to the
   * wallet trust list in lockstep; for `x509_san_dns` (private CA / external CA) the leaf re-chains to
   * the same root, so no wallet change is needed. Rotating an external-CA identity
   * provisioned in `csr` mode is rejected (provision throws) — reissue via the CSR/import flow.
   */
  public async rotate(
    tenantAgent: TenantAgent,
    id: string,
    options: { validityDays?: number } = {},
  ): Promise<X509Signer> {
    const { record, content } = await this.requireSignerRecord(tenantAgent, id)
    const replacement = await this.provision(tenantAgent, {
      clientIdPrefix: content.clientIdPrefix,
      commonName: content.commonName,
      sanDnsName: content.sanDnsName,
      alsoCreateDid: Boolean(content.did),
      makeDefault: content.isDefault,
      validityDays: options.validityDays,
    })
    await this.deleteRecordAndKey(tenantAgent, record, content.keyId)
    return replacement
  }

  /** Delete a signer: remove its record and best-effort delete the backing KMS key. */
  public async delete(tenantAgent: TenantAgent, id: string): Promise<void> {
    const { record, content } = await this.requireSignerRecord(tenantAgent, id)
    await this.deleteRecordAndKey(tenantAgent, record, content.keyId)
  }

  /**
   * cert → did primitive: derive the did:jwk for a certificate's public key (the reverse of the
   * provisioning projection). The DID is usable for signing only if its key lives in this KMS.
   */
  public didFromCertificate(certificate: X509Certificate): string {
    return DidJwk.fromPublicJwk(certificate.publicJwk).did
  }

  /**
   * The service-wide root CA certificate (base64 DER) + hex fingerprint — register this as the
   * wallet's trust anchor for the x509_san_dns model. Returns null until the root is created (lazily,
   * on the first x509_san_dns provision).
   */
  public async getServiceRootCertificate(): Promise<{ certificateBase64: string; fingerprint: string } | null> {
    const record = (await this.agent.genericRecords.findAllByQuery({ recordType: ROOT_CA_RECORD_TYPE }))[0]
    if (!record) {
      return null
    }
    const content = record.content as unknown as StoredRootCa
    const certificate = X509Certificate.fromEncodedCertificate(content.certificateBase64)
    const fingerprint = await certificate.getThumbprintInHex(this.agent.context)
    return { certificateBase64: content.certificateBase64, fingerprint }
  }

  /**
   * Issue a certificate for `subjectPublicKey` signed by the service-wide root CA (global store) — a
   * generic service leaf distinct from the request-signing x509_san_dns leaves. Used by
   * `ManagedCertificateService` for every service-root-signed identity (VICAL and scheme-trust-list signers,
   * SD-JWT VC issuer, OID4VCI access certificate), so a wallet that trusts the one
   * long-lived service root can verify the VICAL.
   * Returns the leaf (keyId NOT attached — the caller owns the subject key) and the root cert
   * (base64 DER) for assembling an x5chain.
   */
  public async issueServiceRootSignedCertificate({
    subjectPublicKey,
    commonName,
    sanDnsName,
    validityDays = DEFAULT_VALIDITY_DAYS,
    keyUsages = [X509KeyUsage.DigitalSignature],
  }: {
    subjectPublicKey: Kms.PublicJwk
    commonName: string
    /** Optional SAN dNSName — set for HAIP SD-JWT VC x5c issuer leaves (iss host must match it). */
    sanDnsName?: string
    validityDays?: number
    keyUsages?: X509KeyUsage[]
  }): Promise<{ certificate: X509Certificate; rootCertificateBase64: string }> {
    const rootCa = await this.ensureServiceRootCa()
    const now = Date.now()
    const certificate = await this.agent.x509.createCertificate({
      authorityKey: rootCa.certificate.publicJwk, // signs with the root key (global/service store)
      subjectPublicKey, // the caller's key is the subject; its private key is not used to sign
      issuer: { commonName: ROOT_CA_COMMON_NAME, organizationalUnit: 'Heka' },
      subject: { commonName },
      validity: { notBefore: new Date(now - CLOCK_SKEW_MS), notAfter: new Date(now + validityDays * MS_PER_DAY) },
      extensions: {
        keyUsage: { usages: keyUsages, markAsCritical: true },
        basicConstraints: { ca: false },
        ...(sanDnsName ? { subjectAlternativeName: { name: [{ type: 'dns' as const, value: sanDnsName }] } } : {}),
        authorityKeyIdentifier: { include: true },
        subjectKeyIdentifier: { include: true },
      },
    })
    return { certificate, rootCertificateBase64: rootCa.certificateBase64 }
  }

  /**
   * Build the leaf certificate for a new signer, honoring X509_SAN_DNS_MODE for the
   * x509_san_dns prefix: `private_ca` (default) issues under the service root; `csr` rejects (use the
   * CSR endpoints). x509_hash is always a self-signed leaf.
   */
  private async createLeafCertificate({
    tenantAgent,
    clientIdPrefix,
    subjectPublicKey,
    options,
    notBefore,
    notAfter,
  }: {
    tenantAgent: TenantAgent
    clientIdPrefix: X509ClientIdPrefix
    subjectPublicKey: Kms.PublicJwk
    options: ProvisionX509SignerOptions
    notBefore: Date
    notAfter: Date
  }): Promise<X509Certificate> {
    if (clientIdPrefix === 'x509_san_dns') {
      const mode = this.agent.agencyConfig.x509SanDnsMode ?? 'private_ca'
      if (mode === 'csr') {
        throw new UnprocessableEntityException(
          'x509_san_dns is configured for an external CA (X509_SAN_DNS_MODE=csr); provision via ' +
            'POST /x509/signers/csr then /import',
        )
      }
      return this.issueRootSignedRequestSignerLeaf({ subjectPublicKey, options, notBefore, notAfter })
    }

    return tenantAgent.x509.createCertificate({
      authorityKey: subjectPublicKey,
      issuer: { commonName: options.commonName ?? 'Heka Verifier Request Signer' },
      validity: { notBefore, notAfter },
      extensions: {
        keyUsage: { usages: [X509KeyUsage.DigitalSignature], markAsCritical: true },
        ...(options.sanDnsName
          ? { subjectAlternativeName: { name: [{ type: 'dns', value: options.sanDnsName }] } }
          : {}),
      },
    })
  }

  /**
   * Persist a signer to the tenant's genericRecords: resolve default-per-prefix (clearing
   * any prior default), compute the fingerprint, and save. Shared by provision and import.
   */
  private async persistSigner(
    tenantAgent: TenantAgent,
    {
      certificate,
      keyId,
      clientIdPrefix,
      did,
      commonName,
      sanDnsName,
      notAfter,
      makeDefault,
    }: {
      certificate: X509Certificate
      keyId: string
      clientIdPrefix: X509ClientIdPrefix
      did?: string
      commonName?: string
      sanDnsName?: string
      notAfter: Date
      makeDefault?: boolean
    },
  ): Promise<X509Signer> {
    const isDefault = makeDefault ?? !(await this.findDefaultRecord(tenantAgent, clientIdPrefix))
    if (isDefault) {
      await this.clearDefault(tenantAgent, clientIdPrefix)
    }

    const fingerprint = await certificate.getThumbprintInHex(tenantAgent.context)
    const content: StoredSigner = {
      purpose: 'request-signing',
      clientIdPrefix,
      keyId,
      certificateBase64: certificate.toString('base64'),
      fingerprint,
      did,
      commonName,
      sanDnsName,
      isDefault,
      createdAt: new Date().toISOString(),
      notAfter: notAfter.toISOString(),
    }

    const record = await tenantAgent.genericRecords.save({
      content: { ...content },
      tags: {
        recordType: RECORD_TYPE,
        purpose: 'request-signing',
        clientIdPrefix,
        isDefault: isDefault ? 'true' : 'false',
      },
    })

    return { id: record.id, ...content }
  }

  /**
   * Issue a leaf signed by the service-wide root CA (x509_san_dns). Signed on the GLOBAL agent, where
   * the root key lives; the tenant key is only the cert subject, so its private key never leaves the
   * tenant store. Requires sanDnsName — the leaf SAN the wallet matches against the request origin.
   */
  private async issueRootSignedRequestSignerLeaf({
    subjectPublicKey,
    options,
    notBefore,
    notAfter,
  }: {
    subjectPublicKey: Kms.PublicJwk
    options: ProvisionX509SignerOptions
    notBefore: Date
    notAfter: Date
  }): Promise<X509Certificate> {
    if (!options.sanDnsName) {
      throw new UnprocessableEntityException('sanDnsName is required for the x509_san_dns trust model')
    }
    const rootCa = await this.ensureServiceRootCa()
    // A leaf outliving its CA fails chain validation as soon as the root expires — refuse it up front.
    const rootNotAfter = rootCa.certificate.data.notAfter
    if (notAfter > rootNotAfter) {
      throw new UnprocessableEntityException(
        `validityDays exceeds the service root CA lifetime (the root expires ${rootNotAfter.toISOString()})`,
      )
    }
    return this.agent.x509.createCertificate({
      authorityKey: rootCa.certificate.publicJwk, // signs with the root key (global/service store)
      subjectPublicKey, // the tenant key is the subject; its private key is not used to sign
      issuer: { commonName: ROOT_CA_COMMON_NAME, organizationalUnit: 'Heka' },
      subject: { commonName: options.commonName ?? options.sanDnsName },
      validity: { notBefore, notAfter },
      extensions: {
        keyUsage: { usages: [X509KeyUsage.DigitalSignature], markAsCritical: true },
        subjectAlternativeName: { name: [{ type: 'dns', value: options.sanDnsName }] },
        authorityKeyIdentifier: { include: true },
        subjectKeyIdentifier: { include: true },
      },
    })
  }

  /**
   * Find-or-create the single service-wide root CA (P-256, self-signed, long-lived) in the global
   * agent's store. NOTE: find-or-create is not atomic — concurrent first-time provisions could race
   * to create two roots; acceptable for an infrequent admin action.
   */
  private async ensureServiceRootCa(): Promise<{
    certificate: X509Certificate
    keyId: string
    certificateBase64: string
  }> {
    const existing = (await this.agent.genericRecords.findAllByQuery({ recordType: ROOT_CA_RECORD_TYPE }))[0]
    if (existing) {
      const content = existing.content as unknown as StoredRootCa
      const certificate = X509Certificate.fromEncodedCertificate(content.certificateBase64)
      certificate.keyId = content.keyId
      return { certificate, keyId: content.keyId, certificateBase64: content.certificateBase64 }
    }

    const key = await this.agent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const publicJwk = Kms.PublicJwk.fromPublicJwk(key.publicJwk)
    const now = Date.now()
    const certificate = await this.agent.x509.createCertificate({
      authorityKey: publicJwk,
      issuer: { commonName: ROOT_CA_COMMON_NAME, organizationalUnit: 'Heka' },
      validity: {
        notBefore: new Date(now - CLOCK_SKEW_MS),
        notAfter: new Date(now + ROOT_CA_VALIDITY_DAYS * MS_PER_DAY),
      },
      extensions: {
        basicConstraints: { ca: true, pathLenConstraint: 0, markAsCritical: true },
        keyUsage: { usages: [X509KeyUsage.KeyCertSign, X509KeyUsage.CrlSign], markAsCritical: true },
        subjectKeyIdentifier: { include: true },
      },
    })
    certificate.keyId = key.keyId
    const certificateBase64 = certificate.toString('base64')
    const content: StoredRootCa = { keyId: key.keyId, certificateBase64, createdAt: new Date(now).toISOString() }
    await this.agent.genericRecords.save({ content: { ...content }, tags: { recordType: ROOT_CA_RECORD_TYPE } })
    return { certificate, keyId: key.keyId, certificateBase64 }
  }

  /**
   * Fetch a signer record by id, asserting it is one of ours (purpose === 'request-signing')
   * so a stray genericRecord id can't be mutated/deleted through these endpoints.
   */
  private async requireSignerRecord(
    tenantAgent: TenantAgent,
    id: string,
  ): Promise<{ record: GenericRecord; content: StoredSigner }> {
    const record = await tenantAgent.genericRecords.findById(id)
    const content = record?.content as unknown as StoredSigner | undefined
    if (!record || content?.purpose !== 'request-signing') {
      throw new NotFoundException(`No X.509 signer found with id '${id}'`)
    }
    return { record, content }
  }

  /**
   * Delete a signer record and best-effort delete its KMS key. The record (the trust/listing
   * surface) is authoritative; a key-deletion failure must not block removal, so it is swallowed — the
   * orphaned key signs nothing once its certificate record is gone. The did:jwk record is left behind
   * intentionally (it becomes verify-only without the key).
   */
  private async deleteRecordAndKey(tenantAgent: TenantAgent, record: GenericRecord, keyId: string): Promise<void> {
    await tenantAgent.genericRecords.deleteById(record.id)
    try {
      await tenantAgent.kms.deleteKey({ keyId })
    } catch {
      // best-effort: the key may already be gone; the certificate record removal is what matters.
    }
  }

  private async findDefaultRecord(tenantAgent: TenantAgent, clientIdPrefix: X509ClientIdPrefix) {
    const records = await tenantAgent.genericRecords.findAllByQuery({
      recordType: RECORD_TYPE,
      clientIdPrefix,
      isDefault: 'true',
    })
    return records[0] ?? null
  }

  private async clearDefault(tenantAgent: TenantAgent, clientIdPrefix: X509ClientIdPrefix): Promise<void> {
    const records = await tenantAgent.genericRecords.findAllByQuery({
      recordType: RECORD_TYPE,
      clientIdPrefix,
      isDefault: 'true',
    })
    for (const record of records) {
      record.content = { ...record.content, isDefault: false }
      record.setTag('isDefault', 'false')
      await tenantAgent.genericRecords.update(record)
    }
  }
}
