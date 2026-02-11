import { Attribute } from '@hyperledger/aries-oca/build/legacy'

interface SdJwtVcMetadata {
  type: string
  issuer: string
  holder: string | Record<string, unknown>
  validUntil?: Date
  validFrom?: Date
  issuedAt?: Date
}

type SdJwtVcPayload = {
  iss: string
  cnf: Record<string, unknown>
  vct: string
  iat?: number
  nbf?: number
  exp?: number
  [key: string]: unknown
}

export function filterAndMapSdJwtKeys(sdJwtVcPayload: Record<string, unknown>) {
  const { _sd_alg, _sd_hash, iss, vct, cnf, iat, exp, nbf, ...visibleProperties } = sdJwtVcPayload as SdJwtVcPayload

  const credentialMetadata: SdJwtVcMetadata = {
    type: vct,
    issuer: iss,
    holder: cnf,
  }

  if (iat) {
    credentialMetadata.issuedAt = new Date(iat * 1000)
  }
  if (exp) {
    credentialMetadata.validUntil = new Date(exp * 1000)
  }
  if (nbf) {
    credentialMetadata.validFrom = new Date(nbf * 1000)
  }

  const attributes = Object.keys(visibleProperties).map((key) => {
    let value = visibleProperties[key] as any

    if (typeof value !== 'string' && typeof value !== 'number') {
      value = JSON.stringify(value)
    }

    return new Attribute({ name: key, value })
  })

  return {
    attributes,
    metadata: credentialMetadata,
  }
}
