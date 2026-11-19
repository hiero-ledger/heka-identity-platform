import { fromBase64, toBase64, toBase64Url } from '..'

describe('base64 helpers', () => {
  const bytes = Uint8Array.from([0xfb, 0xff, 0x01, 0x00])

  test('toBase64 and fromBase64 round-trip bytes', () => {
    expect(toBase64(bytes)).toBe('+/8BAA==')
    expect(fromBase64('+/8BAA==')).toEqual(bytes)
  })

  test('toBase64Url is unpadded and URL-safe', () => {
    expect(toBase64Url(bytes)).toBe('-_8BAA')
  })

  test('toBase64Url encodes a string as its UTF-8 bytes', () => {
    expect(toBase64Url('{"alg":"ES256"}')).toBe('eyJhbGciOiJFUzI1NiJ9')
    expect(toBase64Url('ü')).toBe('w7w')
  })
})
