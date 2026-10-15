export interface HeldCredential {
  /** Locally-generated stable identifier for this credential record. */
  id: string
  /** The raw SD-JWT VC string, as received from the issuer. */
  sdJwtVc: string
  /** The credential type (vct claim from the SD-JWT payload). */
  vct: string
  /** ISO-8601 timestamp of when this credential was received. */
  receivedAt: string
  /** The issuer's DID, extracted from the SD-JWT header. */
  issuerDid: string
}

const STORAGE_KEY = 'heka-credentials'

async function loadAll(): Promise<HeldCredential[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as HeldCredential[] | undefined) ?? []
}

async function saveAll(credentials: HeldCredential[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: credentials })
}

/**
 * Extracts the vct and issuer from a raw SD-JWT VC string without a full
 * JWT library. We only need the unprotected header and first payload segment.
 *
 * SD-JWT format: <header>.<payload>.<signature>~[<disclosure>~...][<kb-jwt>]
 */
function parseRawSdJwtVc(sdJwtVc: string): { vct: string; issuerDid: string } {
  // Take only the JWT part (before any ~)
  const jwtPart = sdJwtVc.split('~')[0]
  const parts = jwtPart.split('.')
  if (parts.length < 2) {
    throw new Error('Invalid SD-JWT VC: expected at least header.payload.signature')
  }

  const decodeBase64url = (s: string): string => {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      s.length + (4 - (s.length % 4)) % 4,
      '=',
    )
    return atob(padded)
  }

  const payload = JSON.parse(decodeBase64url(parts[1])) as {
    vct?: string
    iss?: string
    [key: string]: unknown
  }

  return {
    vct: payload.vct ?? 'unknown',
    issuerDid: payload.iss ?? 'unknown',
  }
}

/**
 * Stores a newly received SD-JWT VC in chrome.storage.local.
 * Duplicate detection: if an identical sdJwtVc string is already stored,
 * returns the existing record without creating a duplicate.
 */
export async function storeCredential(sdJwtVc: string): Promise<HeldCredential> {
  const existing = await loadAll()
  const duplicate = existing.find((c) => c.sdJwtVc === sdJwtVc)
  if (duplicate) {
    return duplicate
  }

  const { vct, issuerDid } = parseRawSdJwtVc(sdJwtVc)

  const record: HeldCredential = {
    id: crypto.randomUUID(),
    sdJwtVc,
    vct,
    receivedAt: new Date().toISOString(),
    issuerDid,
  }

  await saveAll([...existing, record])
  return record
}

/** Returns all held credentials. */
export async function getAllCredentials(): Promise<HeldCredential[]> {
  return loadAll()
}

/** Returns credentials matching a specific vct (credential type). */
export async function getCredentialsByVct(vct: string): Promise<HeldCredential[]> {
  const all = await loadAll()
  return all.filter((c) => c.vct === vct)
}

/** Removes a credential by its local id. */
export async function deleteCredential(id: string): Promise<void> {
  const existing = await loadAll()
  await saveAll(existing.filter((c) => c.id !== id))
}

/** Returns the count of held credentials (for the extension badge). */
export async function getCredentialCount(): Promise<number> {
  const all = await loadAll()
  return all.length
}
