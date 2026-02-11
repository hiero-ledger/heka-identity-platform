import { Buffer } from 'buffer'

export function isPrivateKey(mnemonic: string): boolean {
  if (mnemonic.startsWith('0x')) return true

  if (mnemonic.length !== 64) return false

  try {
    return Buffer.from(mnemonic, 'hex').length === 32
  } catch {
    return false
  }
}

export function getPrivateKey(mnemonic: string): Buffer {
  return Buffer.from(mnemonic.trim().replace('0x', ''), 'hex')
}

export function trimWords(str: string): string {
  str = str.trim()
  // Split on the whitespace or new line.
  const splitted = str.split(/\s+/)
  const words = splitted.map((word) => word.trim()).filter((word) => !!word)
  return words.join(' ')
}
