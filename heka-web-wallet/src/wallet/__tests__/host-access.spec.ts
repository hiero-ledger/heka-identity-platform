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
const allowed = (...origins: string[]) => ({ origins, refused: [] })

describe('the origins each step contacts', () => {
  it('reviews an offer by reference on the origin of its credential_offer_uri', () => {
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'https://issuer.example/offers/42' }))).toEqual(
      allowed('https://issuer.example'),
    )
  })

  it('reviews an offer by value on its credential_issuer, and a request on its request_uri', () => {
    const inline = JSON.stringify({ credential_issuer: 'https://issuer.example/oid4vci/1' })
    expect(reviewOrigins(offerUri({ credential_offer: inline }))).toEqual(allowed('https://issuer.example'))
    expect(reviewOrigins('openid4vp://?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Fr%2F7')).toEqual(
      allowed('https://verifier.example'),
    )
  })

  it('names an https issuer behind an http offer URI only at accept, with an authorization server elsewhere', () => {
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'http://localhost:3000/offers/42' }))).toEqual(
      allowed('http://localhost:3000'),
    )
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
    expect(offerAcceptOrigins(resolved)).toEqual(
      allowed('https://issuer.example', 'https://auth.example', 'https://token.auth.example'),
    )
  })

  it('presents to the origin of response_uri', () => {
    expect(
      presentationOrigins({ authorizationRequestPayload: { response_uri: 'https://verifier.example/post' } }),
    ).toEqual(allowed('https://verifier.example'))
  })

  it('counts a missing or empty field, and a custom-scheme item URI, as no URL', () => {
    expect(presentationOrigins({ authorizationRequestPayload: {} })).toEqual(allowed())
    expect(presentationOrigins({ authorizationRequestPayload: { response_uri: '' } })).toEqual(allowed())
    expect(offerAcceptOrigins({ metadata: { credentialIssuer: { credential_issuer: null } } })).toEqual(allowed())
    expect(reviewOrigins('openid4vp://?client_id=x&request=eyJ')).toEqual(allowed())
    expect(reviewOrigins(offerUri({ credential_offer_uri: '' }))).toEqual(allowed())
  })

  it('refuses what the manifest cannot grant: plain http hosts and other schemes', () => {
    expect(grantableOrigin('http://issuer.example/offer')).toBeNull()
    expect(grantableOrigin('http://127.0.0.1:3000/offer')).toBe('http://127.0.0.1:3000')
    expect(grantableOrigin('openid-credential-offer://?x=1')).toBeNull()
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'http://issuer.example/offers/42' }))).toEqual({
      origins: [],
      refused: ['http://issuer.example/offers/42'],
    })
    expect(reviewOrigins('http://wallet.example/?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fo')).toEqual({
      origins: ['https://issuer.example'],
      refused: ['http://wallet.example/?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fo'],
    })
    expect(
      presentationOrigins({ authorizationRequestPayload: { response_uri: 'ftp://verifier.example/post' } }),
    ).toEqual({ origins: [], refused: ['ftp://verifier.example/post'] })
  })

  it('never yields a wildcard or a host a match pattern cannot name, and reports such URLs', () => {
    // new URL('https://*/token').origin is 'https://*', whose pattern would be every https site
    expect(grantableOrigin('https://*/token')).toBeNull()
    expect(grantableOrigin('https://*.example.com/token')).toBeNull()
    // The URL parser decodes %2A: the host is exa*mple.com, which permissions.request refuses
    expect(grantableOrigin('https://exa%2Ample.com/token')).toBeNull()
    for (const url of ['https://ex!ample.com', 'https://a_b.example', 'https://-x.example', 'https://example.com./']) {
      expect(grantableOrigin(url)).toBeNull()
    }
    expect(reviewOrigins(offerUri({ credential_offer_uri: 'https://*/offers/42' }))).toEqual({
      origins: [],
      refused: ['https://*/offers/42'],
    })
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
    ).toEqual({
      origins: ['https://issuer.example'],
      refused: ['https://*/credential', 'https://exa%2Ample.com', 'https://*/token'],
    })
    expect(presentationOrigins({ authorizationRequestPayload: { response_uri: 'https://a_b.example/post' } })).toEqual({
      origins: [],
      refused: ['https://a_b.example/post'],
    })
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
