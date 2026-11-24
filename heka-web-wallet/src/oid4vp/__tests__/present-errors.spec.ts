import { describe, expect, it } from 'vitest'

import { presentErrorMessage } from '../present-errors'

describe('presentErrorMessage', () => {
  it('says when no stored credential matches the request', () => {
    expect(
      presentErrorMessage(
        new Error('Cannot select the credentials for the dcql query presentation if the request cannot be satisfied'),
      ),
    ).toBe('No stored credential matches this request. Receive a GitHub contributor credential, then try again.')
    expect(presentErrorMessage(new Error('Cannot auto-select credentials'))).toBe(
      'No stored credential matches this request. Receive a GitHub contributor credential, then try again.',
    )
  })

  it('says when the holder key is gone', () => {
    expect(presentErrorMessage(new Error("Key with key id 'abc' not found in backend 'webcrypto-browser'"))).toBe(
      'The holder key for this credential is gone. Receive the credential again.',
    )
    expect(presentErrorMessage(new Error('Key abc was not found'))).toBe(
      'The holder key for this credential is gone. Receive the credential again.',
    )
  })

  it('keeps the verifier retry hint for other failures', () => {
    expect(presentErrorMessage(new Error('network down'))).toBe(
      'network down The request is still saved. Retry when the verifier is reachable.',
    )
  })
})
