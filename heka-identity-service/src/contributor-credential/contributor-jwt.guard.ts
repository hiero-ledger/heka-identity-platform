import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import jwt from 'jsonwebtoken'

import { INSECURE_DEFAULTS } from '../config/insecure-defaults'

export interface ContributorJwtPayload {
  sub: string
  githubAccountId: string
  githubUsername: string
  walletId: string
  scope: string
}

/**
 * Guard that verifies the short-lived contributor JWT issued by auth-service
 * after successful GPG challenge verification.
 *
 * Requirements:
 * - Authorization: Bearer <token>
 * - Valid signature (CONTRIBUTOR_JWT_SECRET or JWT_SECRET)
 * - Scope must be 'contributor:credential-offer'
 * - Claims must include githubAccountId
 */
@Injectable()
export class ContributorJwtGuard implements CanActivate {
  private readonly secret: string

  public constructor() {
    this.secret =
      process.env['CONTRIBUTOR_JWT_SECRET'] ??
      process.env['JWT_SECRET'] ??
      INSECURE_DEFAULTS.JWT_SECRET
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization'] ?? request.headers['Authorization']

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing Authorization header.')
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization format. Expected Bearer <token>.')
    }

    try {
      const decoded = jwt.verify(token, this.secret) as ContributorJwtPayload

      if (decoded.scope !== 'contributor:credential-offer') {
        throw new UnauthorizedException('Invalid token scope for credential offer.')
      }

      if (!decoded.githubAccountId) {
        throw new UnauthorizedException('Token missing required contributor claims.')
      }

      request.contributorAuth = decoded
      return true
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err
      }
      throw new UnauthorizedException('Invalid or expired contributor token.')
    }
  }
}
