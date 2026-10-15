import { ConfigService } from '@config'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

/**
 * Guard for service-to-service internal endpoints.
 *
 * Validates the `x-internal-service-secret` header against the secret
 * configured in `INTERNAL_SERVICE_SECRET`. This prevents unauthenticated
 * external callers from accessing internal routes.
 *
 * This is a pragmatic LFX-project-level solution for service-to-service auth.
 * In production this should be replaced with mTLS or signed service JWTs.
 * See: docs/adr/0008-github-contributor-credential-schema.md (future work section).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly secret: string

  public constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.internalServiceSecret
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>()
    const header = request.headers['x-internal-service-secret']

    if (!header || header !== this.secret) {
      throw new UnauthorizedException('Invalid internal service secret.')
    }

    return true
  }
}
