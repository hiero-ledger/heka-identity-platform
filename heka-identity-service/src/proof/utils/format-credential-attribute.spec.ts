import { formatCredentialAttribute } from './format-credential-attribute'

describe('formatCredentialAttribute', () => {
  describe('primitive types', () => {
    it('should handle string values', () => {
      const result = formatCredentialAttribute('John Doe')
      expect(result).toEqual({ value: 'John Doe' })
    })

    it('should handle number values', () => {
      const result = formatCredentialAttribute(42)
      expect(result).toEqual({ value: 42 })
    })

    it('should handle boolean true', () => {
      const result = formatCredentialAttribute(true)
      expect(result).toEqual({ value: true })
    })

    it('should handle boolean false', () => {
      const result = formatCredentialAttribute(false)
      expect(result).toEqual({ value: false })
    })

    it('should handle null', () => {
      const result = formatCredentialAttribute(null)
      expect(result).toEqual({ value: null })
    })

    it('should handle undefined as null', () => {
      const result = formatCredentialAttribute(undefined)
      expect(result).toEqual({ value: null })
    })
  })

  describe('date handling', () => {
    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      const result = formatCredentialAttribute(date)
      expect(result).toEqual({ value: '2024-01-15T10:30:00.000Z' })
    })

    it('should handle ISO date strings', () => {
      const result = formatCredentialAttribute('2024-01-15T10:30:00.000Z')
      expect(result).toEqual({ value: '2024-01-15T10:30:00.000Z' })
    })

    it('should handle date-only strings', () => {
      const result = formatCredentialAttribute('2024-01-15')
      expect(result).toEqual({ value: '2024-01-15' })
    })
  })

  describe('array handling', () => {
    it('should handle simple string arrays', () => {
      const result = formatCredentialAttribute(['Alice', 'Bob', 'Charlie'])
      expect(result).toEqual({
        value: 'Alice, Bob, Charlie',
        rawValue: ['Alice', 'Bob', 'Charlie'],
      })
    })

    it('should handle simple number arrays', () => {
      const result = formatCredentialAttribute([1, 2, 3])
      expect(result).toEqual({
        value: '1, 2, 3',
        rawValue: [1, 2, 3],
      })
    })

    it('should handle mixed primitive arrays', () => {
      const result = formatCredentialAttribute(['Alice', 42, true])
      expect(result).toEqual({
        value: 'Alice, 42, true',
        rawValue: ['Alice', 42, true],
      })
    })

    it('should handle complex object arrays', () => {
      const complexArray = [{ name: 'Alice' }, { name: 'Bob' }]
      const result = formatCredentialAttribute(complexArray)
      expect(result).toEqual({
        value: 'Array(2)',
        rawValue: complexArray,
      })
    })

    it('should handle empty arrays', () => {
      const result = formatCredentialAttribute([])
      expect(result).toEqual({
        value: '',
        rawValue: [],
      })
    })
  })

  describe('object handling', () => {
    it('should handle small objects', () => {
      const obj = { city: 'New York', country: 'USA' }
      const result = formatCredentialAttribute(obj)
      expect(result).toEqual({
        value: '{ city: New York, country: USA }',
        rawValue: obj,
      })
    })

    it('should handle large objects', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
      const result = formatCredentialAttribute(obj)
      expect(result).toEqual({
        value: 'Object(5 properties)',
        rawValue: obj,
      })
    })

    it('should handle empty objects', () => {
      const obj = {}
      const result = formatCredentialAttribute(obj)
      expect(result).toEqual({
        value: '{}',
        rawValue: obj,
      })
    })

    it('should handle nested objects', () => {
      const obj = {
        address: {
          street: '123 Main St',
          city: 'New York',
        },
      }
      const result = formatCredentialAttribute(obj)
      expect(result.rawValue).toEqual(obj)
      expect(typeof result.value).toBe('string')
    })
  })

  describe('edge cases', () => {
    it('should handle zero', () => {
      const result = formatCredentialAttribute(0)
      expect(result).toEqual({ value: 0 })
    })

    it('should handle empty string', () => {
      const result = formatCredentialAttribute('')
      expect(result).toEqual({ value: '' })
    })

    it('should handle NaN', () => {
      const result = formatCredentialAttribute(NaN)
      expect(result.value).toBe('NaN')
    })

    it('should handle Infinity', () => {
      const result = formatCredentialAttribute(Infinity)
      expect(result.value).toBe(Infinity)
    })
  })

  describe('real-world credential scenarios', () => {
    it('should handle GitHub contributor credential attributes', () => {
      const attributes = {
        githubUsername: 'johndoe',
        githubId: 12345678,
        emailVerified: true,
        contributionCount: 42,
        joinDate: '2020-01-15T00:00:00.000Z',
        repositories: ['repo1', 'repo2', 'repo3'],
        gpgKeyFingerprint: 'ABCD1234EFGH5678',
      }

      const results = Object.entries(attributes).map(([name, value]) => ({
        name,
        ...formatCredentialAttribute(value),
      }))

      expect(results).toEqual([
        { name: 'githubUsername', value: 'johndoe' },
        { name: 'githubId', value: 12345678 },
        { name: 'emailVerified', value: true },
        { name: 'contributionCount', value: 42 },
        { name: 'joinDate', value: '2020-01-15T00:00:00.000Z' },
        {
          name: 'repositories',
          value: 'repo1, repo2, repo3',
          rawValue: ['repo1', 'repo2', 'repo3'],
        },
        { name: 'gpgKeyFingerprint', value: 'ABCD1234EFGH5678' },
      ])
    })
  })
})
