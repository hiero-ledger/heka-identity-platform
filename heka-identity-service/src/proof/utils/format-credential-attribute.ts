/**
 * Formats a credential attribute value to a supported type
 * Handles primitives (string, number, boolean, null) and complex types (arrays, objects, dates)
 *
 * @param value - The raw attribute value from a credential
 * @returns Formatted value and optional raw value for complex types
 */
export function formatCredentialAttribute(value: unknown): {
  value: string | number | boolean | null
  rawValue?: unknown
} {
  // Handle null and undefined
  if (value === null) {
    return { value: null }
  }

  if (value === undefined) {
    return { value: null }
  }

  // Handle primitives directly
  if (typeof value === 'string') {
    return { value }
  }

  if (typeof value === 'number') {
    // Handle NaN specially - convert to string for consistency
    if (Number.isNaN(value)) {
      return { value: 'NaN' }
    }
    return { value }
  }

  if (typeof value === 'boolean') {
    return { value }
  }

  // Handle Date objects - convert to ISO string
  if (value instanceof Date) {
    return { value: value.toISOString() }
  }

  // Handle date strings (ISO 8601 format)
  if (typeof value === 'string' && isISODateString(value)) {
    return { value }
  }

  // Handle arrays - store raw value and create readable string
  if (Array.isArray(value)) {
    // For simple arrays of primitives, create a comma-separated string
    if (value.every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
      return {
        value: value.join(', '),
        rawValue: value,
      }
    }

    // For complex arrays, store raw and provide count
    return {
      value: `Array(${value.length})`,
      rawValue: value,
    }
  }

  // Handle objects - store raw value and create readable string
  if (typeof value === 'object') {
    try {
      // Try to create a readable representation
      const keys = Object.keys(value)
      if (keys.length === 0) {
        return { value: '{}', rawValue: value }
      }

      // For small objects, create a readable string
      if (keys.length <= 3) {
        const pairs = keys.map((key) => `${key}: ${(value as Record<string, unknown>)[key]}`)
        return {
          value: `{ ${pairs.join(', ')} }`,
          rawValue: value,
        }
      }

      // For larger objects, just indicate it's an object
      return {
        value: `Object(${keys.length} properties)`,
        rawValue: value,
      }
    } catch {
      return {
        value: '[Complex Object]',
        rawValue: value,
      }
    }
  }

  // Fallback for any other type
  return {
    value: String(value),
    rawValue: value,
  }
}

/**
 * Checks if a string is in ISO 8601 date format
 */
function isISODateString(value: string): boolean {
  // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DD
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
  return isoDateRegex.test(value)
}
