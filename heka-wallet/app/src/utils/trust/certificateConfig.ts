import { X509Certificate } from '@credo-ts/core'

/**
 * Validation of certificate values from `react-native-config` — the static anchors, the service root and the
 * pinned list signers. Entries are base64 DER or PEM (armour and whitespace stripped) and must decode as an
 * X.509 certificate; anything else is a misconfiguration, not an anchor.
 */

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const PEM_ARMOUR = /-----(?:BEGIN|END) CERTIFICATE-----/g

/**
 * Validate a certificate-list value: entries separated by commas, each a base64 DER certificate or a
 * PEM block that must decode as an X.509 certificate; duplicates dropped. Throws a descriptive error
 * naming the variable and the offending entry.
 */
export function validateCertificateList(raw: string | undefined, name: string): string[] {
  const certificates: string[] = []
  splitEntries(raw).forEach((entry, index) => {
    const certificate = validateEntry(entry, `${name}[${index}]`)
    if (!certificates.includes(certificate)) certificates.push(certificate)
  })
  return certificates
}

/** Validate a value that must hold exactly one certificate (base64 DER or PEM); errors name `name` alone. */
export function validateCertificate(raw: string | undefined, name: string): string {
  const entries = splitEntries(raw)
  if (entries.length !== 1) throw new Error(`${name} must hold exactly one certificate (found ${entries.length})`)
  return validateEntry(entries[0], name)
}

/** Comma-separated entries with PEM armour and all whitespace removed; blanks dropped. */
function splitEntries(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return []
  return raw
    .split(',')
    .map((entry) => entry.replace(PEM_ARMOUR, '').replace(/\s+/g, ''))
    .filter((entry) => entry !== '')
}

function validateEntry(certificate: string, at: string): string {
  if (!BASE64.test(certificate)) throw new Error(`${at} is not a base64 DER (or PEM) certificate`)
  try {
    X509Certificate.fromEncodedCertificate(certificate)
  } catch (error) {
    throw new Error(
      `${at} is not a valid X.509 certificate: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  return certificate
}
