import { ConfigService, jwtConfigDefaults } from '@config'
import { AuthorizationTokenType } from '@const'
import { User, UserRole } from '@core/database'
import { TokenType } from '@core/database/entities/token.entity'
import { TokenRepository, UserRepository } from '@core/database/repositories'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import { classFromJson, ExpiresInToDate, SecondsToDate, verifyPassword } from '@utils'
import { v4 as uuidv4 } from 'uuid'

import { LoginRequest, LoginResponse, LogoutRequest, RefreshResponse, Token } from './dto'

class AccessTokenPayload {
  public accessToken!: string
}

@Injectable()
export class OAuthService {
  public constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly tokenRepository: TokenRepository,
  ) {}

  private readonly JWT_BASE_OPTIONS: JwtSignOptions = {
    issuer: this.configService.jwtConfig.issuer,
    audience: this.configService.jwtConfig.audience,
    secret: this.configService.jwtConfig.secret,
    expiresIn: this.configService.jwtConfig.accessExpiry,
  }

  public async login(data: LoginRequest): Promise<LoginResponse> {
    // validate credentials
    const user = await this.userRepository.findOne({ name: data.name }, { populate: ['password'] })
    if (!user || !(await verifyPassword(user.password, data.password))) {
      throw new UnauthorizedException('Username or password is incorrect.')
    }

    // authenticate user
    return await this.generateTokens(user)
  }

  public async refreshToken(accessToken: string, refreshToken: string): Promise<RefreshResponse> {
    // parse refresh token
    const refresh = await this.jwtService.decode(refreshToken)

    // check expiration of the refresh token
    if (SecondsToDate(refresh.exp) <= new Date()) {
      throw new UnauthorizedException('Refresh token is incorrect.')
    }

    // resolve access token by refresh token
    const storedRefreshToken = await this.tokenRepository.getById(refresh.jti)
    if (!storedRefreshToken || !storedRefreshToken.payload) {
      throw new UnauthorizedException('Refresh token is incorrect.')
    }

    // get access token
    const tokenPayload = classFromJson(storedRefreshToken.payload, AccessTokenPayload).accessToken

    // check dependencies between tokens
    if (accessToken != tokenPayload) {
      throw new UnauthorizedException('Refresh token is incorrect.')
    }

    // ensure user exists
    const user = await this.userRepository.findOne({ id: storedRefreshToken.subject })
    if (!user) {
      throw new UnauthorizedException('Refresh token is incorrect.')
    }

    // skip refreshing for demo user
    if (user.isDemoUser(this.configService.jwtConfig)) {
      return new Token({
        access: accessToken,
        refresh: refreshToken,
        tokenType: AuthorizationTokenType,
        expiresIn: jwtConfigDefaults.accessExpiry,
      })
    }

    // revoke old access and refresh token
    await this.tokenRepository.revoke(accessToken)
    await this.tokenRepository.revoke(refreshToken)

    // generate new tokens
    return await this.generateTokens(user)
  }

  public async logout(data: LogoutRequest): Promise<void> {
    // resolve access token by refresh token
    const storedRefreshToken = await this.tokenRepository.get(data.refresh)
    if (!storedRefreshToken || !storedRefreshToken.payload) {
      return
    }

    const user = await this.userRepository.findOne({ id: storedRefreshToken.subject })
    if (!user) {
      return
    }

    const accessToken = classFromJson(storedRefreshToken.payload, AccessTokenPayload).accessToken

    // skip token invalidation for demo user
    if (user.isDemoUser(this.configService.jwtConfig)) {
      return
    }

    // revoke old tokens
    await this.tokenRepository.revoke(accessToken)
    await this.tokenRepository.revoke(data.refresh)
  }

  private getOrgId(role: UserRole) {
    switch (role) {
      case UserRole.OrgAdmin:
      case UserRole.OrgManager:
      case UserRole.OrgMember:
      case UserRole.Issuer:
      case UserRole.Verifier:
        return this.configService.appConfig.orgId
      case UserRole.Admin:
      case UserRole.User:
        return undefined
      default:
        return undefined
    }
  }

  private generateAccessToken = async (user: User): Promise<{ token: string; expiresIn: number }> => {
    const accessTokenExpiresIn = user.isDemoUser(this.configService.jwtConfig)
      ? jwtConfigDefaults.demoUserTokenExpiry
      : this.configService.jwtConfig.accessExpiry

    const options: JwtSignOptions = {
      ...this.JWT_BASE_OPTIONS,
      subject: String(user.id),
      expiresIn: accessTokenExpiresIn,
    }

    const jwtPayload = {
      roles: [user.role],
      name: user.name,
      type: 'access',
      org_id: this.getOrgId(user.role),
    }

    const token = await this.jwtService.signAsync(jwtPayload, options)
    const exp = await this.jwtService.decode(token).exp

    await this.tokenRepository.put({
      type: TokenType.AccessToken,
      subject: user.id,
      token,
      expireIn: SecondsToDate(exp),
    })

    return {
      token,
      expiresIn: this.configService.jwtConfig.accessExpiry,
    }
  }

  private generateRefreshToken = async (
    user: User,
    accessToken: string,
  ): Promise<{ token: string; expiresIn: number }> => {
    const expiresIn = 1000 * this.configService.jwtConfig.refreshExpiry
    const expiration = ExpiresInToDate(this.configService.jwtConfig.refreshExpiry)

    const storedToken = await this.tokenRepository.put({
      type: TokenType.RefreshToken,
      subject: user.id,
      token: uuidv4(),
      payload: <AccessTokenPayload>{
        accessToken,
      },
      expireIn: expiration,
    })

    const options: JwtSignOptions = {
      ...this.JWT_BASE_OPTIONS,
      expiresIn,
      subject: String(user.id),
      jwtid: String(storedToken.id),
    }

    const jwtPayload = {}
    const token = await this.jwtService.signAsync(jwtPayload, options)

    await this.tokenRepository.updateToken({ id: storedToken.id, token })

    return {
      token,
      expiresIn,
    }
  }

  private generateTokens = async (user: User): Promise<LoginResponse> => {
    const { token: access, expiresIn } = await this.generateAccessToken(user)
    const { token: refresh } = await this.generateRefreshToken(user, access)
    return new Token({ access, refresh, tokenType: AuthorizationTokenType, expiresIn })
  }
}
