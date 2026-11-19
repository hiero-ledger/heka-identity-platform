export { issuedCredentialsReducer } from './model/slices/issuedCredentialsSlice';
export type {
  IssuedCredential,
  IssuedCredentialsSchema,
} from './model/types/issuedCredential';
export { getIssuedCredentials } from './model/services/getIssuedCredentials';
export { revokeIssuedCredential } from './model/services/revokeIssuedCredential';
export {
  canRevoke,
  getIssuedCredentialStatus,
} from './model/utils/issuedCredentialStatus';
export type { IssuedCredentialStatus } from './model/utils/issuedCredentialStatus';
