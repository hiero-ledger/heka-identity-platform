/**
 * EU/EUDI certificate builder — the **`@peculiar/x509` escape hatch**.
 *
 * Credo's `X509Api.createCertificate` cannot emit the EU/ETSI profile bits (EN 319 412-1
 * `organizationIdentifier` in the DN, `certificatePolicies`, arbitrary document-signer EKU OIDs), so the
 * EU profile bypasses it and drives `@peculiar/x509`'s `X509CertificateGenerator` directly — the same
 * library Credo's `X509Service` is built on. Signing still goes through the tenant KMS via
 * `CredoWebCrypto` (the private key never leaves the store); only the *public* key material + extensions
 * are handled here. This mirrors Credo's own `X509Certificate.create` path exactly, adding the extra
 * extensions/DN attributes Credo's typed options can't express.
 *
 * Key-identifier note: SKI/AKI are computed **synchronously from the JWK** (SHA-1 over the EC public
 * point) — the way Credo does it internally — because `CredoWebCrypto` cannot export a KMS-backed key.
 * That also keeps the extension + DN construction **pure** (given JWKs), so it is unit-testable without a
 * KMS (see the peculiar-native test).
 */
import type { AgentContext, Kms } from '@credo-ts/core'

import { createHash, randomBytes } from 'node:crypto'

import { CredoWebCrypto, CredoWebCryptoKey, publicJwkToCryptoKeyAlgorithm, X509Certificate } from '@credo-ts/core'
import { AsnArray, AsnConvert, AsnProp, AsnPropTypes, AsnType, AsnTypeTypes } from '@peculiar/asn1-schema'
import * as x509 from '@peculiar/x509'

import { ID_ETSI_QCS_QC_TYPE_OID, ID_PE_QC_STATEMENTS_OID, ORGANIZATION_IDENTIFIER_OID } from './certificate-profiles'

// --- qcStatements (RFC 3739 §3.2.6 / EN 319 412-5) ---------------------------------------------------
// `@peculiar/x509` ships no QC-statements extension class, so the structure is declared here with the same
// ASN.1 schema decorators peculiar itself uses (`@peculiar/asn1-schema`).

/** `QCStatement ::= SEQUENCE { statementId OBJECT IDENTIFIER, statementInfo ANY DEFINED BY statementId OPTIONAL }` */
export class QcStatement {
  @AsnProp({ type: AsnPropTypes.ObjectIdentifier })
  public statementId = ''

  @AsnProp({ type: AsnPropTypes.Any, optional: true })
  public statementInfo?: ArrayBuffer

  public constructor(params: Partial<QcStatement> = {}) {
    Object.assign(this, params)
  }
}

/** `QCStatements ::= SEQUENCE OF QCStatement` */
@AsnType({ type: AsnTypeTypes.Sequence, itemType: QcStatement })
export class QcStatements extends AsnArray<QcStatement> {
  public constructor(items?: QcStatement[]) {
    super(items)
    Object.setPrototypeOf(this, QcStatements.prototype)
  }
}

/** EN 319 412-5 §4.2.3 `QcType ::= SEQUENCE OF OBJECT IDENTIFIER` (the statementInfo of `id-etsi-qcs-QcType`). */
@AsnType({ type: AsnTypeTypes.Sequence, itemType: AsnPropTypes.ObjectIdentifier })
export class QcTypeIdentifiers extends AsnArray<string> {
  public constructor(items?: string[]) {
    super(items)
    Object.setPrototypeOf(this, QcTypeIdentifiers.prototype)
  }
}

/** DER of a `qcStatements` value carrying one `QcType` statement with the given type identifiers. */
export function encodeQcStatements(qcTypes: readonly string[]): ArrayBuffer {
  const qcType = new QcStatement({
    statementId: ID_ETSI_QCS_QC_TYPE_OID,
    statementInfo: AsnConvert.serialize(new QcTypeIdentifiers([...qcTypes])),
  })
  return AsnConvert.serialize(new QcStatements([qcType]))
}

