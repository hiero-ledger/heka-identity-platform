import type { GenericRecord } from '@credo-ts/core'

/**
 * The **global IACA registry**: every tenant's public IACA certificate mirrored (by
 * `MdocIssuerCaService`) into the root agent's generic records, so service-wide consumers — the VICAL
 * builder and the verifier trust provider — can enumerate the tenants' issuer anchors without opening
 * tenant stores. Only public certificates live here.
 */
export const IACA_REGISTRY_RECORD_TYPE = 'mdoc-iaca-registry'

/** Registry entry content (a public projection of the tenant's `MdocIaca`). */
export interface IacaRegistryEntry {
  tenantContextId?: string
  certificateBase64: string
  /** Hex SHA-256 thumbprint of the certificate (absent on entries mirrored before it was recorded). */
  fingerprint?: string
  authorityName: string
  country: string
  docType: string
}

interface RegistryReader {
  genericRecords: { findAllByQuery(query: Record<string, unknown>): Promise<GenericRecord[]> }
}

/** Read every mirrored IACA entry from the global registry. */
export async function readIacaRegistry(agent: RegistryReader): Promise<IacaRegistryEntry[]> {
  const records = await agent.genericRecords.findAllByQuery({ recordType: IACA_REGISTRY_RECORD_TYPE })
  return records.map((record) => record.content as unknown as IacaRegistryEntry)
}
