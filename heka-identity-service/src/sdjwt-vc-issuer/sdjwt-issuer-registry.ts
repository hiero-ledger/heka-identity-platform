import type { GenericRecord } from '@credo-ts/core'

/**
 * The **global SD-JWT VC issuer registry**: every tenant's public SD-JWT VC issuer certificate (the
 * x5c leaf under the service root) mirrored by `SdJwtVcIssuerService` into the root agent's generic
 * records, so service-wide consumers — the scheme trust list — can enumerate the tenants' SD-JWT
 * issuer identities without opening tenant stores. Only public certificates live here.
 */
export const SDJWT_ISSUER_REGISTRY_RECORD_TYPE = 'sdjwt-issuer-registry'

/** Registry entry content (a public projection of the tenant's managed SD-JWT issuer certificate). */
export interface SdJwtIssuerRegistryEntry {
  tenantContextId: string
  /** The issuer domain carried as the dNSName SAN (and `iss` host). */
  domain: string
  /** Base64 DER of the issuer leaf certificate. */
  certificateBase64: string
  notAfter: string
}

interface RegistryReader {
  genericRecords: { findAllByQuery(query: Record<string, unknown>): Promise<GenericRecord[]> }
}

/** Read every mirrored SD-JWT VC issuer entry from the global registry. */
export async function readSdJwtIssuerRegistry(agent: RegistryReader): Promise<SdJwtIssuerRegistryEntry[]> {
  const records = await agent.genericRecords.findAllByQuery({ recordType: SDJWT_ISSUER_REGISTRY_RECORD_TYPE })
  return records.map((record) => record.content as unknown as SdJwtIssuerRegistryEntry)
}
