import { loadWalletSalt, secretForPIN } from '@bifold/core/src/services/keychain'
import { AskarStoreInvalidKeyError } from '@credo-ts/askar'

import { HekaWalletAgent } from './agent'
import { createDcApiAgent } from './createDcApiAgent'

type HashPIN = Parameters<typeof secretForPIN>[1]

function isInvalidStoreKeyError(error: unknown): boolean {
  let current = error
  while (current instanceof Error) {
    if (current instanceof AskarStoreInvalidKeyError) return true
    current = current.cause
  }
  return false
}

/**
 * Opens the DC API agent with a key derived from the PIN.
 * Resolves to `null` when the PIN is wrong; any other failure is rethrown.
 */
export async function unlockDcApiAgent(pin: string, hashPIN: HashPIN): Promise<HekaWalletAgent | null> {
  const salt = await loadWalletSalt()
  if (!salt?.salt) {
    return null
  }

  const secret = await secretForPIN(pin, hashPIN, salt.salt)
  try {
    return await createDcApiAgent(secret)
  } catch (error) {
    if (isInvalidStoreKeyError(error)) {
      return null
    }
    throw error
  }
}
