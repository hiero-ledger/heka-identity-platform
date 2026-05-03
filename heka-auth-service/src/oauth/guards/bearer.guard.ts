import { AuthorizationHeader, AuthorizationTokenType } from '@const'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { IncomingMessage } from 'http'

@Injectable()
export class BearerGuard implements CanActivate {
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest()

      // Extract and attach token (same logic as before)
      request['accessToken'] = extractTokenFromRequest(request)

      // ✅ Return boolean instead of request
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}

export function extractTokenFromRequest(request: IncomingMessage): string {
  const [type, token] = request.headers[AuthorizationHeader]?.split(' ') ?? []

  if (!type || type.toLowerCase() !== AuthorizationTokenType.toLowerCase()) {
    throw new UnauthorizedException()
  }

  if (!token) {
    throw new UnauthorizedException()
  }

  return token
}