/** The `QcType` identifiers of a DER `qcStatements` value (empty when the statement is absent). */
export function decodeQcTypes(qcStatementsDer: BufferSource): string[] {
  const statements = AsnConvert.parse(qcStatementsDer, QcStatements)
  const qcType = statements.find((statement) => statement.statementId === ID_ETSI_QCS_QC_TYPE_OID)
  if (!qcType?.statementInfo) return []
  return [...AsnConvert.parse(qcType.statementInfo, QcTypeIdentifiers)]
}

/**
 * RFC 5280 §4.1.2.2: serial numbers are positive integers, unique per CA. 20 random bytes with the top
 * bit cleared (and a non-zero leading octet, so the DER INTEGER is minimal) — the reference-wallet
 * profile check (`positiveSerialNumber`) rejects anything else.
 */
export function randomPositiveSerialNumberHex(): string {
  const serial = randomBytes(20)
  serial[0] = serial[0] & 0x7f || 0x01
  return serial.toString('hex')
}

/** A minimal EC public JWK (P-256) as returned by `Kms.PublicJwk.toJson()`. */
export interface EcPublicJwk {
  kty: string
  crv?: string
  x?: string
  y?: string
}

export interface DistinguishedNameParams {
  commonName: string
  countryName: string
  /** EN 319 412-1 `organizationName` (O). For the EU profile, the issuing authority's legal name. */
  organizationName?: string
  /** EN 319 412-1 `organizationIdentifier` (2.5.4.97), e.g. `VATDE-0123456789`, `NTRDE-…`. */
  organizationIdentifier?: string
}

/**
 * Build a `@peculiar/x509` `Name` that may carry an EN 319 412-1 `organizationIdentifier` RDN (which
 * peculiar's registry does not know by short name — hence the explicit OID + `extraNames` mapping).
 * Attribute order follows the EN 319 412 convention: C, O, organizationIdentifier, CN.
 */
export function buildDistinguishedName(params: DistinguishedNameParams): x509.Name {
  const rdns: x509.JsonNameParams = []
  rdns.push({ C: [params.countryName] })
  if (params.organizationName) rdns.push({ O: [params.organizationName] })
  if (params.organizationIdentifier) rdns.push({ [ORGANIZATION_IDENTIFIER_OID]: [params.organizationIdentifier] })
  rdns.push({ CN: [params.commonName] })
  return new x509.Name(rdns, { [ORGANIZATION_IDENTIFIER_OID]: 'organizationIdentifier' })
}

/**
 * RFC 5280 §4.2.1.2 method-1 key identifier: SHA-1 over the subjectPublicKey BIT STRING content. For
 * EC P-256 that content is the uncompressed point `0x04 || X || Y`. Matches Credo's internal computation
 * (`publicJwkToSpki(...).subjectPublicKey` → SHA-1), so EU and mDL certs identify keys identically.
 */
export function ecKeyIdentifierHex(jwk: EcPublicJwk): string {
  if (!jwk.x || !jwk.y) throw new Error('ecKeyIdentifierHex: expected an EC public JWK with x and y')
  const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])
  return createHash('sha1').update(point).digest('hex')
}

export interface IacaExtensionParams {
  subjectJwk: EcPublicJwk
}

/** Self-signed IACA extensions: SKI, keyUsage(keyCertSign|cRLSign), basicConstraints(CA, pathLen 0). Pure. */
export function buildIacaExtensions({ subjectJwk }: IacaExtensionParams): x509.Extension[] {
  return [
    new x509.SubjectKeyIdentifierExtension(ecKeyIdentifierHex(subjectJwk)),
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
    new x509.BasicConstraintsExtension(true, 0, true),
  ]
}

