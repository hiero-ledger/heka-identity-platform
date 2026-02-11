import {
  getQualifiedDidIndyDid,
  isUnqualifiedSchemaId,
  parseIndyCredentialDefinitionId,
  parseIndySchemaId,
} from '@credo-ts/anoncreds'
import {
  isDidIndyCredentialDefinitionId,
  isDidIndySchemaId,
  isUnqualifiedCredentialDefinitionId,
} from '@credo-ts/anoncreds/build/utils/indyIdentifiers'

import {
  isIndyBesuCredDefId,
  isIndyBesuSchemaId,
  parseIndyBesuCredentialDefinitionId,
  parseIndyBesuSchemaId,
} from '../../indy-besu/anoncreds/utils/identifiers'

const DEFAULT_CREDENTIAL_NAME = 'Credential'

export function parseCredentialName(credentialDefinitionId?: string, schemaId?: string, comment?: string): string {
  let name = DEFAULT_CREDENTIAL_NAME

  if (credentialDefinitionId) {
    if (isDidIndyCredentialDefinitionId(credentialDefinitionId)) {
      name = parseIndyCredentialDefinitionId(credentialDefinitionId).tag
    } else if (isUnqualifiedCredentialDefinitionId(credentialDefinitionId)) {
      name = parseIndyCredentialDefinitionId(getQualifiedDidIndyDid(credentialDefinitionId, 'unknown')).tag
    } else if (isIndyBesuCredDefId(credentialDefinitionId)) {
      const parsedCredDef = parseIndyBesuCredentialDefinitionId(credentialDefinitionId)
      if (!schemaId) {
        schemaId = parsedCredDef.schemaId
      }
      name = parsedCredDef.tag
    }
  }

  if (name.toLocaleLowerCase() === 'default' || name === DEFAULT_CREDENTIAL_NAME) {
    if (schemaId) {
      if (isDidIndySchemaId(schemaId)) {
        name = parseIndySchemaId(schemaId).schemaName
      } else if (isUnqualifiedSchemaId(schemaId)) {
        name = parseIndySchemaId(getQualifiedDidIndyDid(schemaId, 'unknown')).schemaName
      } else if (isIndyBesuSchemaId(schemaId)) {
        name = parseIndyBesuSchemaId(schemaId).schemaName
      }
    } else {
      name = DEFAULT_CREDENTIAL_NAME
    }
  }

  if (name === DEFAULT_CREDENTIAL_NAME && comment) {
    name = comment
  }

  return name
}
