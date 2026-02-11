const KEY_DID_METHOD_PREFIX = 'did:key:'

export function getDidKeyVerificationMethodId(did: string) {
  const methodSpecificIdentifier = did.substring(KEY_DID_METHOD_PREFIX.length)

  return `${did}#${methodSpecificIdentifier}`
}
