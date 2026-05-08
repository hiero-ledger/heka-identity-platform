import { UnauthorizedException } from '@nestjs/common'
import { IncomingMessage } from 'http'

import { extractTokenFromRequest } from '../../src/oauth/guards/bearer.guard'

function createRequest(headers: Record<string, string | undefined> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

describe('extractTokenFromRequest', () => {
  it('should extract token from valid Bearer header', () => {
    const request = createRequest({ authorization: 'Bearer valid-jwt-token' })

    const token = extractTokenFromRequest(request)

    expect(token).toBe('valid-jwt-token')
  })

  it('should be case-insensitive for auth type', () => {
    const request = createRequest({ authorization: 'bearer my-token' })

    const token = extractTokenFromRequest(request)

    expect(token).toBe('my-token')
  })

  it('should handle multiple spaces between type and token', () => {
    const request = createRequest({ authorization: 'Bearer   spaced-token' })

    const token = extractTokenFromRequest(request)

    expect(token).toBe('spaced-token')
  })

  it('should throw UnauthorizedException when Authorization header is missing', () => {
    const request = createRequest({})

    expect(() => extractTokenFromRequest(request)).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException for wrong auth type', () => {
    const request = createRequest({ authorization: 'Basic credentials' })

    expect(() => extractTokenFromRequest(request)).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException when token is missing after Bearer', () => {
    const request = createRequest({ authorization: 'Bearer' })

    expect(() => extractTokenFromRequest(request)).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException for malformed header without space', () => {
    const request = createRequest({ authorization: 'BearerTokenOnly' })

    expect(() => extractTokenFromRequest(request)).toThrow(UnauthorizedException)
  })
  it('should throw UnauthorizedException when Authorization header is an array', () => {
  const request = { headers: { authorization: ['Bearer token1', 'Bearer token2'] } } as unknown as IncomingMessage
  expect(() => extractTokenFromRequest(request)).toThrow(UnauthorizedException)
})
})
