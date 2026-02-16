import { AuthorizationHeader, AuthorizationTokenType } from '@const'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { IncomingMessage } from 'http'

@Injectable()
export class BearerGuard implements CanActivate {
  public canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest()
      request['accessToken'] = extractTokenFromRequest(request)
      return request
    } catch {
      throw new UnauthorizedException()
    }
  }
}

export function extractTokenFromRequest(request: IncomingMessage): string {
  const [type, token] = request.headers[AuthorizationHeader]?.split(' ') ?? []
  if (type.toLowerCase() !== AuthorizationTokenType.toLowerCase()) {
    throw new UnauthorizedException()
  }
  return token
}
