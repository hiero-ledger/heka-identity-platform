import { TypedArrayEncoder } from '@credo-ts/core'
import { computeAddress } from 'ethers'

export function buildDid(method: string, network: string, key: Uint8Array): string {
  const identifier = computeAddress(`0x${TypedArrayEncoder.toHex(key)}`)
  return `did:${method}:${network}:${identifier}`
}
