import { Mdoc, MdocNameSpaces } from '@credo-ts/core'
import { Attribute } from '@hyperledger/aries-oca/build/legacy'

export function getAttributesAndMetadataForMdocPayload(namespaces: MdocNameSpaces, mdocInstance: Mdoc) {
  const attributes = Object.values(namespaces).flatMap((namespaceMap) =>
    Object.entries(namespaceMap).map(([key, rawValue]) => {
      // Handle different value types properly
      let value: string | number

      if (typeof rawValue === 'string' || typeof rawValue === 'number') {
        value = rawValue
      } else {
        // Convert complex types to JSON string representation
        value = JSON.stringify(rawValue)
      }

      return new Attribute({ name: key, value })
    })
  )

  // Handle date validation and conversion safely
  // The Mdoc library sometimes provides Date objects with NaN values
  // which would throw errors when calling toISOString()
  const safeToISOString = (date: Date): string | undefined => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return undefined
    }
    try {
      return date.toISOString()
    } catch (error) {
      // Additional safety in case toISOString() throws for any other reason
      return undefined
    }
  }

  const mdocMetadata = {
    type: mdocInstance.docType,
    // TODO: Add proper holder binding metadata
    holder: undefined,
    issuedAt: safeToISOString(mdocInstance.validityInfo.signed) ?? 'Unknown',
    validFrom: safeToISOString(mdocInstance.validityInfo.validFrom),
    validUntil: safeToISOString(mdocInstance.validityInfo.validUntil),
  }

  return {
    attributes,
    metadata: mdocMetadata,
  }
}
