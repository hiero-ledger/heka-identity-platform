import { Role } from 'common/auth'

/** Roles that may revoke issued credentials (DIDComm AnonCreds, OpenID4VC SD-JWT VC) when the role model is enforced */
export const CREDENTIAL_REVOKING_ROLES: readonly Role[] = [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer]
