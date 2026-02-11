export const didIndyBesuRegex = /^did:(?:indybesu|ethr):(?:[a-zA-Z0-9]+:)*(0x[a-fA-F0-9]{40})$/

const didIndyBesuAnonCredsBase =
  /(did:(?:indybesu|ethr):((?:[a-z][_a-z0-9-]*)(?::[a-z][_a-z0-9-]*)?):(0x[a-fA-F0-9]{40}))/

const anoncredsResourcePrefix = 'anoncreds/v0'

export const didIndyBesuSchemaIdRegex = new RegExp(
  `^${didIndyBesuAnonCredsBase.source}/${anoncredsResourcePrefix}/SCHEMA/(.+)/([0-9.]+)$`
)
export const didIndyBesuCredDefIdRegex = new RegExp(
  `^${didIndyBesuAnonCredsBase.source}/${anoncredsResourcePrefix}/CLAIM_DEF/(.+)/(.+)$`
)
export const didIndyBesyCredDefSchemaIdRegex = new RegExp(`^${didIndyBesuAnonCredsBase.source}:(.+):([0-9.]+)$`)

export function isIndyBesuDid(did: string) {
  return didIndyBesuRegex.test(did)
}

export function isIndyBesuSchemaId(did: string) {
  return didIndyBesuSchemaIdRegex.test(did) || didIndyBesyCredDefSchemaIdRegex.test(did)
}

export function isIndyBesuCredDefId(did: string) {
  return didIndyBesuCredDefIdRegex.test(did)
}

interface ParsedIndySchemaId {
  did: string
  namespaceIdentifier: string
  schemaName: string
  schemaVersion: string
  namespace?: string
}

export function parseIndyBesuSchemaId(schemaId: string): ParsedIndySchemaId {
  const indyBesuSchemaIdMatch = schemaId.match(didIndyBesuSchemaIdRegex)
  if (indyBesuSchemaIdMatch) {
    const [, did, namespace, namespaceIdentifier, schemaName, schemaVersion] = indyBesuSchemaIdMatch

    return {
      did,
      namespaceIdentifier,
      schemaName,
      schemaVersion,
      namespace,
    }
  }

  const indyBesuCredDefSchemaIdMatch = schemaId.match(didIndyBesyCredDefSchemaIdRegex)
  if (indyBesuCredDefSchemaIdMatch) {
    const [, did, namespace, namespaceIdentifier, schemaName, schemaVersion] = indyBesuCredDefSchemaIdMatch

    return {
      did,
      namespaceIdentifier,
      schemaName,
      schemaVersion,
      namespace,
    }
  }

  throw new Error(`Invalid schema id: ${schemaId}`)
}

interface ParsedIndyCredentialDefinitionId {
  did: string
  namespaceIdentifier: string
  schemaId: string
  tag: string
  namespace?: string
}

export function parseIndyBesuCredentialDefinitionId(credentialDefinitionId: string): ParsedIndyCredentialDefinitionId {
  const match = credentialDefinitionId.match(didIndyBesuCredDefIdRegex)
  if (match) {
    const [, did, namespace, namespaceIdentifier, schemaId, tag] = match

    return {
      did,
      namespaceIdentifier,
      schemaId,
      tag,
      namespace,
    }
  }

  throw new Error(`Invalid credential definition id: ${credentialDefinitionId}`)
}
