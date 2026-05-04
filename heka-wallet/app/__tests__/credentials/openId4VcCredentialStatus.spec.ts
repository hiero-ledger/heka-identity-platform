import { CredoError } from '@credo-ts/core'
import {
  isOpenId4VcCredentialStatusFailure,
  shouldVerifyOpenId4VcCredentialStatus,
} from '../../src/credentials/openId4VcCredentialStatus'

function sdJwtException(message: string): Error {
  const err = new Error(message)
  err.name = 'SDJWTException'
  return err
}

describe('openId4VcCredentialStatus', () => {
  describe('isOpenId4VcCredentialStatusFailure', () => {
    it('returns true for SD-JWT status list failures from @sd-jwt/utils', () => {
      expect(isOpenId4VcCredentialStatusFailure(sdJwtException('Status is not valid'))).toBe(true)
      expect(isOpenId4VcCredentialStatusFailure(sdJwtException('Status list is expired'))).toBe(true)
    })

    it('returns true when status list HTTP fetch fails (sd-jwt default fetcher)', () => {
      expect(
        isOpenId4VcCredentialStatusFailure(new Error('Error fetching status list: 503 upstream'))
      ).toBe(true)
    })

    it('returns true for Credo W3C JWT / JSON-LD credential status messages', () => {
      expect(
        isOpenId4VcCredentialStatusFailure(new CredoError('Verifying credential status is not supported for JWT VCs'))
      ).toBe(true)
      expect(
        isOpenId4VcCredentialStatusFailure(
          new CredoError('Verifying credential status for JSON-LD credentials is currently not supported')
        )
      ).toBe(true)
    })

    it('returns true for Credo status list HTTP errors (wallet fetcher)', () => {
      expect(
        isOpenId4VcCredentialStatusFailure(
          new CredoError(
            'Received invalid response with status 502 when fetching status list from https://issuer.example/status. body'
          )
        )
      ).toBe(true)
    })

    it('returns true for wrapped Credo OpenID4VCI validation errors', () => {
      expect(
        isOpenId4VcCredentialStatusFailure(
          new CredoError('Failed to validate credential, error = Verifying credential status is not supported for JWT VCs')
        )
      ).toBe(true)
    })

    it('returns true when a matching failure is in the error cause chain', () => {
      const root = new CredoError('outer', { cause: sdJwtException('Status is not valid') })
      expect(isOpenId4VcCredentialStatusFailure(root)).toBe(true)
    })

    it('returns false for unrelated or ambiguous natural-language errors', () => {
      expect(isOpenId4VcCredentialStatusFailure(new Error('Credential has been revoked'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Revocation registry error'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Certificate verification failed'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Network timeout'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Invalid proof of possession'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Status is not valid'))).toBe(false)
    })

    it('returns false for non-errors', () => {
      expect(isOpenId4VcCredentialStatusFailure(null)).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(undefined)).toBe(false)
    })
  })

  describe('shouldVerifyOpenId4VcCredentialStatus', () => {
    it('returns true by default in test environment (no dev-only disable)', () => {
      expect(shouldVerifyOpenId4VcCredentialStatus()).toBe(true)
    })
  })
})
