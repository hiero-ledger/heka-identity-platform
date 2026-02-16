import { AnonCredsCredentialDefinition } from '@credo-ts/anoncreds'

import { CredentialDefinition } from '../ledger'

export function fromIndyBesuCredentialDefinition(credDef: CredentialDefinition): AnonCredsCredentialDefinition {
  // indybesu vdr wasm return MAP objects but credo expect regular JS objects
  // FIXME: Is there a better wey to convert?
  // TODO: Support revocation
  const value = Object.fromEntries(credDef.value)
  const primary = Object.fromEntries(value.primary)
  const r = Object.fromEntries(primary.r)
  return {
    type: 'CL',
    issuerId: credDef.issuerId,
    schemaId: credDef.schemaId,
    tag: credDef.tag,
    value: {
      primary: {
        ...primary,
        r,
      },
    },
  }
}
