import type { TFunction } from 'i18next'

import {
  describePresentationError,
  getPresentationErrorContent,
  parseOauth2ErrorBody,
  PresentationRejectedError,
  toDisplayableErrorMessage,
} from '../../../src/credentials/openid4vc/presentationErrors'

const t = ((key: string) => key) as unknown as TFunction

// What the Heka Identity Service (Credo verifier) answers for a presentation with a revoked SD-JWT VC.
const credoVerificationFailureBody = {
  error: 'invalid_request',
  error_description: 'One or more presentations failed verification.',
}

describe('parseOauth2ErrorBody', () => {
  it('reads error and error_description from a parsed body', () => {
    expect(parseOauth2ErrorBody(credoVerificationFailureBody)).toEqual({
      error: 'invalid_request',
      errorDescription: 'One or more presentations failed verification.',
    })
  })

  it('reads error and error_description from a JSON string body', () => {
    expect(parseOauth2ErrorBody(JSON.stringify(credoVerificationFailureBody))).toEqual({
      error: 'invalid_request',
      errorDescription: 'One or more presentations failed verification.',
    })
  })

  it.each([null, undefined, 'Bad Gateway', '[1,2]', ['invalid_request'], { error: 42 }])(
    'returns no fields for a body without OAuth2 error strings (%p)',
    (body) => {
      expect(parseOauth2ErrorBody(body)).toEqual({ error: undefined, errorDescription: undefined })
    }
  )
})

describe('PresentationRejectedError', () => {
  it('names the status and OAuth2 error code without the response body', () => {
    const error = new PresentationRejectedError({ status: 400, body: credoVerificationFailureBody })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Verifier rejected the presentation (HTTP 400, invalid_request)')
    expect(error.message).not.toMatch(/[{}]/)
    expect(error.oauthError).toBe('invalid_request')
    expect(error.isVerificationFailure).toBe(true)
  })

  it('treats a "failed verification" description as a verification failure whatever the error code', () => {
    const error = new PresentationRejectedError({
      status: 400,
      body: { error: 'vp_formats_not_supported', error_description: 'Presentation failed verification' },
    })

    expect(error.isVerificationFailure).toBe(true)
  })

  it('is not a verification failure for other OAuth2 errors', () => {
    const error = new PresentationRejectedError({ status: 403, body: { error: 'access_denied' } })

    expect(error.isVerificationFailure).toBe(false)
  })
})

describe('getPresentationErrorContent', () => {
  it('explains a rejected presentation instead of showing the verifier response', () => {
    const error = new PresentationRejectedError({ status: 400, body: credoVerificationFailureBody })

    expect(getPresentationErrorContent(error, t)).toEqual({
      title: 'ProofRequest.VerificationFailedTitle',
      message: 'ProofRequest.VerificationFailedMessage',
    })
  })

  it('uses a generic rejection message for other verifier errors', () => {
    const error = new PresentationRejectedError({ status: 500, body: '<html>Internal Server Error</html>' })

    expect(getPresentationErrorContent(error, t)).toEqual({
      title: 'ProofRequest.PresentationRejectedTitle',
      message: 'ProofRequest.PresentationRejectedMessage',
    })
  })

  it('keeps the message of other errors under the 1027 title', () => {
    expect(getPresentationErrorContent(new Error('Requirements from proof request are not satisfied'), t)).toEqual({
      title: 'Error.Title1027',
      message: 'Requirements from proof request are not satisfied',
    })
  })

  it.each([
    `Error while accepting authorization request. ${JSON.stringify(credoVerificationFailureBody)}`,
    'Unexpected token [object Object]',
    '',
    'x'.repeat(301),
  ])('replaces a message that is not plain short text (%p)', (message) => {
    expect(getPresentationErrorContent(new Error(message), t)).toEqual({
      title: 'Error.Title1027',
      message: 'Error.Message1027',
    })
  })

  it('falls back to the generic message for non-Error values', () => {
    expect(getPresentationErrorContent({ error: 'invalid_request' }, t).message).toBe('Error.Message1027')
  })
})

describe('toDisplayableErrorMessage', () => {
  it('trims plain text', () => {
    expect(toDisplayableErrorMessage('  Network request failed ', 'fallback')).toBe('Network request failed')
  })
})

describe('describePresentationError', () => {
  it('logs the OAuth2 fields only', () => {
    const error = new PresentationRejectedError({
      status: 400,
      body: { ...credoVerificationFailureBody, vp_token: 'eyJhbGciOi.secret~disclosure~' },
    })

    const details = describePresentationError(error)

    expect(details).toEqual({
      name: 'PresentationRejectedError',
      status: 400,
      oauthError: 'invalid_request',
      oauthErrorDescription: 'One or more presentations failed verification.',
    })
    expect(JSON.stringify(details)).not.toContain('eyJhbGciOi')
  })

  it('logs name and message of other errors', () => {
    expect(describePresentationError(new TypeError('Network request failed'))).toEqual({
      name: 'TypeError',
      message: 'Network request failed',
    })
  })
})
