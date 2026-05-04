import { AuthorizationHeader, AuthorizationTokenType } from '@const'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { IncomingMessage } from 'http'

@Injectable()
export class BearerGuard implements CanActivate {
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest()
      request['accessToken'] = extractTokenFromRequest(request)
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}

export function extractTokenFromRequest(request: IncomingMessage): string {
  const header = request.headers[AuthorizationHeader]
  if (!header) {
    throw new UnauthorizedException()
  }

  const [type, token] = header.trim().split(/\s+/)
  if (!type || type.toLowerCase() !== AuthorizationTokenType.toLowerCase()) {
    throw new UnauthorizedException()
  }
  if (!token) {
    throw new UnauthorizedException()
  }

  return token
}
