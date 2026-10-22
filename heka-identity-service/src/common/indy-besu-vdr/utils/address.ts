import { Kms } from '@credo-ts/core'
import { computeAddress, hexlify } from 'ethers'

/**
 * The Ethereum account address of a secp256k1 key. The DID of an Indy-Besu identity is built from it, and the ledger
 * only accepts writes for that DID from the same address, so the DID and the signer must use this one derivation.
 */
export function addressFromPublicJwk(publicJwk: Kms.PublicJwk<Kms.Secp256k1PublicJwk>): string {
  return computeAddress(hexlify(publicJwk.publicKey.publicKey))
}
