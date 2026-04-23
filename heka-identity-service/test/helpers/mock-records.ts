import type {
  AnonCredsCredentialDefinition,
  AnonCredsCredentialDefinitionRecord,
  AnonCredsSchema,
  AnonCredsSchemaRecord,
} from '@credo-ts/anoncreds'
import type { DidRecord, DidResolutionResult } from '@credo-ts/core'
import type {
  DidCommConnectionRecord,
  DidCommCredentialExchangeRecord,
  DidCommOutOfBandRecord,
  DidCommProofExchangeRecord,
} from '@credo-ts/didcomm'
import type {
  OpenId4VcIssuanceSessionRecord,
  OpenId4VcIssuerRecord,
  OpenId4VcVerificationSessionRecord,
} from '@credo-ts/openid4vc'

/**
 * Loose stub overrides: keys must exist on T (so typos fail), but values are not type-checked.
 * This lets tests provide enum values as plain strings (e.g. `state: 'completed'`) without
 * per-field `as any` while still catching renames/typos.
 */
type LooseStub<T> = { [K in keyof T]?: unknown }

const stub = <T>(overrides: LooseStub<T>): T => overrides as T

export const connectionRecord = (overrides: LooseStub<DidCommConnectionRecord> = {}) =>
  stub<DidCommConnectionRecord>(overrides)

export const oobRecord = (overrides: LooseStub<DidCommOutOfBandRecord> = {}) => stub<DidCommOutOfBandRecord>(overrides)

export const credentialExchangeRecord = (overrides: LooseStub<DidCommCredentialExchangeRecord> = {}) =>
  stub<DidCommCredentialExchangeRecord>(overrides)

export const proofExchangeRecord = (overrides: LooseStub<DidCommProofExchangeRecord> = {}) =>
  stub<DidCommProofExchangeRecord>(overrides)

export const issuerRecord = (overrides: LooseStub<OpenId4VcIssuerRecord> = {}) => stub<OpenId4VcIssuerRecord>(overrides)

export const issuanceSessionRecord = (overrides: LooseStub<OpenId4VcIssuanceSessionRecord> = {}) =>
  stub<OpenId4VcIssuanceSessionRecord>(overrides)

export const verificationSessionRecord = (overrides: LooseStub<OpenId4VcVerificationSessionRecord> = {}) =>
  stub<OpenId4VcVerificationSessionRecord>(overrides)

export const didResolutionResult = (overrides: LooseStub<DidResolutionResult> = {}): DidResolutionResult =>
  ({ didResolutionMetadata: {}, didDocumentMetadata: {}, ...overrides }) as DidResolutionResult

export const didRecordStub = (overrides: LooseStub<DidRecord> = {}) => stub<DidRecord>(overrides)

export const anonCredsSchema = (overrides: LooseStub<AnonCredsSchema> = {}) => stub<AnonCredsSchema>(overrides)

export const anonCredsCredentialDefinition = (overrides: LooseStub<AnonCredsCredentialDefinition> = {}) =>
  stub<AnonCredsCredentialDefinition>(overrides)

export const anonCredsSchemaRecord = (overrides: LooseStub<AnonCredsSchemaRecord> = {}) =>
  stub<AnonCredsSchemaRecord>(overrides)

export const anonCredsCredentialDefinitionRecord = (overrides: LooseStub<AnonCredsCredentialDefinitionRecord> = {}) =>
  stub<AnonCredsCredentialDefinitionRecord>(overrides)

/** Generic stub for project-owned mikro-orm entities (Schema, IssuanceTemplate, etc.). */
export const entityStub = <T>(overrides: LooseStub<T>): T => overrides as T
