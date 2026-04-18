import {
  isOpenId4VcCredentialStatusFailure,
  shouldVerifyOpenId4VcCredentialStatus,
} from '../../src/credentials/openId4VcCredentialStatus'

describe('openId4VcCredentialStatus', () => {
  describe('isOpenId4VcCredentialStatusFailure', () => {
    it('returns true when message indicates revocation', () => {
      expect(isOpenId4VcCredentialStatusFailure(new Error('Credential has been revoked'))).toBe(true)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Revocation registry error'))).toBe(true)
    })

    it('returns true for status list / verification failures', () => {
      expect(isOpenId4VcCredentialStatusFailure(new Error('Status list fetch failed'))).toBe(true)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Credential status verification failed'))).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isOpenId4VcCredentialStatusFailure(new Error('Network timeout'))).toBe(false)
      expect(isOpenId4VcCredentialStatusFailure(new Error('Invalid proof of possession'))).toBe(false)
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