export interface DscExtensionParams {
  subjectJwk: EcPublicJwk
  authorityJwk: EcPublicJwk
  /** Document-signer EKU. Omitted when undefined/empty (TS 119 412-6 defines none for PID / EAA certificates). */
  extendedKeyUsage?: { oids: readonly string[]; critical: boolean }
  /** `certificatePolicies` OID(s) (EN 319 412-2 §4.3.3). Omitted when undefined/empty. */
  certificatePolicyOids?: readonly string[]
  /** `qcStatements` QcType identifiers (TS 119 412-6 PID-4.5-01). Omitted when undefined/empty. */
  qcTypes?: readonly string[]
  /** AIA `id-ad-caIssuers` http(s) location of the issuing IACA (TS 119 412-6 PID-4.4.3). Omitted when undefined. */
  authorityInfoAccessCaIssuers?: string
}

/**
 * End-entity DSC extensions: SKI, keyUsage(digitalSignature, critical), optional EKU, optional
 * certificatePolicies, optional qcStatements, optional AIA, AKI→IACA. `basicConstraints` is intentionally
 * omitted (end-entity). Only keyUsage is critical (TS 119 412-6 PID-4.1-02). Pure.
 */
export function buildDscExtensions(params: DscExtensionParams): x509.Extension[] {
  const extensions: x509.Extension[] = [
    new x509.SubjectKeyIdentifierExtension(ecKeyIdentifierHex(params.subjectJwk)),
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
  ]
  if (params.extendedKeyUsage && params.extendedKeyUsage.oids.length > 0) {
    extensions.push(
      new x509.ExtendedKeyUsageExtension([...params.extendedKeyUsage.oids], params.extendedKeyUsage.critical),
    )
  }
  if (params.certificatePolicyOids && params.certificatePolicyOids.length > 0) {
    extensions.push(new x509.CertificatePolicyExtension([...params.certificatePolicyOids], false))
  }
  if (params.qcTypes && params.qcTypes.length > 0) {
    extensions.push(new x509.Extension(ID_PE_QC_STATEMENTS_OID, false, encodeQcStatements(params.qcTypes)))
  }
  if (params.authorityInfoAccessCaIssuers) {
    extensions.push(new x509.AuthorityInfoAccessExtension({ caIssuers: params.authorityInfoAccessCaIssuers }, false))
  }
  extensions.push(new x509.AuthorityKeyIdentifierExtension(ecKeyIdentifierHex(params.authorityJwk), false))
  return extensions
}

interface GenerateCertificateParams {
  /** Authority (signing) key — MUST carry its KMS `keyId` so `CredoWebCrypto` can route signing to KMS. */
  authorityKey: Kms.PublicJwk
  /** Subject public key embedded in the cert SPKI. */
  subjectPublicKey: Kms.PublicJwk
  /** KMS keyId re-attached to the returned cert (parsing drops it). */
  subjectKeyId: string
  selfSigned: boolean
  issuerName: x509.Name
  /** Required for CA-signed certs; must be omitted for self-signed (peculiar/Credo constraint). */
  subjectName?: x509.Name
  notBefore: Date
  notAfter: Date
  extensions: x509.Extension[]
  /** Hex serial; defaults to a fresh positive random serial (RFC 5280 §4.1.2.2). */
  serialNumber?: string
}

/**
 * Sign a peculiar-built certificate with the tenant KMS key (via `CredoWebCrypto`) and wrap the result
 * back into a Credo `X509Certificate`. Mirrors `@credo-ts/core`'s own `X509Certificate.create` wiring.
 */
