/**
 * Executable conformance check of an EU sign/seal (document-signer) certificate against ETSI
 * TS 119 412-6 V1.1.1 clause 4 (PID Provider) / clause 6 (EAA Provider), modelled on the EU reference
 * wallet's `pidSigningCertificateProfile` (`eudi-lib-kmp-etsi-1196x2`): the same constraints, evaluated
 * with `@peculiar/x509`, returning every violation instead of throwing. Used by the tests and available
 * for operators to assess a DSC before it is trusted.
 */
import * as x509 from '@peculiar/x509'

import { ID_PE_QC_STATEMENTS_OID, ORGANIZATION_IDENTIFIER_OID } from './certificate-profiles'
import { decodeQcTypeStatement } from './eu-certificate-builder'

export interface CertificateAssessmentOptions {
  /** QcType the certificate must carry (`ID_ETSI_QCT_PID_OID` for a PID Provider certificate). Omit for EAA. */
  requiredQcType?: string
  /** Instant the certificate must be valid at. Default: now. */
  at?: Date
}

export interface CertificateAssessment {
  met: boolean
  violations: string[]
}

const BASIC_CONSTRAINTS_OID = '2.5.29.19'
const KEY_USAGE_OID = '2.5.29.15'

/** DER length at `offset` (after the tag byte): returns the length and the offset of the content. */
function derLength(der: Uint8Array, offset: number): { length: number; contentOffset: number } {
  const first = der[offset]
  if (first < 0x80) return { length: first, contentOffset: offset + 1 }
  const count = first & 0x7f
  let length = 0
  for (let i = 0; i < count; i++) length = length * 256 + der[offset + 1 + i]
  return { length, contentOffset: offset + 1 + count }
}

/**
 * The X.509 version (1..3) read straight from the DER: `Certificate ::= SEQUENCE { tbsCertificate SEQUENCE {
 * version [0] EXPLICIT INTEGER DEFAULT v1(0), ... } }` — `@peculiar/x509` exposes no version accessor.
 */
export function certificateVersion(rawData: ArrayBuffer | Uint8Array): number {
  const der = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)
  if (der[0] !== 0x30) return 0
  const outer = derLength(der, 1)
  if (der[outer.contentOffset] !== 0x30) return 0
  const tbs = derLength(der, outer.contentOffset + 1)
  const first = tbs.contentOffset
  if (der[first] !== 0xa0) return 1 // version absent → DEFAULT v1
  const explicit = derLength(der, first + 1)
  if (der[explicit.contentOffset] !== 0x02) return 0
  const integer = derLength(der, explicit.contentOffset + 1)
  return der[integer.contentOffset + integer.length - 1] + 1
}

/** Flatten a peculiar `Name` into `{ attributeTypeOrOid: firstValue }`. */
function nameAttributes(name: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const rdn of new x509.Name(name, { [ORGANIZATION_IDENTIFIER_OID]: 'organizationIdentifier' }).toJSON()) {
    for (const [type, values] of Object.entries(rdn)) {
      if (values.length > 0 && attributes[type] === undefined) attributes[type] = values[0]
    }
  }
  return attributes
}

/** EN 319 412-3 §4.2.1 legal person (has O) or EN 319 412-2 §4.2.4 natural person subject / issuer rules. */
function assessDistinguishedName(label: string, name: string, violations: string[]): void {
  const attributes = nameAttributes(name)
  if (!attributes.C) violations.push(`${label}: countryName (C) is missing`)
  if (!attributes.CN) violations.push(`${label}: commonName (CN) is missing`)
  const isLegalPerson = attributes.O !== undefined
  if (isLegalPerson) {
    if (!attributes.organizationIdentifier) {
      violations.push(`${label}: organizationIdentifier (2.5.4.97) is missing for a legal person (EN 319 412-3 §4.2.1)`)
    }
  } else if (!attributes.G && !attributes.SN && !attributes['2.5.4.65']) {
    violations.push(`${label}: givenName / surname / pseudonym is missing for a natural person (EN 319 412-2 §4.2.4)`)
  }
}

/**
 * Assess a DSC against TS 119 412-6 clause 4 / 6. Every requirement is checked; the result lists all
 * violations so a non-conformant certificate can be fixed in one pass.
 */
