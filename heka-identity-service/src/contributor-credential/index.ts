export { ContributorCredentialModule } from './contributor-credential.module'
export { ContributorCredentialService } from './contributor-credential.service'
export { AuthServiceClient, type VerifiedContributorDto } from './auth-service.client'
export { ContributorJwtGuard, type ContributorJwtPayload } from './contributor-jwt.guard'
export { ReqContributorAuth, type ContributorAuthInfo } from './req-contributor-auth.decorator'
export {
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_VCT,
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME,
} from './contributor-credential.constants'
export type { ContributorCredentialPayload } from './contributor-credential.types'
