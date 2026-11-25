export interface DisplayLogo {
  uri: string
  altText?: string
}

/** What the issuer's metadata says about how to show a credential. */
export interface CredentialDisplay {
  name?: string
  logo?: DisplayLogo
  backgroundColor?: string
  textColor?: string
}

/** Stored on each received record, as heka-wallet does (app/src/credentials/metadata.ts). */
export interface OpenId4VcCredentialMetadata {
  credential: CredentialDisplay | null
  issuer: { id: string; name?: string }
}

export const OPENID4VC_CREDENTIAL_METADATA_KEY = '_heka-web-wallet/openId4VcCredentialMetadata'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** An English entry, else one without a locale, else the first (heka-wallet's findDisplay). */
function pickDisplay(entries: unknown): Record<string, unknown> | null {
  if (!Array.isArray(entries)) return null
  const displays = entries.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
  const locale = (entry: Record<string, unknown>) => (typeof entry.locale === 'string' ? entry.locale : undefined)
  return (
    displays.find((entry) => locale(entry) === 'en' || locale(entry)?.startsWith('en-')) ??
    displays.find((entry) => locale(entry) === undefined) ??
    displays[0] ??
    null
  )
}

function readLogo(value: unknown): DisplayLogo | undefined {
  const logo = asRecord(value)
  // OID4VCI 1.0 names it `uri`; older drafts `url`.
  const uri = nonEmptyString(logo?.uri) ?? nonEmptyString(logo?.url)
  if (!uri) return undefined
  const altText = nonEmptyString(logo?.alt_text)
  return altText ? { uri, altText } : { uri }
}

/**
 * Display data of a credential configuration. OID4VCI 1.0 nests it under
 * `credential_metadata.display`; draft 14/15 issuers, such as the Heka identity service, put
 * `display` at the top level of the configuration.
 */
export function readCredentialDisplay(configuration: unknown): CredentialDisplay | null {
  const root = asRecord(configuration)
  const display = pickDisplay(asRecord(root?.credential_metadata)?.display) ?? pickDisplay(root?.display)
  if (!display) return null

  const result: CredentialDisplay = {}
  const name = nonEmptyString(display.name)
  const logo = readLogo(display.logo)
  const backgroundColor = nonEmptyString(display.background_color)
  const textColor = nonEmptyString(display.text_color)
  if (name) result.name = name
  if (logo) result.logo = logo
  if (backgroundColor) result.backgroundColor = backgroundColor
  if (textColor) result.textColor = textColor
  return result
}

export function readIssuerName(issuerMetadata: unknown): string | undefined {
  return nonEmptyString(pickDisplay(asRecord(issuerMetadata)?.display)?.name)
}

/** Only images the extension page can show without running anything. */
export function isDisplayableLogo(uri: string): boolean {
  return /^(https?:|data:image\/)/i.test(uri)
}
