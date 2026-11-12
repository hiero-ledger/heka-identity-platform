export { didsReducer } from './model/slices/didsSlice';
export { getDids } from './model/services/getDids';
export {
  getDidById,
  getDidItems,
  getDidsError,
  getDidsFailedMethods,
  getDidsIsLoading,
} from './model/selectors/didsSelector';
export {
  VERIFICATION_RELATIONSHIPS,
  formatValue,
  getDidMethod,
  getPublicKey,
  normalizeDidDocument,
  objectsOf,
  relationshipEntriesOf,
  sortDids,
  textInterpolation,
  toList,
} from './model/utils/didDocument';
export type { VerificationRelationship } from './model/utils/didDocument';
export type {
  DidDocument,
  DidMethodError,
  DidService,
  DidsSchema,
  DidVerificationMethod,
  DidVerificationRelationshipEntry,
  GetDidsResult,
} from './model/types/did';
