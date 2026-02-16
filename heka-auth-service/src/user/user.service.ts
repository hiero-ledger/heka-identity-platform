import { ConfigService } from '@config'
import { User, UserRole } from '@core/database'
import { TokenType } from '@core/database/entities/token.entity'
import { TokenRepository, UserRepository } from '@core/database/repositories'
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ExpiresInToDate, hashPassword, verifyPassword } from '@utils'
import { v4 as uuidv4 } from 'uuid'

import {
  ChangePasswordRequest,
  ChangePasswordResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  RequestChangePasswordRequest,
  RequestChangePasswordResponse,
} from './dto'

@Injectable()
export class UserService {
  public constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
    private readonly tokenRepository: TokenRepository,
  ) {}

  public async register(data: RegisterUserRequest): Promise<RegisterUserResponse> {
    // check existing
    const existingUser = await this.userRepository.findOne({ name: data.name })
    if (existingUser) {
      throw new BadRequestException(`User with client_id '${data.name}' already exists`)
    }

    // create user account
    const user = new User({
      name: data.name,
      password: await hashPassword(data.password),
      role: data.role ?? UserRole.User,
    })
    await this.userRepository.persistAndFlush(user)

    return new RegisterUserResponse()
  }

  public async requestChangePassword(data: RequestChangePasswordRequest): Promise<RequestChangePasswordResponse> {
    const user = await this.userRepository.findOne({ name: data.name }, { populate: ['password'] })
    if (!user) {
      throw new ForbiddenException()
    }

    if (!(await verifyPassword(user.password, data.oldPassword))) {
      throw new UnauthorizedException('Username or password is incorrect.')
    }

    // find and remove old token
    await this.tokenRepository.revokeByTypeAndSubject(TokenType.PasswordChangeToken, user.id)

    // make the new token
    const passwordChangeToken = await this.tokenRepository.put({
      type: TokenType.PasswordChangeToken,
      token: uuidv4(),
      subject: user.id,
      expireIn: ExpiresInToDate(this.configService.expireInConfig.passwordChange),
    })

    return new RequestChangePasswordResponse({
      token: passwordChangeToken.token,
    })
  }

  public async changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    // get token
    const storedToken = await this.tokenRepository.get(data.token)
    if (!storedToken || storedToken.type !== TokenType.PasswordChangeToken) {
      throw new ForbiddenException(`Token not found or expired! Try to request change password again.`)
    }

    const user = await this.userRepository.findOne({ id: storedToken.subject })
    if (!user) {
      throw new ForbiddenException(`User ${storedToken.subject} not found!`)
    }

    // Change password for user account and fabric identity
    user.password = await hashPassword(data.password)
    await this.userRepository.persistAndFlush(user)

    // delete used token
    await this.tokenRepository.revoke(storedToken.token)

    return new ChangePasswordResponse()
  }
}