export function assessEuSigningCertificate(
  certificate: x509.X509Certificate,
  options: CertificateAssessmentOptions = {},
): CertificateAssessment {
  const violations: string[] = []
  const at = options.at ?? new Date()

  // X.509 v3 (extensions require it)
  const version = certificateVersion(certificate.rawData)
  if (version !== 3) violations.push(`version must be 3, got ${version}`)

  // End entity: no CA basicConstraints
  const basicConstraints = certificate.getExtension<x509.BasicConstraintsExtension>(BASIC_CONSTRAINTS_OID)
  if (basicConstraints?.ca) violations.push('basicConstraints marks the certificate as a CA (expected an end entity)')

  // Key usage: present, digitalSignature (EN 319 412-2 Type A; C also allowed), critical
  const keyUsage = certificate.getExtension<x509.KeyUsagesExtension>(KEY_USAGE_OID)
  if (!keyUsage) {
    violations.push('keyUsage extension is missing (PID-4.4.1-01)')
  } else {
    // eslint-disable-next-line no-bitwise
    if ((keyUsage.usages & x509.KeyUsageFlags.digitalSignature) === 0) {
      violations.push('keyUsage does not contain digitalSignature (PID-4.4.1-01)')
    }
    if (!keyUsage.critical) violations.push('keyUsage must be critical')
  }

  // Criticality: only basicConstraints / keyUsage may be critical (PID-4.1-02)
  for (const extension of certificate.extensions) {
    const mustBeCritical = extension.type === BASIC_CONSTRAINTS_OID || extension.type === KEY_USAGE_OID
    if (!mustBeCritical && extension.critical) {
      violations.push(`extension ${extension.type} must not be critical (PID-4.1-02)`)
    }
  }

  // Validity at the assessment instant
  if (certificate.notBefore > at || certificate.notAfter < at) {
    violations.push(`certificate is not valid at ${at.toISOString()}`)
  }

  // certificatePolicies present (EN 319 412-2 §4.3.3 via PID-4.1-01)
  const policies = certificate.getExtension<x509.CertificatePolicyExtension>(x509.CertificatePolicyExtension)
  if (!policies || policies.policies.length === 0) {
    violations.push('certificatePolicies extension is missing or empty (EN 319 412-2 §4.3.3)')
  }

  // AIA caIssuers over http(s) for CA-issued certificates (PID-4.4.3-01..03)
  const selfSigned = certificate.subject === certificate.issuer
  if (!selfSigned) {
    const aia = certificate.getExtension<x509.AuthorityInfoAccessExtension>(x509.AuthorityInfoAccessExtension)
    const caIssuers = aia?.caIssuers.map((name) => name.value) ?? []
    if (!aia) {
      violations.push('authorityInformationAccess extension is missing on a CA-issued certificate (PID-4.4.3-01)')
    } else if (caIssuers.length === 0) {
      violations.push('authorityInformationAccess has no id-ad-caIssuers access location (PID-4.4.3-02)')
    } else if (!caIssuers.some((location) => /^https?:\/\//i.test(location))) {
      violations.push('no id-ad-caIssuers access location uses the http or https scheme (PID-4.4.3-03)')
    }
  }

  // Positive serial number (RFC 5280 §4.1.2.2)
  const serial = certificate.serialNumber.replace(/^0x/i, '')
  const leadingByte = parseInt(serial.slice(0, 2), 16)
  if (!serial || /^0+$/.test(serial) || Number.isNaN(leadingByte) || leadingByte >= 0x80) {
    violations.push(`serialNumber must be a positive integer, got 0x${serial}`)
  }

  // Public key algorithm (TS 119 312 as applied by the reference profile: EC P-256 or RSA ≥ 2048)
  const algorithm = certificate.publicKey.algorithm as { name?: string; namedCurve?: string; modulusLength?: number }
  const ecOk = algorithm.name === 'ECDSA' && algorithm.namedCurve === 'P-256'
  const rsaOk = algorithm.name?.startsWith('RSA') === true && (algorithm.modulusLength ?? 0) >= 2048
  if (!ecOk && !rsaOk) violations.push(`public key must be EC P-256 or RSA ≥ 2048, got ${JSON.stringify(algorithm)}`)

  // Issuer / subject names (PID-4.2-01, PID-4.3-01/02)
  assessDistinguishedName('subject', certificate.subject, violations)
  assessDistinguishedName('issuer', certificate.issuer, violations)

  // Subject Key Identifier (PID-4.4.2-01)
  if (!certificate.getExtension<x509.SubjectKeyIdentifierExtension>(x509.SubjectKeyIdentifierExtension)) {
    violations.push('subjectKeyIdentifier extension is missing (PID-4.4.2-01)')
  }

  // QcType (PID-4.5-01)
  if (options.requiredQcType) {
    const qcStatements = certificate.getExtension(ID_PE_QC_STATEMENTS_OID)
    const qcTypes = qcStatements ? decodeQcTypeStatement(qcStatements.value) : []
    if (!qcTypes.includes(options.requiredQcType)) {
      violations.push(
        `qcStatements QcType ${options.requiredQcType} is missing (PID-4.5-01); found [${qcTypes.join(', ')}]`,
      )
    }
  }

  return { met: violations.length === 0, violations }
}
