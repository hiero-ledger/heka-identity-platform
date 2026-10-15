import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { ContributorJwtPayload } from './contributor-jwt.guard'

export type ContributorAuthInfo = ContributorJwtPayload

/**
 * Route parameter decorator that extracts the verified contributor payload
 * set by ContributorJwtGuard on request.contributorAuth.
 */
export const ReqContributorAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ContributorAuthInfo => {
    const request = ctx.switchToHttp().getRequest()
    return request.contributorAuth
  },
)
