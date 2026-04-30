import { Attribute } from '@hyperledger/aries-oca/build/legacy'

import { W3cCredentialJson, W3cCredentialSubjectJson } from '../../../src/credentials/types'

// Mock all the dependencies that cause issues in test environment
jest.mock('@heka-wallet/shared', () => ({
  getHostNameFromUrl: jest.fn(),
  sanitizeString: jest.fn((str) => str),
}))

jest.mock('@hyperledger/aries-bifold-core', () => ({
  BifoldAgent: jest.fn(),
}))

jest.mock('@hyperledger/aries-bifold-core/App/localization', () => ({
  i18n: { language: 'en' },
}))

jest.mock('@hyperledger/aries-bifold-core/App/utils/credential', () => ({
  getCredentialIdentifiers: jest.fn(),
}))

jest.mock('@hyperledger/aries-oca', () => ({
  BrandingOverlay: jest.fn(),
}))

jest.mock('@hyperledger/aries-oca/build/legacy', () => ({
  Attribute: jest.fn().mockImplementation(({ name, value }) => ({ name, value })),
  BrandingOverlayType: { Branding10: 'branding10' },
  CredentialOverlay: jest.fn(),
  RemoteOCABundleResolver: jest.fn(),
}))

jest.mock('@sphereon/oid4vci-common', () => ({}))

jest.mock('../../../src/config', () => ({
  agencyProviderURL: 'https://test.example.com',
  fallbackDisplay: {
    credential: { color: '#000000', logo: 'test-logo.png' },
    issuer: { color: '#ffffff', logo: 'issuer-logo.png' },
  },
}))

// Import after mocking
import { getW3cCredentialDisplay } from '../../../src/credentials/mappers/credential-display'

describe('getW3cCredentialDisplay', () => {
  const mockCredentialSingleSubject: W3cCredentialJson = {
    type: ['VerifiableCredential', 'GitHubContributorCredential'],
    issuer: { id: 'did:example:issuer' },
    issuanceDate: '2024-01-01T00:00:00Z',
    credentialSubject: {
      id: 'did:example:subject',
      name: 'John Doe',
      email: 'john@example.com',
      githubId: 12345,
      verified: true,
    },
  }

  const mockCredentialMultipleSubjects: W3cCredentialJson = {
    type: ['VerifiableCredential', 'TeamCredential'],
    issuer: { id: 'did:example:issuer' },
    issuanceDate: '2024-01-01T00:00:00Z',
    credentialSubject: [
      {
        id: 'did:example:subject1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'Developer',
      },
      {
        id: 'did:example:subject2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'Designer',
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('single subject credential', () => {
    it('should process single subject without prefix', () => {
      const result = getW3cCredentialDisplay(mockCredentialSingleSubject)

      expect(result.attributes).toHaveLength(4) // name, email, githubId, verified (id is skipped)
      expect(Attribute).toHaveBeenCalledWith({ name: 'name', value: 'John Doe' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'email', value: 'john@example.com' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'githubId', value: 12345 })
      expect(Attribute).toHaveBeenCalledWith({ name: 'verified', value: 'true' }) // Boolean converted to string

      // Verify 'id' field is not included
      expect(Attribute).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'id' })
      )
    })

    it('should handle different data types correctly', () => {
      const credentialWithMixedTypes: W3cCredentialJson = {
        ...mockCredentialSingleSubject,
        credentialSubject: {
          id: 'did:example:subject',
          stringValue: 'test string',
          numberValue: 42,
          booleanValue: true,
          objectValue: { nested: 'value' },
          arrayValue: [1, 2, 3],
        },
      }

      const result = getW3cCredentialDisplay(credentialWithMixedTypes)

      expect(Attribute).toHaveBeenCalledWith({ name: 'stringValue', value: 'test string' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'numberValue', value: 42 })
      expect(Attribute).toHaveBeenCalledWith({ name: 'booleanValue', value: 'true' }) // Boolean converted to string
      expect(Attribute).toHaveBeenCalledWith({ name: 'objectValue', value: '{"nested":"value"}' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'arrayValue', value: '[1,2,3]' })
    })
  })

  describe('multiple subjects credential', () => {
    it('should process all subjects with prefixes', () => {
      const result = getW3cCredentialDisplay(mockCredentialMultipleSubjects)

      expect(result.attributes).toHaveLength(6) // 3 attributes × 2 subjects (id is skipped)

      // First subject attributes with prefix
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 1 - name', value: 'John Doe' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 1 - email', value: 'john@example.com' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 1 - role', value: 'Developer' })

      // Second subject attributes with prefix
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 2 - name', value: 'Jane Smith' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 2 - email', value: 'jane@example.com' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'Subject 2 - role', value: 'Designer' })

      // Verify 'id' fields are not included
      expect(Attribute).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: expect.stringContaining('id') })
      )
    })

    it('should handle single subject in array format without prefix', () => {
      const credentialSingleInArray: W3cCredentialJson = {
        ...mockCredentialSingleSubject,
        credentialSubject: [mockCredentialSingleSubject.credentialSubject as W3cCredentialSubjectJson],
      }

      const result = getW3cCredentialDisplay(credentialSingleInArray)

      // Should NOT add prefix for single subject even if it's in an array
      expect(result.attributes).toHaveLength(4)
      expect(Attribute).toHaveBeenCalledWith({ name: 'name', value: 'John Doe' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'email', value: 'john@example.com' })
      expect(Attribute).toHaveBeenCalledWith({ name: 'githubId', value: 12345 })
      expect(Attribute).toHaveBeenCalledWith({ name: 'verified', value: 'true' }) // Boolean converted to string
    })
  })

  describe('edge cases', () => {
    it('should handle empty subjects array', () => {
      const credentialWithEmptySubjects: W3cCredentialJson = {
        ...mockCredentialSingleSubject,
        credentialSubject: [],
      }

      const result = getW3cCredentialDisplay(credentialWithEmptySubjects)

      expect(result.attributes).toHaveLength(0)
    })

    it('should handle subjects with only id field', () => {
      const credentialWithIdOnly: W3cCredentialJson = {
        ...mockCredentialSingleSubject,
        credentialSubject: [
          { id: 'did:example:subject1' },
          { id: 'did:example:subject2' },
        ],
      }

      const result = getW3cCredentialDisplay(credentialWithIdOnly)

      // Should have no attributes since only 'id' fields are present and they're filtered out
      expect(result.attributes).toHaveLength(0)
    })
  })
})