import { ClaimFormat, type DcqlCredentialsForRequest } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import type { ResolvedPresentationRequest } from '../present'
import { describePresentation } from '../presentation-preview'

type Resolved = Pick<ResolvedPresentationRequest, 'origin' | 'verifier' | 'authorizationRequestPayload'>

const selected = {
  github: [
    {
      claimFormat: ClaimFormat.SdJwtDc,
      credentialRecord: { tags: { vct: 'GithubContributorCredential' } },
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
      responseOrigin: 'https://verifier.example',
      selfDeclaredName: 'Hiero PR check',
      origin: 'https://verifier.example',
      credentials: [{ name: 'GithubContributorCredential', claims: ['githubAccountId', 'githubUsername'] }],
    })
  })

  it('does not let the request-supplied name stand in for the verifier', () => {
    const resolved = {
      verifier: { clientIdPrefix: 'decentralized_identifier', effectiveClientId: 'did:key:z6Mkverifier' },
      authorizationRequestPayload: {
        client_id: 'decentralized_identifier:did:key:z6Mkverifier',
        response_uri: 'https://elsewhere.example/post',
        client_metadata: { client_name: 'Heka' },
      },
    } as unknown as Resolved

    const preview = describePresentation(resolved, selected)

    expect(preview.verifier).toBe('did:key:z6Mkverifier')
    expect(preview.responseOrigin).toBe('https://elsewhere.example')
    expect(preview.selfDeclaredName).toBe('Heka')
  })

  it('leaves out a missing or malformed response_uri and an empty name', () => {
    const resolved = {
      verifier: { clientIdPrefix: 'redirect_uri', effectiveClientId: 'https://verifier.example' },
      authorizationRequestPayload: { response_uri: 'not a url', client_metadata: { client_name: '' } },
    } as unknown as Resolved

    expect(describePresentation(resolved, selected)).toMatchObject({
      verifier: 'https://verifier.example',
      responseOrigin: null,
      selfDeclaredName: null,
      origin: 'Origin not provided',
    })
  })
})
