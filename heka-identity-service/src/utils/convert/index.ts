export const SecondsToDate = (seconds: number) => new Date(new Date(0).setSeconds(seconds))

export const ExpiresInToDate = (expiresIn: number) => {
  const expiration = new Date()
  expiration.setTime(expiration.getTime() + 1000 * expiresIn)
  return expiration
}

export const normalizeUrl = (url: string) => url.replace(/(\\)+/g, '/')

export const bytesToSize = (bytes: number, precision?: number): string => {
  if (bytes === 0) return '0 b'
  const units: string[] = ['b', 'kb', 'mb', 'gb', 'tb']
  const index: number = Math.floor(Math.log(bytes) / Math.log(1024))
  const value: number = bytes / Math.pow(1024, index)
  return `${parseFloat(value.toFixed(precision ?? 2))} ${units[index]}`
}

export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

export const fromBase64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'))

/** Unpadded base64url (RFC 4648 §5) of a byte array or of a string's UTF-8 bytes, as used in JWS */
export const toBase64Url = (value: string | Uint8Array): string => Buffer.from(value).toString('base64url')
