import { Kms } from '@credo-ts/core'

import { addressFromPublicJwk } from '../utils/address'

export function buildDid(method: string, network: string, publicJwk: Kms.PublicJwk<Kms.Secp256k1PublicJwk>): string {
  return `did:${method}:${network}:${addressFromPublicJwk(publicJwk)}`
}
