import { describe, expect, it } from 'vitest'

import { referencesHttps } from '../host-access'

describe('referencesHttps', () => {
  it('detects an HTTPS issuer inside an encoded offer and ignores localhost', () => {
    expect(
      referencesHttps('openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'),
    ).toBe(true)
    expect(
      referencesHttps('openid-credential-offer://?credential_offer_uri=http%3A%2F%2Flocalhost%3A3003%2Foffer'),
    ).toBe(false)
    expect(referencesHttps('https://verifier.example/request')).toBe(true)
  })
})
