import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  grantableOrigin,
  missingHostAccess,
  offerAcceptOrigins,
  presentationOrigins,
  requestHostAccess,
  reviewOrigins,
} from '../host-access'

const offerUri = (query: Record<string, string>) => `openid-credential-offer://?${new URLSearchParams(query)}`

describe('the origins each step contacts', () => {
  it('reviews an offer by reference on the origin of its credential_offer_uri', () => {
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'https://issuer.example/offers/42' }))).toEqual([
      'https://issuer.example',
    ])
  })

  it('reviews an offer by value on its credential_issuer, and a request on its request_uri', () => {
    const inline = JSON.stringify({ credential_issuer: 'https://issuer.example/oid4vci/1' })
    expect(reviewOrigins(offerUri({ credential_offer: inline }))).toEqual(['https://issuer.example'])
    expect(reviewOrigins('openid4vp://?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Fr%2F7')).toEqual([
      'https://verifier.example',
    ])
  })

  it('names an https issuer behind an http offer URI only at accept, with an authorization server elsewhere', () => {
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'http://localhost:3000/offers/42' }))).toEqual([
      'http://localhost:3000',
    ])
    const resolved = {
      metadata: {
        credentialIssuer: {
          credential_issuer: 'https://issuer.example',
          credential_endpoint: 'https://issuer.example/credential',
          nonce_endpoint: 'https://issuer.example/nonce',
        },
        authorizationServers: [{ issuer: 'https://auth.example', token_endpoint: 'https://token.auth.example/token' }],
      },
    }
    expect(offerAcceptOrigins(resolved)).toEqual([
      'https://issuer.example',
      'https://auth.example',
      'https://token.auth.example',
    ])
  })

  it('presents to the origin of response_uri', () => {
    expect(
      presentationOrigins({ authorizationRequestPayload: { response_uri: 'https://verifier.example/post' } }),
    ).toEqual(['https://verifier.example'])
    expect(presentationOrigins({ authorizationRequestPayload: {} })).toEqual([])
  })

  it('leaves out what the manifest cannot grant: plain http hosts and other schemes', () => {
    expect(grantableOrigin('http://issuer.example/offer')).toBeNull()
    expect(grantableOrigin('http://127.0.0.1:3000/offer')).toBe('http://127.0.0.1:3000')
    expect(grantableOrigin('openid-credential-offer://?x=1')).toBeNull()
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'http://issuer.example/offers/42' }))).toEqual([])
  })

  it('never yields a wildcard or a host a match pattern cannot name', () => {
    // new URL('https://*/token').origin is 'https://*', whose pattern would be every https site
    expect(grantableOrigin('https://*/token')).toBeNull()
    expect(grantableOrigin('https://*.example.com/token')).toBeNull()
    // The URL parser decodes %2A: the host is exa*mple.com, which permissions.request refuses
    expect(grantableOrigin('https://exa%2Ample.com/token')).toBeNull()
    for (const url of ['https://ex!ample.com', 'https://a_b.example', 'https://-x.example', 'https://example.com./']) {
      expect(grantableOrigin(url)).toBeNull()
    }
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'https://*/offers/42' }))).toEqual([])
    expect(
      offerAcceptOrigins({
        metadata: {
          credentialIssuer: {
            credential_issuer: 'https://issuer.example',
            credential_endpoint: 'https://*/credential',
          },
          authorizationServers: [{ issuer: 'https://exa%2Ample.com', token_endpoint: 'https://*/token' }],
        },
      }),
    ).toEqual(['https://issuer.example'])
    expect(presentationOrigins({ authorizationRequestPayload: { response_uri: 'https://*/post' } })).toEqual([])
  })

  it('takes IDNs as punycode and IPv4 addresses, and refuses IPv6 literals', () => {
    expect(grantableOrigin('https://bücher.example/offers/1')).toBe('https://xn--bcher-kva.example')
    expect(grantableOrigin('https://Issuer.Example:8443/offers/1')).toBe('https://issuer.example:8443')
    expect(grantableOrigin('https://192.0.2.10/offers/1')).toBe('https://192.0.2.10')
    expect(grantableOrigin('http://0x7f.1:3000/offers/1')).toBe('http://127.0.0.1:3000')
    expect(grantableOrigin('http://localhost:3000/offers/1')).toBe('http://localhost:3000')
    expect(grantableOrigin('https://[2001:db8::1]/offers/1')).toBeNull()
    expect(grantableOrigin('http://[::1]:3000/offers/1')).toBeNull()
  })
})

describe('asking for host access', () => {
  const granted = new Set<string>()
  const request = vi.fn()

  beforeEach(() => {
    granted.clear()
    request.mockReset()
    vi.stubGlobal('chrome', {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin)),
        request,
      },
    })
  })

  it('asks only for the origins not granted yet', async () => {
    granted.add('https://issuer.example/*')
    request.mockResolvedValue(true)

    expect(await missingHostAccess(['https://issuer.example', 'https://auth.example'])).toEqual([
      'https://auth.example',
    ])
    expect(await requestHostAccess(['https://issuer.example', 'https://auth.example'])).toEqual([])
    expect(request).toHaveBeenCalledWith({ origins: ['https://auth.example/*'] })
  })

  it('does not ask when everything is granted, and returns the origins the holder refused', async () => {
    granted.add('https://issuer.example/*')
    expect(await requestHostAccess(['https://issuer.example'])).toEqual([])
    expect(request).not.toHaveBeenCalled()

    request.mockResolvedValue(false)
    expect(await requestHostAccess(['https://verifier.example'])).toEqual(['https://verifier.example'])
  })
})
