import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      (req.ip as string | undefined) ??
      ''

    if (req.method === 'POST' && typeof req.path === 'string' && req.path.endsWith('/oauth/token')) {
      const username = (req.body?.username ?? req.body?.name) as string | undefined
      if (username) {
        return `${username}:${ip}`
      }
    }

    return ip
  }
}