async function generateKmsSignedCertificate(
  agentContext: AgentContext,
  params: GenerateCertificateParams,
): Promise<X509Certificate> {
  const algorithm = publicJwkToCryptoKeyAlgorithm(params.authorityKey)
  const signingKey = new CredoWebCryptoKey(params.authorityKey, algorithm, false, 'private', ['sign'])
  const publicKey = new CredoWebCryptoKey(params.subjectPublicKey, algorithm, true, 'public', ['verify'])
  const webCrypto = new CredoWebCrypto(agentContext)
  const serialNumber = params.serialNumber ?? randomPositiveSerialNumberHex()

  const peculiarCertificate = params.selfSigned
    ? await x509.X509CertificateGenerator.createSelfSigned(
        {
          keys: { publicKey, privateKey: signingKey },
          name: params.issuerName,
          notBefore: params.notBefore,
          notAfter: params.notAfter,
          extensions: params.extensions,
          serialNumber,
        },
        webCrypto,
      )
    : await x509.X509CertificateGenerator.create(
        {
          signingKey,
          publicKey,
          issuer: params.issuerName,
          // biome-ignore lint/style/noNonNullAssertion: guaranteed by callers for CA-signed certs
          subject: params.subjectName!,
          notBefore: params.notBefore,
          notAfter: params.notAfter,
          extensions: params.extensions,
          serialNumber,
        },
        webCrypto,
      )

  const certificate = X509Certificate.fromRawCertificate(new Uint8Array(peculiarCertificate.rawData))
  certificate.keyId = params.subjectKeyId
  return certificate
}

export interface BuildEuIacaParams {
  authorityKey: Kms.PublicJwk
  keyId: string
  dn: DistinguishedNameParams
  notBefore: Date
  notAfter: Date
}

/** Build a self-signed EU/EUDI IACA (issuer CA) with an EN 319 412-1 DN, signed by the tenant KMS key. */
export async function buildEuIaca(agentContext: AgentContext, params: BuildEuIacaParams): Promise<X509Certificate> {
  const subjectJwk = params.authorityKey.toJson() as unknown as EcPublicJwk
  const issuerName = buildDistinguishedName(params.dn)
  return generateKmsSignedCertificate(agentContext, {
    authorityKey: params.authorityKey,
    subjectPublicKey: params.authorityKey,
    subjectKeyId: params.keyId,
    selfSigned: true,
    issuerName,
    notBefore: params.notBefore,
    notAfter: params.notAfter,
    extensions: buildIacaExtensions({ subjectJwk }),
  })
}

export interface BuildEuDscParams {
  /** The IACA key (authority) — MUST carry its KMS keyId. */
  authorityKey: Kms.PublicJwk
  /** The freshly-minted DSC subject key. */
  subjectPublicKey: Kms.PublicJwk
  subjectKeyId: string
  issuerDn: DistinguishedNameParams
  subjectDn: DistinguishedNameParams
  notBefore: Date
  notAfter: Date
  extendedKeyUsage?: { oids: readonly string[]; critical: boolean }
  certificatePolicyOids?: readonly string[]
  qcTypes?: readonly string[]
  authorityInfoAccessCaIssuers?: string
}

/** Build an EU/EUDI DSC (document signer) chaining to the IACA, signed by the tenant IACA KMS key. */
export async function buildEuDsc(agentContext: AgentContext, params: BuildEuDscParams): Promise<X509Certificate> {
  const subjectJwk = params.subjectPublicKey.toJson() as unknown as EcPublicJwk
  const authorityJwk = params.authorityKey.toJson() as unknown as EcPublicJwk
  return generateKmsSignedCertificate(agentContext, {
    authorityKey: params.authorityKey,
    subjectPublicKey: params.subjectPublicKey,
    subjectKeyId: params.subjectKeyId,
    selfSigned: false,
    issuerName: buildDistinguishedName(params.issuerDn),
    subjectName: buildDistinguishedName(params.subjectDn),
    notBefore: params.notBefore,
    notAfter: params.notAfter,
    extensions: buildDscExtensions({
      subjectJwk,
      authorityJwk,
      extendedKeyUsage: params.extendedKeyUsage,
      certificatePolicyOids: params.certificatePolicyOids,
      qcTypes: params.qcTypes,
      authorityInfoAccessCaIssuers: params.authorityInfoAccessCaIssuers,
    }),
  })
}
