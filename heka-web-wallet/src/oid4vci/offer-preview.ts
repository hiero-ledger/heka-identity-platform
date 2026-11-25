import { readCredentialDisplay, readIssuerName, type CredentialDisplay } from './credential-display'

export interface TransactionCodeRequirement {
  length: number
  numeric: boolean
  description: string
}

export interface OfferPreview {
  /** The origin of `credential_issuer`: the part of the issuer the wallet can vouch for. */
  issuerOrigin: string
  issuerUrl: string
  /** The issuer's display name from its own metadata: self-declared, so never shown as the issuer. */
  issuerName: string | null
  credentials: Array<CredentialDisplay & { name: string; type: string }>
  txCode: TransactionCodeRequirement | null
}

const PRE_AUTHORIZED_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Reads the issuer, credential configuration, and transaction-code requirement
 * from a resolved OID4VCI offer. The wallet shows this before it redeems anything.
 */
export function describeCredentialOffer(resolved: unknown): OfferPreview {
  const root = asRecord(resolved)
  const issuer = asRecord(asRecord(root?.metadata)?.credentialIssuer)
  const issuerUrl = typeof issuer?.credential_issuer === 'string' ? issuer.credential_issuer : 'Unknown issuer'
  const payload = asRecord(root?.credentialOfferPayload)
  const configurations = asRecord(root?.offeredCredentialConfigurations) ?? {}
  const offeredIds = Array.isArray(payload?.credential_configuration_ids)
    ? payload.credential_configuration_ids.filter((id): id is string => typeof id === 'string')
    : Object.keys(configurations)

  const credentials = offeredIds.map((id) => {
    const configuration = asRecord(configurations[id])
    const type = typeof configuration?.vct === 'string' ? configuration.vct : id
    const display = readCredentialDisplay(configuration)
    return { ...display, name: display?.name ?? type, type }
  })

  const grant = asRecord(asRecord(payload?.grants)?.[PRE_AUTHORIZED_GRANT])
  const tx = asRecord(grant?.tx_code)
  const txCode = tx
    ? {
        length: typeof tx.length === 'number' && tx.length > 0 ? tx.length : 4,
        numeric: tx.input_mode !== 'text',
        description:
          typeof tx.description === 'string' && tx.description.length > 0
            ? tx.description
            : 'Enter the transaction code from the issuer.',
      }
    : null

  let issuerOrigin = issuerUrl
  try {
    issuerOrigin = new URL(issuerUrl).origin
  } catch {
    // Not a URL: show it as it is.
  }

  return {
    issuerOrigin,
    issuerUrl,
    issuerName: readIssuerName(issuer) ?? null,
    credentials,
    txCode,
  }
}

export function transactionCodeError(code: string, requirement: TransactionCodeRequirement | null): string | null {
  if (!requirement) return null
  const trimmed = code.trim()
  if (trimmed.length !== requirement.length) {
    return `Enter the ${requirement.length}-character code shown in Heka.`
  }
  if (requirement.numeric && !/^\d+$/.test(trimmed)) return 'That code uses digits only.'
  return null
}
