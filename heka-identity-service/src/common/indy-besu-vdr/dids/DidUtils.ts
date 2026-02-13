import { type Buffer, TypedArrayEncoder } from '@credo-ts/core'
import { computeAddress } from 'ethers'

export function buildDid(method: string, network: string, key: Buffer): string {
  const identifier = computeAddress(`0x${TypedArrayEncoder.toHex(key)}`)
  return `did:${method}:${network}:${identifier}`
}
