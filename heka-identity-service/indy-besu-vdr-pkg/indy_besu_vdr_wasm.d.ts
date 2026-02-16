/* tslint:disable */
/* eslint-disable */
/**
 */
export class CredentialDefinition {
  free(): void
  /**
   * @param {string} issuer_id
   * @param {string} schema_id
   * @param {string} tag
   * @param {any} value
   */
  constructor(issuer_id: string, schema_id: string, tag: string, value: any)
  /**
   * @returns {string}
   */
  getId(): string
  /**
   * @returns {string}
   */
  toString(): string
  /**
   * @param {string} string
   * @returns {CredentialDefinition}
   */
  static fromString(string: string): CredentialDefinition
  /**
   * @returns {any}
   */
  asValue(): any
}
/**
 */
export class CredentialDefinitionRegistry {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {CredentialDefinition} cred_def
   * @returns {Promise<Transaction>}
   */
  static buildCreateCredentialDefinitionTransaction(
    client: LedgerClient,
    from: string,
    cred_def: CredentialDefinition,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {CredentialDefinition} cred_def
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildCreateCredentialDefinitionEndorsingData(
    client: LedgerClient,
    cred_def: CredentialDefinition,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} id
   * @returns {Promise<Transaction>}
   */
  static buildResolveCredentialDefinitionTransaction(client: LedgerClient, id: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  static parseResolveCredentialDefinitionResult(client: LedgerClient, bytes: Uint8Array): any
  /**
   * @param {LedgerClient} client
   * @param {string} id
   * @returns {Promise<CredentialDefinition>}
   */
  static resolveCredentialDefinition(client: LedgerClient, id: string): Promise<CredentialDefinition>
}
/**
 */
export class DidResolver {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {any} options
   * @returns {Promise<any>}
   */
  static resolveDid(client: LedgerClient, did: string, options: any): Promise<any>
}
/**
 */
export class Endorsement {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {TransactionEndorsingData} endorsing_data
   * @returns {Promise<Transaction>}
   */
  static buildEndorsementTransaction(
    client: LedgerClient,
    from: string,
    endorsing_data: TransactionEndorsingData,
  ): Promise<Transaction>
}
/**
 */
export class EthrDidRegistry {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} sender
   * @param {string} did
   * @param {string} new_owner
   * @returns {Promise<Transaction>}
   */
  static buildDidChangeOwnerTransaction(
    client: LedgerClient,
    sender: string,
    did: string,
    new_owner: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {string} new_owner
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDidChangeOwnerEndorsingData(
    client: LedgerClient,
    did: string,
    new_owner: string,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} sender
   * @param {string} did
   * @param {string} delegate_type
   * @param {string} delegate
   * @param {bigint} validity
   * @returns {Promise<Transaction>}
   */
  static buildDidAddDelegateTransaction(
    client: LedgerClient,
    sender: string,
    did: string,
    delegate_type: string,
    delegate: string,
    validity: bigint,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {string} delegate_type
   * @param {string} delegate
   * @param {bigint} validity
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDidAddDelegateEndorsingData(
    client: LedgerClient,
    did: string,
    delegate_type: string,
    delegate: string,
    validity: bigint,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} sender
   * @param {string} did
   * @param {string} delegate_type
   * @param {string} delegate
   * @returns {Promise<Transaction>}
   */
  static buildDidRevokeDelegateTransaction(
    client: LedgerClient,
    sender: string,
    did: string,
    delegate_type: string,
    delegate: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {string} delegate_type
   * @param {string} delegate
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDidRevokeDelegateEndorsingData(
    client: LedgerClient,
    did: string,
    delegate_type: string,
    delegate: string,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} sender
   * @param {string} did
   * @param {any} attribute
   * @param {bigint} validity
   * @returns {Promise<Transaction>}
   */
  static buildDidSetAttributeTransaction(
    client: LedgerClient,
    sender: string,
    did: string,
    attribute: any,
    validity: bigint,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {any} attribute
   * @param {bigint} validity
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDidSetAttributeEndorsingData(
    client: LedgerClient,
    did: string,
    attribute: any,
    validity: bigint,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} sender
   * @param {string} did
   * @param {any} attribute
   * @returns {Promise<Transaction>}
   */
  static buildDidRevokeAttributeTransaction(
    client: LedgerClient,
    sender: string,
    did: string,
    attribute: any,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {any} attribute
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDidRevokeAttributeEndorsingData(
    client: LedgerClient,
    did: string,
    attribute: any,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @returns {Promise<Transaction>}
   */
  static buildGetDidOwnerTransaction(client: LedgerClient, did: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @returns {Promise<Transaction>}
   */
  static buildGetDidChangedTransaction(client: LedgerClient, did: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} identity
   * @returns {Promise<Transaction>}
   */
  static buildGetIdentityNonceTransaction(client: LedgerClient, identity: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {bigint | undefined} [from_block]
   * @param {bigint | undefined} [to_block]
   * @returns {Promise<EventQuery>}
   */
  static buildGetDidEventsQuery(
    client: LedgerClient,
    did: string,
    from_block?: bigint,
    to_block?: bigint,
  ): Promise<EventQuery>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {bigint}
   */
  static parseDidChangedResult(client: LedgerClient, bytes: Uint8Array): bigint
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  static parseDidOwnerResult(client: LedgerClient, bytes: Uint8Array): string
  /**
   * @param {LedgerClient} client
   * @param {any} log
   * @returns {any}
   */
  static parseDidAttributeChangedEventResponse(client: LedgerClient, log: any): any
  /**
   * @param {LedgerClient} client
   * @param {any} log
   * @returns {any}
   */
  static parseDidDelegateChangedEventResponse(client: LedgerClient, log: any): any
  /**
   * @param {LedgerClient} client
   * @param {any} log
   * @returns {any}
   */
  static parseDidOwnerChangedEventResponse(client: LedgerClient, log: any): any
  /**
   * @param {LedgerClient} client
   * @param {any} log
   * @returns {any}
   */
  static parseDidEventResponse(client: LedgerClient, log: any): any
}
/**
 */
export class EventQuery {
  free(): void
}
/**
 */
export class IndyDidRegistry {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} did
   * @param {any} did_doc
   * @returns {Promise<Transaction>}
   */
  static buildCreateDidTransaction(client: LedgerClient, from: string, did: string, did_doc: any): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {any} did_doc
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildCreateDidEndorsingData(client: LedgerClient, did: string, did_doc: any): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} did
   * @param {any} did_doc
   * @returns {Promise<Transaction>}
   */
  static buildUpdateDidTransaction(client: LedgerClient, from: string, did: string, did_doc: any): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {any} did_doc
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildUpdateDidEndorsingData(client: LedgerClient, did: string, did_doc: any): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} did
   * @returns {Promise<Transaction>}
   */
  static buildDeactivateDidTransaction(client: LedgerClient, from: string, did: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildDeactivateDidEndorsingData(client: LedgerClient, did: string): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @returns {Promise<Transaction>}
   */
  static buildResolveDidTransaction(client: LedgerClient, did: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  static parseResolveDidResult(client: LedgerClient, bytes: Uint8Array): any
}
/**
 */
export class LedgerClient {
  free(): void
  /**
   * @param {number} chain_id
   * @param {string} node_address
   * @param {any} contract_configs
   * @param {string | undefined} network
   * @param {any} quorum_config
   */
  constructor(
    chain_id: number,
    node_address: string,
    contract_configs: any,
    network: string | undefined,
    quorum_config: any,
  )
  /**
   * @returns {Promise<Promise<any>>}
   */
  ping(): Promise<Promise<any>>
  /**
   * @param {Transaction} transaction
   * @returns {Promise<Promise<any>>}
   */
  submitTransaction(transaction: Transaction): Promise<Promise<any>>
  /**
   * @param {EventQuery} query
   * @returns {Promise<Promise<any>>}
   */
  queryEvents(query: EventQuery): Promise<Promise<any>>
  /**
   * @param {Uint8Array} hash
   * @returns {Promise<Promise<any>>}
   */
  getReceipt(hash: Uint8Array): Promise<Promise<any>>
}
/**
 */
export class LegacyMappingRegistry {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} did
   * @param {string} legacy_did
   * @param {string} legacy_verkey
   * @param {Uint8Array} ed25519_signature
   * @returns {Promise<Transaction>}
   */
  static buildCreateDidMappingTransaction(
    client: LedgerClient,
    from: string,
    did: string,
    legacy_did: string,
    legacy_verkey: string,
    ed25519_signature: Uint8Array,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {string} legacy_did
   * @param {string} legacy_verkey
   * @param {Uint8Array} ed25519_signature
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildCreateDidMappingEndorsingData(
    client: LedgerClient,
    did: string,
    legacy_did: string,
    legacy_verkey: string,
    ed25519_signature: Uint8Array,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} legacy_identifier
   * @returns {Promise<Transaction>}
   */
  static buildGetDidMappingTransaction(client: LedgerClient, legacy_identifier: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  static parseDidMappingResult(client: LedgerClient, bytes: Uint8Array): string
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} did
   * @param {string} legacy_issuer_identifier
   * @param {string} legacy_identifier
   * @param {string} new_identifier
   * @returns {Promise<Transaction>}
   */
  static buildCreateResourceMappingTransaction(
    client: LedgerClient,
    from: string,
    did: string,
    legacy_issuer_identifier: string,
    legacy_identifier: string,
    new_identifier: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} did
   * @param {string} legacy_issuer_identifier
   * @param {string} legacy_identifier
   * @param {string} new_identifier
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildCreateResourceMappingEndorsingData(
    client: LedgerClient,
    did: string,
    legacy_issuer_identifier: string,
    legacy_identifier: string,
    new_identifier: string,
  ): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} legacy_identifier
   * @returns {Promise<Transaction>}
   */
  static buildGetResourceMappingTransaction(client: LedgerClient, legacy_identifier: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  static parseResourceMappingResult(client: LedgerClient, bytes: Uint8Array): string
}
/**
 */
export class RoleControl {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {number} role
   * @param {string} account
   * @returns {Promise<Transaction>}
   */
  static buildAssignRoleTransaction(
    client: LedgerClient,
    from: string,
    role: number,
    account: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {number} role
   * @param {string} account
   * @returns {Promise<Transaction>}
   */
  static buildRevokeRoleTransaction(
    client: LedgerClient,
    from: string,
    role: number,
    account: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {number} role
   * @param {string} account
   * @returns {Promise<Transaction>}
   */
  static buildHasRoleTransaction(client: LedgerClient, role: number, account: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} account
   * @returns {Promise<Transaction>}
   */
  static buildGetRoleTransaction(client: LedgerClient, account: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  static parseHasRoleResult(client: LedgerClient, bytes: Uint8Array): boolean
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {number}
   */
  static parseGetRoleResult(client: LedgerClient, bytes: Uint8Array): number
}
/**
 */
export class Schema {
  free(): void
  /**
   * @param {string} issuer_id
   * @param {string} name
   * @param {string} version
   * @param {(string)[]} attr_names
   */
  constructor(issuer_id: string, name: string, version: string, attr_names: string[])
  /**
   * @returns {string}
   */
  getId(): string
  /**
   * @returns {string}
   */
  toString(): string
  /**
   * @param {string} string
   * @returns {Schema}
   */
  static fromString(string: string): Schema
  /**
   * @returns {any}
   */
  asValue(): any
}
/**
 */
export class SchemaRegistry {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {Schema} schema
   * @returns {Promise<Transaction>}
   */
  static buildCreateSchemaTransaction(client: LedgerClient, from: string, schema: Schema): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Schema} schema
   * @returns {Promise<TransactionEndorsingData>}
   */
  static buildCreateSchemaEndorsingData(client: LedgerClient, schema: Schema): Promise<TransactionEndorsingData>
  /**
   * @param {LedgerClient} client
   * @param {string} id
   * @returns {Promise<Transaction>}
   */
  static buildResolveSchemaTransaction(client: LedgerClient, id: string): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  static parseResolveSchemaResult(client: LedgerClient, bytes: Uint8Array): any
  /**
   * @param {LedgerClient} client
   * @param {string} id
   * @returns {Promise<Schema>}
   */
  static resolveSchema(client: LedgerClient, id: string): Promise<Schema>
}
/**
 */
export class Transaction {
  free(): void
  /**
   * @returns {string}
   */
  to(): string
  /**
   * @returns {Uint8Array}
   */
  getSigningBytes(): Uint8Array
  /**
   * @param {any} signature_data
   */
  setSignature(signature_data: any): void
}
/**
 */
export class TransactionEndorsingData {
  free(): void
  /**
   * @returns {Uint8Array}
   */
  getSigningBytes(): Uint8Array
  /**
   * @param {any} signature_data
   */
  setSignature(signature_data: any): void
}
/**
 */
export class ValidatorControl {
  free(): void
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} validator_address
   * @returns {Promise<Transaction>}
   */
  static buildAddValidatorTransaction(
    client: LedgerClient,
    from: string,
    validator_address: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {string} from
   * @param {string} validator_address
   * @returns {Promise<Transaction>}
   */
  static buildRemoveValidatorTransaction(
    client: LedgerClient,
    from: string,
    validator_address: string,
  ): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @returns {Promise<Transaction>}
   */
  static buildGetValidatorsTransaction(client: LedgerClient): Promise<Transaction>
  /**
   * @param {LedgerClient} client
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  static parseGetValidatorsResult(client: LedgerClient, bytes: Uint8Array): any
}
