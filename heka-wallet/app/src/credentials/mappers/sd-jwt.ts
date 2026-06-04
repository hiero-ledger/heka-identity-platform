import { Attribute } from '@bifold/oca/build/legacy'
import { Hasher, Kms, TypedArrayEncoder } from '@credo-ts/core'

import { humanizeAttributeName } from './humanize'

interface SdJwtVcMetadata {
  type: string
  issuer: string
  holder?: string | Record<string, unknown>
  validUntil?: string
  validFrom?: string
  issuedAt?: string
  [key: string]: unknown
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

export function getAttributesAndMetadataForSdJwtPayload(sdJwtVcPayload: Record<string, unknown>) {
  const { _sd_alg, _sd_hash, iss, vct, cnf, iat, exp, nbf, status, ...visibleProperties } =
    sdJwtVcPayload as SdJwtVcPayload

  const credentialMetadata: SdJwtVcMetadata = {
    type: vct,
    issuer: iss,
    holder: cnf ? ((cnf.kid ?? cnf.jwk) ? safeCalculateJwkThumbprint(cnf.jwk as Kms.Jwk) : undefined) : undefined,
    issuedAt: iat ? new Date(iat * 1000).toISOString() : undefined,
    validUntil: exp ? new Date(exp * 1000).toISOString() : undefined,
    validFrom: nbf ? new Date(nbf * 1000).toISOString() : undefined,
    status,
  }

  const attributes = Object.keys(visibleProperties)
    .map((key) => {
      let value = visibleProperties[key] as any

      if (typeof value !== 'string' && typeof value !== 'number') {
        value = JSON.stringify(value)
      }

      return new Attribute({ name: humanizeAttributeName(key), value })
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  return {
    attributes,
    metadata: credentialMetadata,
  }
}

function safeCalculateJwkThumbprint(jwk: Kms.Jwk): string | undefined {
  try {
    const thumbprint = TypedArrayEncoder.toBase64URL(
      Hasher.hash(
        JSON.stringify({ k: jwk.k, e: jwk.e, crv: jwk.crv, kty: jwk.kty, n: jwk.n, x: jwk.x, y: jwk.y }),
        'sha-256'
      )
    )
    return `urn:ietf:params:oauth:jwk-thumbprint:sha-256:${thumbprint}`
  } catch (_e) {
    return undefined
  }
}
