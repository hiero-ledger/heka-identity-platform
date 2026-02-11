import { Mdoc, MdocNameSpaces } from '@credo-ts/core'
import { Attribute } from '@hyperledger/aries-oca/build/legacy'

export function getAttributesAndMetadataForMdocPayload(namespaces: MdocNameSpaces, mdocInstance: Mdoc) {
  const attributes = Object.values(namespaces).flatMap((namespaceMap) =>
    Object.entries(namespaceMap).map(([key, value]) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        value = JSON.stringify(value)
      }

      //@ts-expect-error TODO: Properly support nested values
      return new Attribute({ name: key, value })
    })
  )

  // FIXME: Date should be fixed in Mdoc library
  // The problem is that mdocInstance.validityInfo.validFrom and validUntil are already Date objects that contain NaN, not just NaN values.
  // When you call toISOString() on a Date containing NaN, it will throw an error.
  const mdocMetadata = {
    type: mdocInstance.docType,
    // TODO: Add proper holder binding metadata
    holder: undefined,
    issuedAt: mdocInstance.validityInfo.signed.toISOString(),
    validFrom:
      mdocInstance.validityInfo.validFrom instanceof Date &&
      !Number.isNaN(mdocInstance.validityInfo.validFrom.getTime())
        ? mdocInstance.validityInfo.validFrom.toISOString()
        : undefined,
    validUntil:
      mdocInstance.validityInfo.validUntil instanceof Date &&
      !Number.isNaN(mdocInstance.validityInfo.validUntil.getTime())
        ? mdocInstance.validityInfo.validUntil.toISOString()
        : undefined,
  }

  return {
    attributes,
    metadata: mdocMetadata,
  }
}
