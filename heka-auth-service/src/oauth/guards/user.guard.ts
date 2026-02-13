import { TokenRepository } from '@core/database/repositories/token.repository'
import { UserRepository } from '@core/database/repositories/user.repository'
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { extractTokenFromRequest } from './bearer.guard'

@Injectable()
export class UserAuthGuard extends AuthGuard('jwt') {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenRepository: TokenRepository,
  ) {
    super()
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest()

      const token = extractTokenFromRequest(request)
      const storedToken = await this.tokenRepository.get(token)
      if (!storedToken) throw new UnauthorizedException()

      const user = await this.userRepository.findOneOrFail({
        id: storedToken.subject,
      })
      if (!user) throw new UnauthorizedException()

      request['sender'] = user
      return request
    } catch {
      throw new UnauthorizedException()
    }
  }
}
