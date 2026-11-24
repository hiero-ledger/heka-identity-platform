import { describe, expect, it } from 'vitest'

import { describeCredentialOffer, transactionCodeError } from '../offer-preview'

const resolved = {
  metadata: {
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      display: [{ name: 'Hiero Contributor Identity Issuer' }],
    },
  },
  credentialOfferPayload: {
    credential_configuration_ids: ['GithubContributorCredentialSdJwt'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': 'secret-code',
        tx_code: {
          input_mode: 'numeric',
          length: 8,
          description: 'Enter the code shown on the Heka contributor page.',
        },
      },
    },
  },
  offeredCredentialConfigurations: {
    GithubContributorCredentialSdJwt: {
      vct: 'https://hiero.ledger.org/vct/GithubContributorCredential',
      display: [{ name: 'GitHub Contributor Credential' }],
    },
  },
}

describe('describeCredentialOffer', () => {
  it('shows the issuer and credential before redemption, and the transaction-code rule', () => {
    expect(describeCredentialOffer(resolved)).toEqual({
      issuerName: 'Hiero Contributor Identity Issuer',
      issuerUrl: 'https://issuer.example',
      credentials: [
        {
          name: 'GitHub Contributor Credential',
          type: 'https://hiero.ledger.org/vct/GithubContributorCredential',
        },
      ],
      txCode: {
        length: 8,
        numeric: true,
        description: 'Enter the code shown on the Heka contributor page.',
      },
    })
  })

  it('reads the credential display from OID4VCI 1.0 credential_metadata, preferring English', () => {
    const preview = describeCredentialOffer({
      ...resolved,
      metadata: {
        credentialIssuer: {
          credential_issuer: 'https://issuer.example',
          display: [
            { name: 'Aussteller', locale: 'de' },
            { name: 'Example Issuer', locale: 'en-US' },
          ],
        },
      },
      offeredCredentialConfigurations: {
        GithubContributorCredentialSdJwt: {
          vct: 'https://issuer.example/vct/Membership',
          credential_metadata: {
            display: [
              { name: 'Mitgliedschaft', locale: 'de' },
              {
                name: 'Membership',
                locale: 'en',
                logo: { uri: 'https://issuer.example/logo.png', alt_text: 'Example logo' },
                background_color: '#12107c',
                text_color: '#ffffff',
              },
            ],
          },
        },
      },
    })

    expect(preview.issuerName).toBe('Example Issuer')
    expect(preview.credentials).toEqual([
      {
        name: 'Membership',
        type: 'https://issuer.example/vct/Membership',
        logo: { uri: 'https://issuer.example/logo.png', altText: 'Example logo' },
        backgroundColor: '#12107c',
        textColor: '#ffffff',
      },
    ])
  })

  it('reads the top-level display of draft 14/15 issuers, and falls back to the vct', () => {
    const preview = describeCredentialOffer({
      ...resolved,
      offeredCredentialConfigurations: {
        GithubContributorCredentialSdJwt: {
          vct: 'https://hiero.ledger.org/vct/GithubContributorCredential',
          display: [{ name: 'GitHub Contributor Credential', logo: { url: 'https://issuer.example/old.png' } }],
        },
        Plain: { vct: 'https://issuer.example/vct/Plain' },
      },
      credentialOfferPayload: { ...resolved.credentialOfferPayload, credential_configuration_ids: undefined },
    })

    expect(preview.credentials).toEqual([
      {
        name: 'GitHub Contributor Credential',
        type: 'https://hiero.ledger.org/vct/GithubContributorCredential',
        logo: { uri: 'https://issuer.example/old.png' },
      },
      { name: 'https://issuer.example/vct/Plain', type: 'https://issuer.example/vct/Plain' },
    ])
  })

  it('rejects a transaction code of the wrong length', () => {
    const requirement = describeCredentialOffer(resolved).txCode
    expect(transactionCodeError('1234', requirement)).toMatch(/8-character/)
    expect(transactionCodeError('12345678', requirement)).toBeNull()
    expect(transactionCodeError('abcdefgh', requirement)).toMatch(/digits/)
  })
})
