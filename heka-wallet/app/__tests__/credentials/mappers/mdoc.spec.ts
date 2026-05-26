import { Mdoc, MdocNameSpaces } from '@credo-ts/core'

// Mock the Attribute constructor before importing
jest.mock('@hyperledger/aries-oca/build/legacy', () => ({
  Attribute: jest.fn().mockImplementation(({ name, value }) => ({ name, value })),
}))

// Import the mocked Attribute and the function to test
import { Attribute } from '@hyperledger/aries-oca/build/legacy'
import { getAttributesAndMetadataForMdocPayload } from '../../../src/credentials/mappers/mdoc'

const mockAttribute = Attribute as jest.MockedFunction<any>

describe('getAttributesAndMetadataForMdocPayload', () => {
  const mockMdocInstance: Mdoc = {
    docType: 'org.iso.18013.5.1.mDL',
    validityInfo: {
      signed: new Date('2024-01-01T00:00:00Z'),
      validFrom: new Date('2024-01-01T00:00:00Z'),
      validUntil: new Date('2024-12-31T23:59:59Z'),
    },
  } as Mdoc

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('attribute processing', () => {
    it('should handle string values correctly', () => {
      const namespaces: MdocNameSpaces = {
        'org.iso.18013.5.1': {
          given_name: 'John',
          family_name: 'Doe',
        },
      }

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(2)
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'given_name', value: 'John' })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'family_name', value: 'Doe' })
    })

    it('should handle number values correctly', () => {
      const namespaces: MdocNameSpaces = {
        'org.iso.18013.5.1': {
          age_over_18: 1,
          birth_year: 1990,
        },
      }

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(2)
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'age_over_18', value: 1 })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'birth_year', value: 1990 })
    })

    it('should handle complex values by converting to JSON', () => {
      const namespaces: MdocNameSpaces = {
        'org.iso.18013.5.1': {
          birth_date: { year: 1990, month: 5, day: 15 },
          driving_privileges: [
            { vehicle_category_code: 'A', issue_date: '2020-01-01' },
            { vehicle_category_code: 'B', issue_date: '2020-01-01' },
          ],
          is_verified: true,
        },
      }

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(3)
      expect(mockAttribute).toHaveBeenCalledWith({
        name: 'birth_date',
        value: '{"year":1990,"month":5,"day":15}',
      })
      expect(mockAttribute).toHaveBeenCalledWith({
        name: 'driving_privileges',
        value: '[{"vehicle_category_code":"A","issue_date":"2020-01-01"},{"vehicle_category_code":"B","issue_date":"2020-01-01"}]',
      })
      expect(mockAttribute).toHaveBeenCalledWith({
        name: 'is_verified',
        value: 'true',
      })
    })

    it('should handle multiple namespaces', () => {
      const namespaces: MdocNameSpaces = {
        'org.iso.18013.5.1': {
          given_name: 'John',
          family_name: 'Doe',
        },
        'org.example.custom': {
          employee_id: 'EMP123',
          department: 'Engineering',
        },
      }

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(4)
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'given_name', value: 'John' })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'family_name', value: 'Doe' })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'employee_id', value: 'EMP123' })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'department', value: 'Engineering' })
    })

    it('should handle empty namespaces', () => {
      const namespaces: MdocNameSpaces = {}

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(0)
    })

    it('should handle null and undefined values', () => {
      const namespaces: MdocNameSpaces = {
        'org.iso.18013.5.1': {
          optional_field: null,
          undefined_field: undefined,
        },
      }

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.attributes).toHaveLength(2)
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'optional_field', value: 'null' })
      expect(mockAttribute).toHaveBeenCalledWith({ name: 'undefined_field', value: undefined })
    })
  })

  describe('metadata processing with valid dates', () => {
    it('should create metadata with valid dates', () => {
      const namespaces: MdocNameSpaces = {}

      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocInstance)

      expect(result.metadata).toEqual({
        type: 'org.iso.18013.5.1.mDL',
        holder: undefined,
        issuedAt: '2024-01-01T00:00:00.000Z',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2024-12-31T23:59:59.000Z',
      })
    })

    it('should handle missing docType', () => {
      const mockMdocWithoutDocType = {
        docType: undefined,
        validityInfo: {
          signed: new Date('2024-01-01T00:00:00Z'),
          validFrom: new Date('2024-01-01T00:00:00Z'),
          validUntil: new Date('2024-12-31T23:59:59Z'),
        },
      } as unknown as Mdoc

      const namespaces: MdocNameSpaces = {}
      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocWithoutDocType)

      expect(result.metadata.type).toBeUndefined()
    })
  })

  describe('error handling for invalid dates (safeToISOString function)', () => {
    it('should handle invalid validFrom date gracefully', () => {
      const mockMdocWithInvalidValidFrom = {
        docType: 'org.iso.18013.5.1.mDL',
        validityInfo: {
          signed: new Date('2024-01-01T00:00:00Z'),
          validFrom: new Date('invalid-date'),
          validUntil: new Date('2024-12-31T23:59:59Z'),
        },
      } as Mdoc

      const namespaces: MdocNameSpaces = {}
      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocWithInvalidValidFrom)

      expect(result.metadata).toEqual({
        type: 'org.iso.18013.5.1.mDL',
        holder: undefined,
        issuedAt: '2024-01-01T00:00:00.000Z',
        validFrom: undefined,
        validUntil: '2024-12-31T23:59:59.000Z',
      })
    })

    it('should handle invalid validUntil date gracefully', () => {
      const mockMdocWithInvalidValidUntil = {
        docType: 'org.iso.18013.5.1.mDL',
        validityInfo: {
          signed: new Date('2024-01-01T00:00:00Z'),
          validFrom: new Date('2024-01-01T00:00:00Z'),
          validUntil: new Date('invalid-date'),
        },
      } as Mdoc

      const namespaces: MdocNameSpaces = {}
      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocWithInvalidValidUntil)

      expect(result.metadata).toEqual({
        type: 'org.iso.18013.5.1.mDL',
        holder: undefined,
        issuedAt: '2024-01-01T00:00:00.000Z',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: undefined,
      })
    })

    it('should handle invalid signed date with fallback to "Unknown"', () => {
      const mockMdocWithInvalidSigned = {
        docType: 'org.iso.18013.5.1.mDL',
        validityInfo: {
          signed: new Date('invalid-date'),
          validFrom: new Date('2024-01-01T00:00:00Z'),
          validUntil: new Date('2024-12-31T23:59:59Z'),
        },
      } as Mdoc

      const namespaces: MdocNameSpaces = {}
      const result = getAttributesAndMetadataForMdocPayload(namespaces, mockMdocWithInvalidSigned)

      expect(result.metadata).toEqual({
        type: 'org.iso.18013.5.1.mDL',
        holder: undefined,
        issuedAt: 'Unknown',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2024-12-31T23:59:59.000Z',
      })
    })
  })
})