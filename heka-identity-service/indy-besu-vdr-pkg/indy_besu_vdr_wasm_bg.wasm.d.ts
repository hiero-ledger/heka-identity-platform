/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory
export function ethrdidregistry_buildDidChangeOwnerTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number
export function ethrdidregistry_buildDidChangeOwnerEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number
export function ethrdidregistry_buildDidAddDelegateTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
): number
export function ethrdidregistry_buildDidAddDelegateEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
): number
export function ethrdidregistry_buildDidRevokeDelegateTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
): number
export function ethrdidregistry_buildDidRevokeDelegateEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number
export function ethrdidregistry_buildDidSetAttributeTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number
export function ethrdidregistry_buildDidSetAttributeEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number
export function ethrdidregistry_buildDidRevokeAttributeTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): number
export function ethrdidregistry_buildDidRevokeAttributeEndorsingData(a: number, b: number, c: number, d: number): number
export function ethrdidregistry_buildGetDidOwnerTransaction(a: number, b: number, c: number): number
export function ethrdidregistry_buildGetDidChangedTransaction(a: number, b: number, c: number): number
export function ethrdidregistry_buildGetIdentityNonceTransaction(a: number, b: number, c: number): number
export function ethrdidregistry_buildGetDidEventsQuery(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number
export function ethrdidregistry_parseDidChangedResult(a: number, b: number, c: number, d: number): void
export function ethrdidregistry_parseDidOwnerResult(a: number, b: number, c: number, d: number): void
export function ethrdidregistry_parseDidAttributeChangedEventResponse(a: number, b: number, c: number): void
export function ethrdidregistry_parseDidDelegateChangedEventResponse(a: number, b: number, c: number): void
export function ethrdidregistry_parseDidOwnerChangedEventResponse(a: number, b: number, c: number): void
export function ethrdidregistry_parseDidEventResponse(a: number, b: number, c: number): void
export function didresolver_resolveDid(a: number, b: number, c: number, d: number): number
export function endorsement_buildEndorsementTransaction(a: number, b: number, c: number, d: number): number
export function __wbg_transaction_free(a: number): void
export function transaction_to(a: number, b: number): void
export function transaction_getSigningBytes(a: number, b: number): void
export function transaction_setSignature(a: number, b: number, c: number): void
export function __wbg_transactionendorsingdata_free(a: number): void
export function transactionendorsingdata_getSigningBytes(a: number, b: number): void
export function transactionendorsingdata_setSignature(a: number, b: number, c: number): void
export function __wbg_ethrdidregistry_free(a: number): void
export function __wbg_didresolver_free(a: number): void
export function __wbg_endorsement_free(a: number): void
export function legacymappingregistry_buildCreateDidMappingTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
): number
export function legacymappingregistry_buildCreateDidMappingEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
): number
export function legacymappingregistry_buildGetDidMappingTransaction(a: number, b: number, c: number): number
export function legacymappingregistry_parseDidMappingResult(a: number, b: number, c: number, d: number): void
export function legacymappingregistry_buildCreateResourceMappingTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
): number
export function legacymappingregistry_buildCreateResourceMappingEndorsingData(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
): number
export function legacymappingregistry_buildGetResourceMappingTransaction(a: number, b: number, c: number): number
export function legacymappingregistry_parseResourceMappingResult(a: number, b: number, c: number, d: number): void
export function __wbg_eventquery_free(a: number): void
export function __wbg_legacymappingregistry_free(a: number): void
export function credentialdefinitionregistry_buildCreateCredentialDefinitionTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
): number
export function credentialdefinitionregistry_buildCreateCredentialDefinitionEndorsingData(a: number, b: number): number
export function credentialdefinitionregistry_buildResolveCredentialDefinitionTransaction(
  a: number,
  b: number,
  c: number,
): number
export function credentialdefinitionregistry_parseResolveCredentialDefinitionResult(
  a: number,
  b: number,
  c: number,
  d: number,
): void
export function credentialdefinitionregistry_resolveCredentialDefinition(a: number, b: number, c: number): number
export function __wbg_credentialdefinition_free(a: number): void
export function credentialdefinition_new(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number
export function credentialdefinition_getId(a: number, b: number): void
export function credentialdefinition_toString(a: number, b: number): void
export function credentialdefinition_fromString(a: number, b: number, c: number): void
export function credentialdefinition_asValue(a: number, b: number): void
export function __wbg_credentialdefinitionregistry_free(a: number): void
export function indydidregistry_buildCreateDidTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): number
export function indydidregistry_buildCreateDidEndorsingData(a: number, b: number, c: number, d: number): number
export function indydidregistry_buildUpdateDidTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): number
export function indydidregistry_buildUpdateDidEndorsingData(a: number, b: number, c: number, d: number): number
export function indydidregistry_buildDeactivateDidTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number
export function indydidregistry_buildDeactivateDidEndorsingData(a: number, b: number, c: number): number
export function indydidregistry_buildResolveDidTransaction(a: number, b: number, c: number): number
export function indydidregistry_parseResolveDidResult(a: number, b: number, c: number, d: number): void
export function rolecontrol_buildAssignRoleTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): number
export function rolecontrol_buildRevokeRoleTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): number
export function rolecontrol_buildHasRoleTransaction(a: number, b: number, c: number, d: number): number
export function rolecontrol_buildGetRoleTransaction(a: number, b: number, c: number): number
export function rolecontrol_parseHasRoleResult(a: number, b: number, c: number, d: number): void
export function rolecontrol_parseGetRoleResult(a: number, b: number, c: number, d: number): void
export function __wbg_indydidregistry_free(a: number): void
export function __wbg_rolecontrol_free(a: number): void
export function __wbg_ledgerclient_free(a: number): void
export function ledgerclient_new(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
): void
export function ledgerclient_ping(a: number): number
export function ledgerclient_submitTransaction(a: number, b: number): number
export function ledgerclient_queryEvents(a: number, b: number): number
export function ledgerclient_getReceipt(a: number, b: number, c: number): number
export function schemaregistry_buildCreateSchemaTransaction(a: number, b: number, c: number, d: number): number
export function schemaregistry_buildCreateSchemaEndorsingData(a: number, b: number): number
export function schemaregistry_buildResolveSchemaTransaction(a: number, b: number, c: number): number
export function schemaregistry_parseResolveSchemaResult(a: number, b: number, c: number, d: number): void
export function schemaregistry_resolveSchema(a: number, b: number, c: number): number
export function __wbg_schema_free(a: number): void
export function schema_new(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
): number
export function schema_getId(a: number, b: number): void
export function schema_toString(a: number, b: number): void
export function schema_fromString(a: number, b: number, c: number): void
export function schema_asValue(a: number, b: number): void
export function __wbg_schemaregistry_free(a: number): void
export function validatorcontrol_buildAddValidatorTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number
export function validatorcontrol_buildRemoveValidatorTransaction(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number
export function validatorcontrol_buildGetValidatorsTransaction(a: number): number
export function validatorcontrol_parseGetValidatorsResult(a: number, b: number, c: number, d: number): void
export function __wbg_validatorcontrol_free(a: number): void
export function __wbindgen_malloc(a: number, b: number): number
export function __wbindgen_realloc(a: number, b: number, c: number, d: number): number
export const __wbindgen_export_2: WebAssembly.Table
export function _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h4ad6499004e46006(
  a: number,
  b: number,
): void
export function _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h0bcf7232ffeabcb9(
  a: number,
  b: number,
  c: number,
): void
export function __wbindgen_add_to_stack_pointer(a: number): number
export function __wbindgen_free(a: number, b: number, c: number): void
export function __wbindgen_exn_store(a: number): void
export function wasm_bindgen__convert__closures__invoke2_mut__h425445d3ef132364(
  a: number,
  b: number,
  c: number,
  d: number,
): void
