import { ClaimFormat, SdJwtVcRecord, type DcqlCredentialsForRequest } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import type { ResolvedPresentationRequest } from '../present'
import { describePresentation } from '../presentation-preview'

type Resolved = Pick<ResolvedPresentationRequest, 'origin' | 'verifier' | 'authorizationRequestPayload'>

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
// A stored record, as DCQL selects it: its tags come from the compact SD-JWT VC (only decoded here).
const record = new SdJwtVcRecord({
  credentialInstances: [
    {
      compactSdJwtVc: `${part({ alg: 'EdDSA', typ: 'dc+sd-jwt' })}.${part({ vct: 'GitHub Contributor', iss: 'did:key:z6Mkissuer', _sd_alg: 'sha-256' })}.c2ln~`,
    },
  ],
})

// Keyed by the DCQL query id, which names the request's slot, not the credential
const selected = {
  contributor: [
    {
      claimFormat: ClaimFormat.SdJwtDc,
      credentialRecord: record,
      disclosedPayload: { githubAccountId: '4115704', githubUsername: 'ada' },
    },
  ],
} as unknown as DcqlCredentialsForRequest

describe('describePresentation', () => {
  it('names the verifier, where the response goes, the credential, and disclosed claims', () => {
    const resolved = {
      origin: 'https://verifier.example',
      verifier: { clientIdPrefix: 'redirect_uri', effectiveClientId: 'https://verifier.example/callback' },
      authorizationRequestPayload: {
        client_id: 'redirect_uri:https://verifier.example/callback',
        response_uri: 'https://verifier.example/callback',
        client_metadata: { client_name: 'Hiero PR check' },
      },
    } as unknown as Resolved

    expect(describePresentation(resolved, selected)).toEqual({
      verifier: 'https://verifier.example/callback',
      clientIdPrefix: 'redirect_uri',
      // Unsigned: the client id is only where the response goes
      clientIdVerified: false,
      responseOrigin: 'https://verifier.example',
      selfDeclaredName: 'Hiero PR check',
      origin: 'https://verifier.example',
      credentials: [{ name: 'GitHub Contributor', claims: ['githubAccountId', 'githubUsername'] }],
    })
  })

  it('does not let the request-supplied name stand in for the verifier', () => {
    const resolved = {
      // Credo 0.7.4's effective client id for an OpenID4VP 1.0 request, prefix included
      verifier: {
        clientIdPrefix: 'decentralized_identifier',
        effectiveClientId: 'decentralized_identifier:did:key:z6Mkverifier',
      },
      authorizationRequestPayload: {
        client_id: 'decentralized_identifier:did:key:z6Mkverifier',
        response_uri: 'https://elsewhere.example/post',
        client_metadata: { client_name: 'Heka' },
      },
    } as unknown as Resolved

    const preview = describePresentation(resolved, selected)

    expect(preview.verifier).toBe('did:key:z6Mkverifier')
    expect(preview.clientIdPrefix).toBe('decentralized_identifier')
    expect(preview.clientIdVerified).toBe(true)
    expect(preview.responseOrigin).toBe('https://elsewhere.example')
    expect(preview.selfDeclaredName).toBe('Heka')
  })

  it('leaves out a missing or malformed response_uri, an empty name, and an origin the request does not carry', () => {
    const resolved = {
      verifier: { clientIdPrefix: 'redirect_uri', effectiveClientId: 'https://verifier.example' },
      authorizationRequestPayload: { response_uri: 'not a url', client_metadata: { client_name: '' } },
    } as unknown as Resolved

    expect(describePresentation(resolved, selected)).toMatchObject({
      verifier: 'https://verifier.example',
      responseOrigin: null,
      selfDeclaredName: null,
      // Only a Digital Credentials API request carries one; a request opened from a URI has none
      origin: null,
    })
    expect(describePresentation({ ...resolved, origin: '' }, selected).origin).toBeNull()
  })

  it('counts the client id as verified only for a prefix that binds it to the request signature', () => {
    const verified = (clientIdPrefix: string) =>
      describePresentation(
        {
          verifier: { clientIdPrefix, effectiveClientId: `${clientIdPrefix}:verifier.example` },
          authorizationRequestPayload: {},
        } as unknown as Resolved,
        selected,
      ).clientIdVerified

    expect(['decentralized_identifier', 'x509_san_dns', 'x509_hash'].map(verified)).toEqual([true, true, true])
    expect(['redirect_uri', 'origin'].map(verified)).toEqual([false, false])
  })
})
