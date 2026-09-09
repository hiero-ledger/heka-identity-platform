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

import { createHash } from 'node:crypto'

import { CredoWebCrypto, CredoWebCryptoKey, publicJwkToCryptoKeyAlgorithm, X509Certificate } from '@credo-ts/core'
import * as x509 from '@peculiar/x509'

import { ORGANIZATION_IDENTIFIER_OID } from './certificate-profiles'

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
  /** Document-signer EKU OID(s). Omitted when undefined/empty (EU PID profile default — see profile note). */
  extendedKeyUsageOids?: readonly string[]
  /** `certificatePolicies` OID(s). Omitted when undefined/empty. */
  certificatePolicyOids?: readonly string[]
}

/**
 * End-entity DSC extensions: SKI, keyUsage(digitalSignature), optional EKU, optional certificatePolicies,
 * AKI→IACA. `basicConstraints` is intentionally omitted (end-entity). Pure.
 */
export function buildDscExtensions(params: DscExtensionParams): x509.Extension[] {
  const extensions: x509.Extension[] = [
    new x509.SubjectKeyIdentifierExtension(ecKeyIdentifierHex(params.subjectJwk)),
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
  ]
  if (params.extendedKeyUsageOids && params.extendedKeyUsageOids.length > 0) {
    extensions.push(new x509.ExtendedKeyUsageExtension([...params.extendedKeyUsageOids], true))
  }
  if (params.certificatePolicyOids && params.certificatePolicyOids.length > 0) {
    extensions.push(new x509.CertificatePolicyExtension([...params.certificatePolicyOids], false))
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

  const peculiarCertificate = params.selfSigned
    ? await x509.X509CertificateGenerator.createSelfSigned(
        {
          keys: { publicKey, privateKey: signingKey },
          name: params.issuerName,
          notBefore: params.notBefore,
          notAfter: params.notAfter,
          extensions: params.extensions,
          serialNumber: params.serialNumber,
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
          serialNumber: params.serialNumber,
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
  extendedKeyUsageOids?: readonly string[]
  certificatePolicyOids?: readonly string[]
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
      extendedKeyUsageOids: params.extendedKeyUsageOids,
      certificatePolicyOids: params.certificatePolicyOids,
    }),
  })
}
