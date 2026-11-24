import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

import { AuthInfo } from 'common/auth'

export const CONTRIBUTOR_RATE_LIMIT = 10
const CONTRIBUTOR_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Rate limit of the contributor routes: 10 requests per minute per route and Heka user (OIDC subject),
 * per process. It caps one user's bursts. It doesn't protect the unauthenticated GitHub API quota (60 requests
 * per hour per IP, shared by all users): each verification spends one, so one user at this limit uses it up
 * in six minutes.
 *
 * The `contributor` throttler is defined here instead of in the `ThrottlerModule` options (registered
 * globally by DemoModule), so this guard applies only it, and the demo broker's guard doesn't apply it.
 * List it after `JwtAuthGuard`, which sets the `AuthInfo` it keys on.
 */
@Injectable()
export class ContributorThrottlerGuard extends ThrottlerGuard {
  public override async onModuleInit(): Promise<void> {
    await super.onModuleInit()
    this.throttlers = [{ name: 'contributor', ttl: CONTRIBUTOR_RATE_LIMIT_WINDOW_MS, limit: CONTRIBUTOR_RATE_LIMIT }]
  }

  protected override async getTracker(req: { user?: AuthInfo; ip?: string }): Promise<string> {
    return req.user?.userId ?? super.getTracker(req)
  }
}
