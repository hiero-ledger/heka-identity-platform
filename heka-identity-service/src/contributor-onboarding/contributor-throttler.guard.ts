import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

import { AuthInfo } from 'common/auth'

export const CONTRIBUTOR_RATE_LIMIT = 10
const CONTRIBUTOR_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Rate limit of the contributor routes: 10 requests per minute per route and Heka user (OIDC subject),
 * so one user can't spend the shared GitHub API quota for everyone. The limit is per process.
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
